import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceCards, evidencePrompt, renderEvidenceAnswer } from '../evidence-reader.js';
import { allowedArticle, createHandler } from '../../../api/read-article.mjs';
const report = {kind:'article',title:'USA election 2026',url:'https://www.theguardian.com/us-news/example',description:'In this fictional test election in the USA in 2026, the Orange party won the House with 230 seats. These figures are synthetic test data and do not describe a real election.'};
const entries = [{...report,description:report.description + '\n' + 'The Blue party won the Senate in the USA election of 2026 with 51 seats, according to the fictional test commission.'}];
test('article passages retained verbatim; headlines and wrong years rejected',()=>{
 const cards=evidenceCards('USA election 2026',entries);
 assert.ok(cards.length);
 assert.ok(entries[0].description.includes(cards[0].quote));
 assert.equal(evidenceCards('USA election 2026',[{...entries[0],kind:'headline'}]).length,0);
 assert.equal(evidenceCards('USA election 2028',entries).length,0);
 assert.match(evidencePrompt('Who won?',cards),/ONLY JSON/);
});
test('invented names, numbers and unknown evidence IDs never become answer text',()=>{
 const cards=evidenceCards('USA election 2026',entries);
 for(const raw of ['Andrea Bruni won 99 seats','{"evidence":["E99"]}','{"evidence":[]}', '{"evidence":[null]}']) {
  const answer=renderEvidenceAnswer(raw,cards,'it');
  assert.doesNotMatch(answer,/Andrea|99|Orange/);
 }
 const answer=renderEvidenceAnswer('{"evidence":["E1"],"answer":"Andrea Bruni"}',cards,'it');
 assert.ok(answer.includes(cards[0].quote));
 assert.doesNotMatch(answer,/Andrea Bruni/);
});
test('publisher allowlist rejects SSRF, credentials, ports, deceptive hosts',()=>{
 for(const url of ['http://www.bbc.com/a','https://127.0.0.1/','https://www.bbc.com.evil.test/a','https://www.bbc.com@localhost/a','https://www.bbc.com:8080/a','file:///etc/passwd','https://www.bbc.com\\@localhost/a']) assert.equal(allowedArticle(url),false,url);
 assert.equal(allowedArticle('https://www.bbc.com/news/a'),true);
});
test('article endpoint bounds bodies and disables redirects', async()=>{
 let options;
 const handler=createHandler(async(url,opts)=>{options=opts;return new Response('<article>hello</article>',{headers:{'Content-Type':'text/html'}})});
 const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
 await handler({method:'POST',body:{url:'https://www.bbc.com/news/a'}},res);
 assert.equal(res.code,200);assert.equal(options.redirect,'error');
 const large=createHandler(async()=>new Response('x'.repeat(1048577),{headers:{'Content-Type':'text/html'}}));
 await large({method:'POST',body:{url:'https://www.bbc.com/news/a'}},res);assert.equal(res.code,502);
});

test('bounded follow-up searches for missing evidence and deduplicates articles',async()=>{
 const {researchArticles} = await import('../evidence-reader.js');const queries=[];
 const results=await researchArticles('risultati elezioni stati uniti 2026','it',undefined,async q=>{queries.push(q);return queries.length===1?[]:entries});
 assert.equal(queries.length,2);assert.match(queries[1],/election/);assert.equal(results.length,1);
});

test('publication date supplies year context; historical passages remain excluded',()=>{
 const article={...entries[0],date:'2026-11-04',description:entries[0].description.replaceAll('2026','this year')+'\nThe Orange party won the USA election in 2018 with an unusually large majority according to the test commission.'};
 const cards=evidenceCards('USA election 2026',[article]);
 assert.ok(cards.length);assert.ok(cards.every(c=>!c.quote.includes('2018')));
});

test('election outcome questions exclude speculation about the next race',()=>{
 const entry={...entries[0],date:'2026-11-04',description:'With the dust still settling on the USA midterm election results, attention is already turning to the Republicans who might seek to lead the party into the next presidential race. This analysis discusses possible candidates and campaign strategy for the next election.'};
 assert.equal(evidenceCards('USA midterm election results 2026',[entry]).length,0);
});
