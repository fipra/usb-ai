import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Standalone prototype: conversations are never stored by this server.
const port = Number(process.env.LLAMANEST_LAN_PORT || 48180);
const backendPort = Number(process.env.LLAMANEST_BACKEND_PORT || 48181);
const modelDir = resolve(process.env.LLAMANEST_MODELS_DIR || './models');
const executable = process.env.LLAMA_SERVER || 'llama-server';
if (![port, backendPort].every(n => Number.isInteger(n) && n > 0 && n < 65536) || port === backendPort) throw Error('Invalid port');
const page = await readFile(new URL('./index.html', import.meta.url));
const llama = process.env.LLAMANEST_EXTERNAL_BACKEND === '1' ? null : spawn(executable, ['--models-dir', modelDir, '--host', '127.0.0.1', '--port', String(backendPort), '--n-gpu-layers', '99999', '--no-webui'], { stdio: 'inherit', windowsHide: true });
llama?.on('error', error => console.error('Cannot start llama-server:', error.message));
llama?.on('exit', code => console.log('llama-server stopped:', code));
function json(res, status, value) { res.writeHead(status, {'Content-Type':'application/json', 'Cache-Control':'no-store'}); res.end(JSON.stringify(value)); }
async function body(req) { let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 1_000_000) throw Error('Request too large'); } return JSON.parse(data); }
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}); return res.end(page); }
    if (req.method === 'GET' && req.url === '/api/models') {
      const upstream = await fetch(`http://127.0.0.1:${backendPort}/models`);
      if (!upstream.ok) throw Error('Model server unavailable');
      const list = await upstream.json();
      return json(res, 200, {models:(list.data || []).map(item => ({id:item.id})).filter(item => typeof item.id === 'string')});
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
      if (!req.headers.origin || req.headers.origin !== `http://${req.headers.host}`) return json(res, 403, {error:'Origin not allowed'});
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 415, {error:'JSON required'});
      const data = await body(req);
      if (typeof data.model !== 'string' || !Array.isArray(data.messages) || data.messages.length > 100 || data.messages.some(m => !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 100000)) throw Error('Invalid request');
      const modelList = await fetch(`http://127.0.0.1:${backendPort}/models`);
      if (!modelList.ok || !(await modelList.json()).data?.some(model => model.id === data.model)) throw Error('Unknown model');
      const upstream = await fetch(`http://127.0.0.1:${backendPort}/v1/chat/completions`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({model:data.model, messages:data.messages, stream:true, max_tokens:2048})});
      if (!upstream.ok || !upstream.body) throw Error(`Model server: HTTP ${upstream.status}`);
      res.writeHead(200, {'Content-Type':'text/event-stream', 'Cache-Control':'no-store'});
      for await (const chunk of upstream.body) { if (res.destroyed) break; res.write(chunk); }
      return res.end();
    }
    return json(res, 404, {error:'Not found'});
  } catch (error) { if (!res.headersSent) json(res, 500, {error:error.message}); else res.destroy(); }
});
server.listen(port, '0.0.0.0', () => console.log(`LlamaNest LAN: http://HOSTNAME:${port}/ (models: ${modelDir})`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { llama?.kill(); server.close(); });
