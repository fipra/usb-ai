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

// Regression: the user supplied these excerpts. They are test input, not verified election data.
const userQuestion='chi ha vinto le elezioni negli stati uniti 2026 novembre';
const source=(description,title='US midterm elections 2026')=>({...report,title,date:'2026-11-06',description:description+'\n'+('Additional article context. '.repeat(9))});
const control='Trump and Vice-President JD Vance have both blamed the Iran war for Republican losses that allowed Democrats full control of the US House of Representatives and the Senate.';
const local='In Michigan, El-Sayed won a majority of Jewish voters, according to exit polls.';
test('national outcome keeps decisive text without repeating election keywords and excludes voter-group majority',()=>{
 const cards=evidenceCards(userQuestion,[source(local),source(control)]);
 assert.ok(cards.some(c=>c.quote===control));
 assert.ok(cards.every(c=>!c.quote.includes('Jewish voters')));
 const answer=renderEvidenceAnswer('{"evidence":["E99"]}',cards,'it');
 assert.match(answer,/Democratici.*Camera.*Senato/);
 assert.match(answer,/\[2\]/);
 assert.doesNotMatch(answer,/El-Sayed|2026|253/);
});
test('best evidence after the first six passages survives the global context budget',()=>{
 const irrelevant=Array.from({length:5},()=>source(local));
 const cards=evidenceCards(userQuestion,[...irrelevant,source(control)]);
 assert.equal(cards[0].source,6);
 assert.match(renderEvidenceAnswer('{"evidence":[]}',cards,'it'),/\[6\]/);
});
test('forecasts, negation, old years and local seat gains do not establish national control',()=>{
 for(const text of ['Democrats could win control of the House and Senate.', 'Democrats have not won control of the House and Senate.', 'Democrats won control of the House and Senate in 2018.', 'Democrats won three Senate seats in this election.',local]) {
  const cards=evidenceCards(userQuestion,[source(text)]);
  assert.equal(cards.length,0,text);
 }
});
test('opposite winners come from source text, and conflicting sources are exposed',()=>{
 const republican='Republicans won control of the House and Senate in this US election.';
 const cards=evidenceCards(userQuestion,[source(republican)]);
 assert.match(renderEvidenceAnswer('{}',cards,'it'),/Repubblicani.*Camera.*Senato/);
 const conflict=evidenceCards(userQuestion,[source(control),source(republican)]);
 assert.match(renderEvidenceAnswer('{}',conflict,'it'),/discordanti/);
});
test('one chamber does not imply both; local questions are not converted into national questions',()=>{
 const cards=evidenceCards(userQuestion,[source('Democrats won control of the House in this US election.')]);
 const answer=renderEvidenceAnswer('{}',cards,'it');
 assert.match(answer,/Camera/);assert.doesNotMatch(answer,/Senato/);
 const localCards=evidenceCards('Who won the Michigan election 2026?',[source(local)]);
 assert.ok(localCards.length);assert.ok(localCards.every(c=>!c.national));
});

test('a percentage follow-up carries context into evidence selection, not the previous winner summary',async()=>{
 const {webSearchQuery}=await import('../web-search.js');
 const {evidenceMissing}=await import('../evidence-reader.js');
 const resolved=webSearchQuery('mi si cercare le percentuali??',[{role:'user',text:userQuestion}]);
 const percent='In this fictional US election, the Orange party won 52.4% of the national vote, with counting still incomplete.';
 const poll='A poll found 56% of voters said data centres were a crucial factor in their vote.';
 const cards=evidenceCards(resolved,[source(control),source(poll),source(percent)]);
 assert.equal(cards.length,1);assert.equal(cards[0].quote,percent);assert.equal(cards[0].national,false);
 assert.match(evidencePrompt(resolved,cards),/2026 novembre.*percentuali/);
 const answer=renderEvidenceAnswer('{"evidence":["E1"]}',cards,'it');
 assert.match(answer,/52.4%/);assert.match(answer,/incomplete/);assert.doesNotMatch(answer,/controllo della Camera|56%/);
 assert.equal(evidenceCards(resolved,[source(control),source(poll)]).length,0);
 assert.match(evidenceMissing(resolved,'it'),/percentuali pertinenti/);
});

test('public article cache expires and evicts with a bounded memory footprint',async()=>{
 const {createArticleCache}=await import('../evidence-reader.js');let now=0;const cache=createArticleCache(2,60,()=>now);
 cache.put('a',{description:'A'});cache.put('b',{description:'B'});const a=cache.get('a');a.description='changed';assert.equal(cache.get('a').description,'A');
 cache.put('c',{description:'C'});assert.equal(cache.get('b'),null);assert.equal(cache.size,2);now=60;assert.equal(cache.get('a'),null);
});
test('useful follow-up articles displace a full irrelevant first batch',async()=>{
 const {researchArticles}=await import('../evidence-reader.js');let calls=0;
 const irrelevant=Array.from({length:6},(_,i)=>({...source(local),url:`https://www.bbc.com/${i}`}));
 const result=await researchArticles(userQuestion,'it',undefined,async()=>++calls===1?irrelevant:[{...source(control),url:'https://www.bbc.com/decisive'}]);
 assert.equal(calls,2);assert.equal(result.length,6);assert.equal(result[0].url,'https://www.bbc.com/decisive');
});

test('article reader limits concurrency, reuses fresh content and honors cancellation',async()=>{
 const {readCandidates}=await import('../evidence-reader.js');
 const previousFetch=globalThis.fetch,previousParser=globalThis.DOMParser;let active=0,peak=0,calls=0;
 const paragraph='A public article with enough text for extraction. '.repeat(8);
 globalThis.DOMParser=class{parseFromString(){return {querySelectorAll:()=>[],querySelector:selector=>selector==='main'?{querySelectorAll:()=>[{textContent:paragraph}]}:null};}};
 globalThis.fetch=async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return {ok:true,json:async()=>({html:'<main>fixture</main>'})};};
 const entries=Array.from({length:8},(_,i)=>({url:`https://www.bbc.com/bounded-${i}`,title:'Fixture'}));
 try{
  const first=await readCandidates(entries,'/test-reader');assert.equal(first.length,6);assert.equal(calls,6);assert.ok(peak<=3);
  await readCandidates(entries,'/test-reader');assert.equal(calls,6);
  const controller=new AbortController();controller.abort();await assert.rejects(readCandidates(entries,'/test-reader',controller.signal));assert.equal(calls,6);
 }finally{globalThis.fetch=previousFetch;globalThis.DOMParser=previousParser;}
});
