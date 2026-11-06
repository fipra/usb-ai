"""Test ToolMind search requests and saved sources with real Prism CPU inference."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

package, model, prism_server = (Path(arg).resolve() for arg in sys.argv[1:4])
assert (package / 'PRISM_ONLY').is_file()
assert os.access(package / 'bin/prism/llama-server', os.X_OK)
assert (package / 'bin/prism/libggml-metal.0.dylib').is_file()
http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with tempfile.TemporaryDirectory(prefix='llamanest-official-prism-test-') as temp:
    root = Path(temp)
    (root / 'models').mkdir()
    (root / 'PRISM_ONLY').write_text('PrismML only\n')
    (root / 'models' / model.name).symlink_to(model)
    env = dict(os.environ, USB_AI_DIR=str(root), POCKET_AI_HOME=str(root / 'data'), LLAMA_PRISM_SERVER=str(prism_server))
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
                raise RuntimeError(f'API error: {error.read().decode()}') from error
        state = post({'action':'state'})
        assert state['prismOnly'] and state['inferenceEngine'] == 'prism', state
        post({'action':'select-model', 'name':model.name})
        post({'action':'set-inference-options', 'backend':'cpu', 'threads':4})
        post({'action':'set-generation-options', 'contextSize':4096, 'outputLimit':1024, 'temperature':0})
        chat_id = post({'action':'new-chat'})['id']
        stream_data = {'chatId':chat_id, 'requestId':'test-agent-plan', 'text':'Search the web for the official NASA Artemis II launch date. Use the search tool.', 'agentPlan':True}
        request = urllib.request.Request(base + '/api/stream', data=json.dumps(stream_data).encode(), headers={'Origin':base, 'Content-Type':'application/json'})
        with http.open(request, timeout=1200) as response:
            events = [json.loads(line) for line in response if line.strip()]
        assert events and events[-1]['type'] == 'done', events
        output = events[-1]['state']['output']
        parser = Path(__file__).resolve().with_name('agent-web-search.js')
        parsed = subprocess.run(['node', '-e', 'const {agentWebQuery}=require(process.argv[1]);let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>process.stdout.write(agentWebQuery(s)||""))', str(parser)], input=output, text=True, capture_output=True, check=True).stdout
        if not parsed:
            raise AssertionError('ToolMind did not produce a valid web search request: ' + output[-3000:])
        print('ToolMind requested web search:', parsed)
        source = {'title':'Example source', 'url':'https://example.org/', 'description':'The capital of France is Paris.'}
        state = post({'action':'send', 'chatId':chat_id, 'text':'What is the capital of France? Answer briefly.', 'webSources':[source]}, timeout=600)
        answer = next(c for c in state['chats'] if c['id'] == chat_id)['messages'][-1]
        assert answer['text'].strip(), 'Empty model response'
        assert any(item['docId'] == 'web:https://example.org/' for item in answer['sources']), answer
        print('Official Prism app generated on CPU and saved the web source.')
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
