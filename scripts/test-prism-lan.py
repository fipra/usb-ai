#!/usr/bin/env python3
"""Verify the packaged Windows LAN launcher accepts a hostname request."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

package = Path(sys.argv[1]).resolve()
launcher = package / 'Avvia LlamaNest Prism LAN.cmd'
environment = os.environ.copy()
environment.pop('USB_AI_BIND_ADDR', None)
environment['LLAMANEST_PRISM_CPU'] = '1'
environment['LLAMANEST_TEST_NO_PAUSE'] = '1'
with tempfile.TemporaryDirectory() as directory:
    # A broken extraction must explain the missing executable and return an error.
    import shutil
    for name in ('Avvia LlamaNest Prism.cmd', 'Avvia LlamaNest Prism LAN.cmd'):
        shutil.copy2(package / name, Path(directory) / name)
    failed = subprocess.run(['cmd.exe', '/d', '/c', str(Path(directory) / launcher.name)],
                            env=environment, capture_output=True, text=True, timeout=15)
    if failed.returncode == 0 or 'usb-ai-rust.exe not found' not in failed.stdout:
        raise RuntimeError(f'Unexpected missing executable result: {failed.stdout} {failed.stderr}')
process = subprocess.Popen(['cmd.exe', '/d', '/c', str(launcher)], env=environment,
                           creationflags=subprocess.CREATE_NO_WINDOW)
try:
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('LAN launcher exited before serving requests')
        for port in range(48157, 48168):
            request = urllib.request.Request(f'http://127.0.0.1:{port}/',
                                             headers={'Host': f'lan-test:{port}'})
            try:
                with urllib.request.urlopen(request, timeout=1) as response:
                    if response.status == 200 and b'LlamaNest' in response.read():
                        print(f'LAN hostname request succeeded on port {port}')
                        sys.exit(0)
            except (urllib.error.URLError, TimeoutError):
                pass
        time.sleep(0.5)
    raise RuntimeError('LAN hostname request failed: server may still be bound to localhost')
finally:
    subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
