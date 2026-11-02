"""Check isolation through the real Windows HTTP server."""
import json
import hashlib
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
with tempfile.TemporaryDirectory(prefix='llamanest-lan-test-') as directory:
    env = dict(os.environ, USB_AI_BIND_ADDR='0.0.0.0', USB_AI_DIR=str(package), POCKET_AI_HOME=directory, LLAMANEST_MODEL_CODE_SHA256=hashlib.sha256(b'test-only-code').hexdigest())
    process = subprocess.Popen([str(package / 'bin/usb-ai-rust.exe')], env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    try:
        deadline = time.monotonic() + 30
        port = None
        while port is None and time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError('LAN server exited unexpectedly')
            for candidate in range(48157, 48168):
                try:
                    with http.open(f'http://127.0.0.1:{candidate}/', timeout=1) as response:
                        if b'llamanest-prism-lan-browser-session-v1' in response.read():
                            port = candidate
                            break
                except (urllib.error.URLError, TimeoutError):
                    pass
            time.sleep(.2)
        if port is None: raise RuntimeError('Server did not start')
        base = f'http://127.0.0.1:{port}'
        def post(path, data, session):
            headers = {'Origin': base, 'Content-Type':'application/json'}
            if session: headers['X-LlamaNest-Session'] = session
            payload = data if isinstance(data, bytes) else json.dumps(data).encode()
            with http.open(urllib.request.Request(base + path, data=payload, headers=headers), timeout=10) as response:
                return json.load(response)
        a, b = 'a'*64, 'b'*64
        chat = post('/api', {'action':'new-chat'}, a)['id']
        post('/upload/' + chat + '/private.txt', b'Private document belonging to A', a)
        state_a = post('/api', {'action':'state'}, a)
        state_b = post('/api', {'action':'state'}, b)
        assert len(state_a['chats']) == 1 and len(state_a['documents']) == 1
        assert not state_b['chats'] and not state_b['documents']
        post('/api', {'action':'delete-chat', 'id':chat}, b)
        assert len(post('/api', {'action':'state'}, a)['chats']) == 1
        try: post('/api', {'action':'state'}, None)
        except urllib.error.HTTPError as error: assert error.code == 403
        else: raise AssertionError('Missing browser session accepted')
        # Direct API calls must not bypass model restrictions.
        for action in ('select-model', 'download-model', 'download-hub', 'choose-local-model', 'start-quantize'):
            try: post('/api', {'action':action, 'name':'nonexistent.gguf', 'modelId':'invalid'}, b)
            except urllib.error.HTTPError as error:
                assert b'Model management code required' in error.read(), action
            else: raise AssertionError(f'Unprotected model action: {action}')
        try: post('/import-model/blocked.gguf', b'GGUF', b)
        except urllib.error.HTTPError as error: assert error.code == 403
        else: raise AssertionError('Model import not protected')
        headers = {'Origin': base, 'Content-Type':'application/json', 'X-LlamaNest-Session': a,
                   'X-LlamaNest-Model-Code': 'test-only-code'}
        payload = json.dumps({'action':'select-model', 'name':'nonexistent.gguf'}).encode()
        try: http.open(urllib.request.Request(base + '/api', data=payload, headers=headers), timeout=10)
        except urllib.error.HTTPError as error:
            assert b'Model management code required' not in error.read()
        else: raise AssertionError('Nonexistent model unexpectedly accepted')
        print('Browser isolation and model access restrictions verified through HTTP')
    finally:
        subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
