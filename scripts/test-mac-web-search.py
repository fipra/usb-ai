"""Test a packaged Mac build and persist web citations with a real local GGUF."""
import json
import os
import shlex
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

package, model = map(lambda x: Path(x).resolve(), sys.argv[1:3])
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with tempfile.TemporaryDirectory(prefix='llamanest-search-test-') as temp:
    root = Path(temp)
    (root / 'models').mkdir()
    (root / 'models' / model.name).symlink_to(model)
    env = dict(os.environ, USB_AI_DIR=str(root), POCKET_AI_HOME=str(root / 'data'))
    wrapper = root / 'server-with-log'
    server_binary = os.environ.get('LLAMA_SEARCH_TEST_SERVER', str(package / 'bin/llama-server'))
    wrapper.write_text('#!/bin/sh\nexec ' + shlex.quote(server_binary) + ' "$@" 2>>' + shlex.quote(str(root / 'app-server.log')) + '\n')
    wrapper.chmod(0o755)
    env['LLAMA_SERVER'] = str(wrapper)
    server = subprocess.Popen([str(package / 'bin/usb-ai-rust')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = 'http://127.0.0.1:48157'
        for _ in range(100):
            try:
                with http.open(base + '/', timeout=1) as response:
                    html = response.read().decode()
                    assert 'web-search-toggle' in html and 'https://puri.li' in html
                    break
            except (OSError, urllib.error.URLError):
                if server.poll() is not None:
                    raise RuntimeError('LlamaNest exited during startup')
                time.sleep(.2)
        else:
            raise RuntimeError('LlamaNest did not start')
        def post(data, timeout=30):
            request = urllib.request.Request(base + '/api', data=json.dumps(data).encode(), headers={'Origin':base, 'Content-Type':'application/json'})
            try:
                with http.open(request, timeout=timeout) as response:
                    return json.load(response)
            except urllib.error.HTTPError as error:
                diagnostic = (root / 'app-server.log').read_text(errors='replace')[-6000:] if (root / 'app-server.log').exists() else ''
                raise RuntimeError(f'API error: {error.read().decode()}\nServer log: {diagnostic}') from error
        post({'action':'set-inference-options', 'backend':'cpu', 'threads':4})
        post({'action':'set-generation-options', 'contextSize':4096, 'outputLimit':1024, 'temperature':0})
        chat_id = post({'action':'new-chat'})['id']
        source = {'title':'Example source', 'url':'https://example.org/', 'description':'The capital of France is Paris.'}
        state = post({'action':'send', 'chatId':chat_id, 'text':'What is the capital of France? Answer briefly.', 'webSources':[source]}, timeout=600)
        answer = next(c for c in state['chats'] if c['id'] == chat_id)['messages'][-1]
        assert answer['text'].strip(), 'Empty model response'
        assert any(item['docId'] == 'web:https://example.org/' for item in answer['sources']), answer
        print('Packaged local model returned a response with its web source.')
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
