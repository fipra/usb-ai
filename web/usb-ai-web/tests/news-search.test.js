import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNewsResults, newsQuestion, newsMatchScore } from '../news-search.js';

test('news context retains useful feed text and rejects unsafe links', () => {
  const text = 'A detailed report about the election. '.repeat(40);
  const results = prepareNewsResults([
    {title:'Election report',url:'https://example.org/news',description:text},
    {title:'Unsafe',url:'javascript:alert(1)',description:'x'}
  ]);
  assert.equal(results.length,1);
  assert.ok(results[0].description.length > 450);
  assert.ok(results[0].description.length <= 1800);
  const prompt = newsQuestion('What happened?', results);
  assert.match(prompt,/not full articles/);
  assert.match(prompt,/Do not fill gaps from memory/);
  assert.match(prompt,/A detailed report/);
});

test('unrelated RSS stories do not match fragments within other words', () => {
  const query = 'risultati elezioni stati uniti 2026 novembre';
  assert.equal(newsMatchScore(query, {title:'Food grown in illegal West Bank settlements',description:'RSS summary; published Wed, 04 Nov 2026: Food is being sold in Australia by an organisation.'}), 0);
  assert.ok(newsMatchScore(query, {title:'Le elezioni di metà mandato negli Stati Uniti',description:'Google News headline only; published Tue, 03 Nov 2026: Le elezioni negli Stati Uniti'}) >= 2);
  assert.ok(newsMatchScore(query, {title:'Elezioni Usa, trionfo democratico tra Camera e Senato',description:'Google News headline only; published Wed, 04 Nov 2026: Elezioni Usa, trionfo democratico'}) >= 2);
});

test('six article sources retain their citation order',()=>{
 const results=prepareNewsResults(Array.from({length:6},(_,i)=>({title:`Source ${i+1}`,url:`https://example.org/${i+1}`,description:'The actual article text.'})));
 assert.equal(results.length,6);assert.equal(results[5].title,'Source 6');
});
