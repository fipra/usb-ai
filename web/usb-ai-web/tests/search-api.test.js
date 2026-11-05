import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../../../api/web-search.mjs';

function response() { return {headers:{}, setHeader(k,v){this.headers[k]=v;}, status(n){this.code=n;return this;}, json(data){this.data=data;return this;}}; }
test('search forwards only the query and user key to the fixed provider', async () => {
  let sent;
  const handler = createHandler(async (url, options) => { sent={url,options}; return {ok:true, json:async()=>({web:{results:[{title:'Title',url:'https://example.org',description:'Excerpt',extra:'private'}]}})}; });
  const res=response();
  await handler({method:'POST',body:{query:'hello world',key:'valid-key-123',language:'it'}},res);
  assert.equal(res.code,200);
  assert.equal(new URL(sent.url).hostname,'api.search.brave.com');
  assert.equal(new URL(sent.url).searchParams.get('q'),'hello world');
  assert.equal(sent.options.headers['X-Subscription-Token'],'valid-key-123');
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
