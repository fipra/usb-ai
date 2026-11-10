#!/usr/bin/env python3
"""Experimental GPU-only MLX adapter for the pinned Qwen3.5 Astra checkpoint."""
import argparse
import hashlib
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, required=True)
parser.add_argument('--model', required=True)
args = parser.parse_args()
weights = Path(args.model) / 'model.safetensors-00001-of-00001.safetensors'
if weights.stat().st_size != 1746943032:
    raise SystemExit('Invalid Astra model size')
with weights.open('rb') as f:
    if hashlib.file_digest(f, 'sha256').hexdigest() != 'fd1e42acdd118ac1b300d37500fd2885e75f5a09de3a33010d802bf7f737b553':
        raise SystemExit('Invalid Astra model SHA-256')

import mlx.core as mx
from mlx_vlm import load, stream_generate
mx.set_default_device(mx.gpu)
model, processor = load(args.model, strict=True)
tokenizer = processor.tokenizer if hasattr(processor, 'tokenizer') else processor
lock = threading.Lock()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def json_response(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        self.json_response(200 if self.path == '/health' else 404, {'status': 'ok'})
    def do_POST(self):
        started = False
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 2_000_000: return self.json_response(400, {'error':'Invalid request'})
            data = json.loads(self.rfile.read(length))
            if self.path == '/apply-template':
                prompt = tokenizer.apply_chat_template(data['messages'], tokenize=False, add_generation_prompt=True, enable_thinking=data.get('chat_template_kwargs', {}).get('enable_thinking', False))
                return self.json_response(200, {'prompt': prompt})
            if self.path != '/completion': return self.json_response(404, {'error':'Not found'})
            prompt = data['prompt']
            limit = max(1, min(int(data.get('n_predict', 1024)), 16384))
            temperature = float(data.get('temperature', 0.3))
            self.send_response(200); self.send_header('Content-Type', 'text/event-stream'); self.send_header('Cache-Control', 'no-cache'); self.end_headers(); started = True
            with lock:
                for result in stream_generate(model, processor, prompt, max_tokens=limit, temperature=temperature, skip_special_tokens=True):
                    if result.text:
                        self.wfile.write(('data: ' + json.dumps({'content': result.text}) + '\n\n').encode()); self.wfile.flush()
                self.wfile.write(b'data: {"stop":true}\n\n'); self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception as error:
            try:
                if started:
                    self.wfile.write(('data: ' + json.dumps({'error': str(error)}) + '\n\n').encode()); self.wfile.flush()
                else: self.json_response(500, {'error':str(error)})
            except (BrokenPipeError, ConnectionResetError): pass

ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
