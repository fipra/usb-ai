const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('news search sends the query locally and excludes headline-only sources', async () => {
  const calls = [];
  const item = {querySelector: name => name==='source'?null:({textContent: {title:'Election results - Example', link:'https://news.google.com/articles/example', pubDate:'Fri, 06 Nov 2026 06:00:00 GMT'}[name]})};
  const context = vm.createContext({URL, window:{USB_AI_I18N:{en:{},it:{},fr:{},de:{},es:{}}},
    DOMParser: class { parseFromString() { return {querySelector: () => null, querySelectorAll: () => [item]}; } },
    readCandidates: async rows => rows,
    discoverPublisherArticles: async () => [],
    researchArticles: async (query,lang,signal,search) => search(query,lang,signal),
    fetch: async (url, options) => { calls.push({url, options}); return {ok:true, text:async()=>'<rss />'}; }
  });
  vm.runInContext(fs.readFileSync('scripts/mac-news-search.js', 'utf8'), context);
  const results = await context.searchGoogleNews('election results', 'en');
  assert.equal(calls.find(c=>c.url==='/news-search').url, '/news-search');
  assert.equal(JSON.parse(calls.find(c=>c.url==='/news-search').options.body).query, 'election results');
  assert.equal(results.length, 0);
  assert.match(context.window.USB_AI_I18N.it.webSearchPrivacy, /Google News/);
});
