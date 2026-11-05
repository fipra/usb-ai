import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWebResults, webSearchQuestion, webSearchQuery, searchWeb } from '../web-search.js';

test('follow-up searches keep the topic while new subjects stay independent', () => {
  const history = [{role:'user', text:'la teoria della relativita'}, {role:'assistant', text:'Einstein'}];
  assert.equal(webSearchQuery('scrivi le formule', history), 'la teoria della relativita scrivi le formule');
  assert.equal(webSearchQuery('chi è Giorgia Meloni?', history), 'chi è Giorgia Meloni?');
  assert.equal(webSearchQuery('spiega la fotosintesi', history), 'spiega la fotosintesi');
  assert.equal(webSearchQuery('scrivi le formule', []), 'scrivi le formule');
  assert.equal(webSearchQuery('spiega questa', [...history,{role:'user',text:'scrivi le formule'}]), 'la teoria della relativita spiega questa');
});

test('web results reject unsafe links, are bounded and are treated as untrusted', () => {
  const results = prepareWebResults([
    {title:'<b>One</b>',url:'https://example.org/path',description:'A useful source'},
    {title:'Bad',url:'javascript:alert(1)',description:'Bad'},
    {title:'Credentials',url:'https://user:pass@example.org/',description:'Bad'},
    ...Array.from({length:5}, (_, i) => ({title:`Source ${i}`,url:`https://example.org/${i}`,description:'x'.repeat(900)}))
  ]);
  assert.equal(results.length, 3);
  assert.equal(results[0].title, 'One');
  assert.equal(results[1].description.length, 450);
  const question = webSearchQuestion('What happened?', results);
  assert.match(question, /untrusted source material/);
  assert.match(question, /conversation, your knowledge and the web excerpts/);
  assert.match(question, /\[1\] One/);
  assert.match(question, /User question: What happened\?/);
});

test('free search sends only the question to the fixed provider without credentials', async () => {
  const requests = [];
  const results = await searchWeb('ciclo acqua', undefined, async (url, options) => {
    requests.push({url, options});
    return {ok:true, json:async()=>url.endsWith('/context') ? {summary:'Relevant passage'} : {results:[{title:'Example',url:'https://example.org/',description:'Excerpt'}]}};
  });
  const request = requests[0];
  assert.equal(request.url, 'https://puri.li/api/search');
  assert.deepEqual(JSON.parse(request.options.body), {q:'ciclo acqua'});
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(results[0].title, 'Example');
  assert.equal(results[0].description, 'Relevant passage');
  assert.equal(requests[1].url, 'https://puri.li/api/context');
  await assert.rejects(searchWeb('x', undefined, async()=>({ok:false,status:429})), /WEB_SEARCH_LIMIT/);
});
