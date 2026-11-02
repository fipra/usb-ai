import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
test('serves browser app and proxies chat without exposing conversation history', async () => {
  let received;
  const backend = http.createServer(async (req, res) => {
    if (req.url === '/models') { res.writeHead(200, {'Content-Type':'application/json'}); return res.end(JSON.stringify({data:[{id:'bonsai'}]})); }
    let text=''; for await (const chunk of req) text+=chunk; received=JSON.parse(text);
    res.writeHead(200, {'Content-Type':'text/event-stream'}); res.end('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n');
  });
  const backendPort=await listen(backend), reservation=http.createServer(), port=await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const child=spawn(process.execPath, ['lan-experimental/server.mjs'], {env:{...process.env, LLAMANEST_EXTERNAL_BACKEND:'1', LLAMANEST_LAN_PORT:String(port), LLAMANEST_BACKEND_PORT:String(backendPort)}, stdio:['ignore','pipe','pipe']});
  try {
    await Promise.race([once(child.stdout,'data'), new Promise((_,reject)=>setTimeout(()=>reject(Error('server timeout')),10000))]);
    const base=`http://127.0.0.1:${port}`;
    assert.equal((await fetch(base+'/')).status,200);
    assert.deepEqual(await (await fetch(base+'/api/models')).json(),{models:[{id:'bonsai'}]});
    const body=JSON.stringify({model:'bonsai',messages:[{role:'user',content:'private message'}]});
    assert.equal((await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Origin':'http://other.example'},body})).status,403);
    const reply=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body});
    assert.match(await reply.text(),/\[DONE\]/); assert.equal(received.messages[0].content,'private message');
    assert.equal((await fetch(base+'/api/chats')).status,404);
  } finally { child.kill(); backend.close(); }
});
