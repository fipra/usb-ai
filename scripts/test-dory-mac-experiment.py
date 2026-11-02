"""Exercise the packaged application with the actual Dory GGUF on CPU."""
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
model = Path(sys.argv[2]).resolve()
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with tempfile.TemporaryDirectory(prefix='llamanest-dory-test-') as temp:
    root = Path(temp)
    (root / 'models').mkdir()
    (root / 'models' / model.name).symlink_to(model)
    env = dict(os.environ, USB_AI_DIR=str(root), POCKET_AI_HOME=str(root / 'data'))
    env.pop('USB_AI_GPU', None)
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
                    raise RuntimeError('LlamaNest exited during startup')
                time.sleep(.2)
        else:
            raise RuntimeError('LlamaNest did not start')
        def post(data, timeout=30):
            request = urllib.request.Request(base + '/api', data=json.dumps(data).encode(), headers={'Origin': base, 'Content-Type':'application/json'})
            with http.open(request, timeout=timeout) as response:
                return json.load(response)
        post({'action':'set-inference-options', 'backend':'cpu', 'threads':4})
        post({'action':'set-generation-options', 'contextSize':4096, 'outputLimit':0, 'temperature':0})
        state = post({'action':'state'})
        assert state['model'] == model.name, state['model']
        chat_id = post({'action':'new-chat'})['id']
        state = post({'action':'send', 'chatId':chat_id, 'text':'What is the capital of France? Answer with one word.'}, timeout=600)
        answer = state['chats'][0]['messages'][-1]['text']
        assert 'paris' in answer.lower(), answer
        print('Packaged LlamaNest generated a Dory response on CPU:', answer[:150])
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
