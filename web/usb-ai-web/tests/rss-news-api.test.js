import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../../../api/rss-news.mjs';

test('news endpoint fetches only fixed feeds and encodes the search query', async () => {
  const urls = [];
  const handler = createHandler(async url => {
    urls.push(new URL(url));
    return new Response('<rss/>', {status:200});
  });
  const res = {setHeader(){}, status(code){this.code=code;return this;}, json(body){this.body=body;return this;}};
  await handler({method:'POST',body:{query:'elections & news',language:'it',url:'http://127.0.0.1/'}},res);
  assert.equal(res.code,200);
  assert.equal(urls.length,7);
  assert.equal(urls[1].hostname,'news.google.com');
  assert.equal(urls[1].searchParams.get('q'),'elections & news');
  assert.deepEqual(urls.slice(2).map(url=>url.hostname), ['feeds.bbci.co.uk','www.theguardian.com','www.ansa.it','feeds.bbci.co.uk','www.theguardian.com']);
  assert.equal(res.body.feeds.length,5);
});

test('news endpoint rejects empty or oversized queries', async () => {
  const handler = createHandler(() => {throw Error('unexpected fetch');});
  for (const query of ['', 'a'.repeat(601)]) {
    const res = {setHeader(){},status(code){this.code=code;return this;},json(){return this;}};
    await handler({method:'POST',body:{query}},res);
    assert.equal(res.code,400);
  }
});
