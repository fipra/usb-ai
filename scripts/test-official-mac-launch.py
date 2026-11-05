"""Check the repaired package starts locally and exposes the Prism engine."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

package = Path(sys.argv[1]).resolve()
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with tempfile.TemporaryDirectory(prefix='llamanest-launch-test-') as temp:
    env = dict(os.environ, USB_AI_DIR=str(package), POCKET_AI_HOME=temp)
    server = subprocess.Popen([str(package / 'bin/usb-ai-rust')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = 'http://127.0.0.1:48157'
        for _ in range(100):
            try:
                with http.open(base + '/', timeout=1) as response:
                    if response.status == 200:
                        break
            except (OSError, urllib.error.URLError):
                if server.poll() is not None:
                    raise RuntimeError('Application exited at startup')
                time.sleep(.2)
        else:
            raise RuntimeError('Application did not start')
        request = urllib.request.Request(base + '/api', data=b'{"action":"state"}', headers={'Origin':base, 'Content-Type':'application/json'})
        with http.open(request, timeout=10) as response:
            state = json.load(response)
        assert state['prismAvailable'], 'PrismML was not detected'
        assert state['inferenceEngine'] == 'prism', state
        print('Application started locally and detected PrismML.')
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
