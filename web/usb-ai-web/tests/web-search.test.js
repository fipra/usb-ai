import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWebResults, webSearchQuestion } from '../web-search.js';

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
  assert.match(question, /\[1\] One/);
  assert.match(question, /User question: What happened\?/);
});
