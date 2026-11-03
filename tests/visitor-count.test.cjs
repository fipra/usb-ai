const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/visitor-count.js');
const originalFetch = global.fetch;
const originalEnv = { ...process.env };
after(() => { global.fetch = originalFetch; process.env = originalEnv; });
function response() { return { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; } }; }
test('counts distinct IP addresses without storing the IP itself', async () => {
  Object.assign(process.env, { KV_REST_API_URL:'https://redis.example', KV_REST_API_TOKEN:'test', VISITOR_COUNT_SECRET:'secret' });
  const seen = new Set();
  global.fetch = async (url, options) => {
    const commands = JSON.parse(options.body); seen.add(commands[0][2]);
    assert.notEqual(commands[0][2], '192.0.2.1');
    return { ok:true, json:async () => [{ result:1 }, { result:seen.size }] };
  };
  for (const [ip, expected] of [['192.0.2.1',1], ['192.0.2.1',1], ['192.0.2.2',2]]) {
    const res=response(); await handler({method:'POST',headers:{'x-vercel-forwarded-for':ip}},res);
    assert.equal(res.code,200); assert.equal(res.body.count,expected);
  }
});
test('fails closed when the trusted IP is missing', async () => {
  const res=response(); await handler({method:'POST',headers:{}},res);
  assert.equal(res.code,503);
});
