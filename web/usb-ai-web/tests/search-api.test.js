import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../../../api/web-search.mjs';

function response() { return {headers:{}, setHeader(k,v){this.headers[k]=v;}, status(n){this.code=n;return this;}, json(data){this.data=data;return this;}}; }
test('search forwards only the query and user key to the fixed provider', async () => {
  let sent;
  const handler = createHandler(async (url, options) => { sent={url,options}; return {ok:true, json:async()=>({results:[{title:'Title',url:'https://example.org',content:'Excerpt',extra:'private'}]})}; });
  const res=response();
  await handler({method:'POST',body:{query:'hello world',key:'valid-key-123',language:'it'}},res);
  assert.equal(res.code,200);
  assert.equal(new URL(sent.url).hostname,'api.tavily.com');
  assert.equal(sent.options.method,'POST');
  assert.equal(JSON.parse(sent.options.body).query,'hello world');
  assert.equal(JSON.parse(sent.options.body).search_depth,'basic');
  assert.equal(sent.options.headers.Authorization,'Bearer valid-key-123');
  assert.deepEqual(res.data.results,[{title:'Title',url:'https://example.org',description:'Excerpt'}]);
  assert.equal(res.headers['Cache-Control'],'no-store');
});
test('invalid requests fail before contacting search and provider errors do not leak secrets', async () => {
  let called=false;
  const handler=createHandler(async()=>{called=true;throw Error('secret')});
  let res=response(); await handler({method:'POST',body:{query:'x',key:'bad\nkey'}},res);
  assert.equal(res.code,400); assert.equal(called,false);
  res=response(); await handler({method:'POST',body:{query:'x',key:'valid-key-123'}},res);
  assert.equal(res.code,502); assert.deepEqual(res.data,{error:'SEARCH_UNAVAILABLE'});
});
test('Tavily usage limits are distinguished from service failures', async () => {
  const res=response();
  await createHandler(async()=>({ok:false,status:432}))({method:'POST',body:{query:'x',key:'valid-key-123'}},res);
  assert.equal(res.code,429);
  assert.deepEqual(res.data,{error:'SEARCH_LIMIT'});
});
