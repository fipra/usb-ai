import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareWebResults, webSearchQuestion, webSearchQuery, searchWeb, researchPlan, relevantResearchSource, researchPassages, publicResearchURL } from '../web-search.js';
const question = 'Quando è stata lanciata Europa Clipper e quando arriverà a Giove? Rispondi in italiano in due frasi.';
const mission = 'Europa Clipper launched on October 14, 2024. It will enter Jupiter orbit in April 2030. An Earth flyby is planned in December 2026.';
const result = {title:'Europa Clipper',url:'https://science.nasa.gov/mission/europa-clipper/',description:'Europa Clipper studies Jupiter’s icy moon.'};
const ok = data => ({ok:true,json:async()=>data});
function fakeResearch({wiki=true, fail=false}={}) {
  const requests=[];
  return {requests, fetcher:async(url,options)=>{
    requests.push({url,options});
    if(url.includes('wikipedia.org'))return wiki?ok({query:{pages:{1:{title:'Europa Clipper',fullurl:'https://en.wikipedia.org/wiki/Europa_Clipper',extract:mission}}}}):{ok:false,status:503};
    if(url.endsWith('/search'))return fail?{ok:false,status:429}:ok({results:[{title:'Europe quantum technology',url:'https://www.ansa.it/quantum',description:'News from Europe'},result]});
    if(url==='/api/read-article')return {ok:false,status:404};
    if(url.endsWith('/context'))return ok({summary:'Europa Clipper launched successfully.'});
    throw Error('Unexpected URL: '+url);
  }};
}
test('follow-up searches retain their topic while new subjects remain independent',()=>{
  const history=[{role:'user',text:'la teoria della relativita'},{role:'assistant',text:'Einstein'}];
  assert.equal(webSearchQuery('scrivi le formule',history),'la teoria della relativita scrivi le formule');
  assert.equal(webSearchQuery('chi è Giorgia Meloni?',history),'chi è Giorgia Meloni?');
  assert.equal(webSearchQuery('spiega la fotosintesi',history),'spiega la fotosintesi');
  assert.equal(webSearchQuery('scrivi le formule',[]),'scrivi le formule');
  assert.equal(webSearchQuery('spiega questa',[...history,{role:'user',text:'scrivi le formule'}]),'la teoria della relativita spiega questa');
  assert.match(webSearchQuery('Controlla la fonte NASA',[{role:'user',text:question}]),/Europa Clipper/);
});
test('plans remove response instructions and retain entities and explicit publisher restrictions',()=>{
  assert.equal(researchPlan(question).query,'Europa Clipper');
  assert.equal(researchPlan('Quando è stato lanciato James Webb?').query,'James Webb');
  assert.equal(researchPlan('Come funziona la fotosintesi?').query,'fotosintesi');
  assert.equal(researchPlan('Come funziona la fotosintesi?').language,'it');
  assert.equal(researchPlan('Controlla la fonte NASA per Europa Clipper').domain,'nasa.gov');
  assert.equal(researchPlan('Europa Clipper site:esa.int').domain,'esa.int');
});
test('generic overlap cannot admit unrelated articles and domain suffixes are exact',()=>{
  const plan=researchPlan(question);
  assert.equal(relevantResearchSource({title:'Europa: tecnologia quantistica',url:'https://www.ansa.it/news',description:'Le fonti indicano nuove date previste in Europa'},plan),false);
  assert.equal(relevantResearchSource(result,plan),true);
  assert.equal(relevantResearchSource({...result,url:'https://nasa.gov.evil.org/'},{...plan,domain:'nasa.gov'}),false);
  assert.equal(relevantResearchSource({...result,url:'https://en.wikipedia.org/wiki/Europa_Clipper'},{...plan,domain:'nasa.gov'}),false);
});
test('passage selection finds dates late in the page and keeps events associated with dates',()=>{
  const text='Europa Clipper studies a moon.\n'+Array(70).fill('This instrument measures chemical composition.').join('\n')+'\n'+mission;
  const passages=researchPassages(text,researchPlan(question));
  assert.match(passages,/launched on October 14, 2024/);
  assert.match(passages,/enter Jupiter orbit in April 2030/);
  assert.ok(passages.length<=1800);
  assert.match(researchPassages('Europa Clipper\nLaunch\nOctober 14, 2024\nArrival\nApril 2030',researchPlan(question)),/Launch October 14, 2024/);
});
test('source rendering rejects unsafe URLs, deduplicates and preserves useful passages',()=>{
  for(const url of ['javascript:alert(1)','file:///tmp/x','https://127.0.0.1/','https://user:pass@example.org/','https://x.local/','https://[::1]/'])assert.equal(publicResearchURL(url),null);
  const sources=prepareWebResults([{...result,description:'x'.repeat(3000)},{...result,url:result.url+'?utm_source=test'},...Array.from({length:5},(_,i)=>({...result,url:`https://example.org/${i}`}))]);
  assert.equal(sources.length,3);assert.equal(sources[0].description.length,1800);
  const prompt=webSearchQuestion(question,sources);
  assert.match(prompt,/untrusted source material/);assert.match(prompt,/Do not fill gaps from memory/);assert.match(prompt,/User question: Quando/);
});
test('static web works without a backend, filters unrelated results, labels snippets accurately',async()=>{
  const {fetcher,requests}=fakeResearch();
  const sources=await searchWeb(question,undefined,fetcher);
  assert.equal(sources[0].kind,'page');assert.match(sources[0].description,/April 2030/);
  assert.equal(sources[1].kind,'snippet');
  assert.equal(sources.some(s=>s.url.includes('ansa')),false);
  assert.deepEqual(JSON.parse(requests[0].options.body),{q:'Europa Clipper'});
  for(const r of requests){assert.equal(r.options.credentials,'omit');assert.equal(r.options.referrerPolicy,'no-referrer');}
});
test('native article reader supplies complete pages and source-only questions exclude Wikipedia',async()=>{
  const {fetcher}=fakeResearch(); const read=[];
  const sources=await searchWeb('Controlla la fonte NASA: '+question,undefined,fetcher,{readArticle:async(url)=>{read.push(url);return {text:mission};}});
  assert.equal(sources.length,1);assert.equal(sources[0].kind,'page');assert.match(sources[0].description,/October 14, 2024/);assert.equal(read.length,1);
});
test('one unavailable provider does not block the other; complete failure preserves the rate-limit error',async()=>{
  let fake=fakeResearch({fail:true});assert.equal((await searchWeb(question,undefined,fake.fetcher)).length,1);
  fake=fakeResearch({fail:true,wiki:false});await assert.rejects(searchWeb(question,undefined,fake.fetcher),/WEB_SEARCH_LIMIT/);
});
test('cancellation propagates rather than falling back to snippets',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(searchWeb(question,controller.signal,async()=>assert.fail('must not fetch')),e=>e.name==='AbortError');
  const fake=fakeResearch();const active=new AbortController();
  await assert.rejects(searchWeb(question,active.signal,fake.fetcher,{readArticle:async()=>{active.abort();throw new DOMException('Aborted','AbortError');}}),e=>e.name==='AbortError');
});
test('Wikipedia discovery requests introductions, then reads the exact matching page in full',async()=>{
 const urls=[];
 const fetcher=async(url)=>{
  urls.push(url);
  if(url.includes('generator=search')){
   assert.equal(new URL(url).searchParams.get('exintro'),'1');
   return ok({query:{pages:{1:{pageid:1,title:'Europa Clipper',fullurl:'https://it.wikipedia.org/wiki/Europa_Clipper',extract:'Europa Clipper è una missione.'},2:{pageid:2,title:'Esplorazione di Europa',fullurl:'https://it.wikipedia.org/wiki/Esplorazione_di_Europa',extract:mission}}}});
  }
  if(url.includes('pageids=1'))return ok({query:{pages:{1:{extract:mission}}}});
  return ok({results:[]});
 };
 const sources=await searchWeb(question,undefined,fetcher);
 assert.equal(sources.length,1);assert.match(sources[0].description,/April 2030/);
 assert.equal(urls.some(url=>url.includes('pageids=2')),false);
});
test('bad provider rows and malformed escapes cannot break a search',()=>{
 const plan=researchPlan(question);
 assert.equal(relevantResearchSource(null,plan),false);
 assert.equal(relevantResearchSource({},plan),false);
 assert.doesNotThrow(()=>relevantResearchSource({...result,url:'https://example.org/%ZZ'},plan));
});
test('launch questions exclude disambiguation pages and a namesake biography',async()=>{
 const pages={1:{pageid:1,title:'James Webb',pageprops:{disambiguation:''},fullurl:'https://it.wikipedia.org/wiki/James_Webb',extract:'James Webb: telescope or person.'},2:{pageid:2,title:'Telescopio spaziale James Webb',fullurl:'https://it.wikipedia.org/wiki/Telescopio_spaziale_James_Webb',extract:'Il telescopio James Webb è stato lanciato il 25 dicembre 2021.'},3:{pageid:3,title:'James E. Webb',fullurl:'https://it.wikipedia.org/wiki/James_E._Webb',extract:'James Webb era un funzionario statunitense, nato nel 1906.'}};
 const sources=await searchWeb('Quando è stato lanciato James Webb?',undefined,async url=>url.includes('wikipedia.org')?ok({query:{pages}}):ok({results:[]}));
 assert.equal(sources.length,1);assert.match(sources[0].title,/Telescopio/);assert.match(sources[0].description,/25 dicembre 2021/);
});
test('Italian arrival infinitives keep the detailed event paragraph ahead of background',()=>{
 const plan=researchPlan('Quando è stata lanciata Aurora Probe e quando arriverà?');
 const text='La missione Aurora Probe accompagna un altro progetto. Il lancio del progetto precedente è avvenuto nel 2022 e arriverà nel 2031.\nIl lancio della sonda è avvenuto il 14 ottobre 2024. Aurora Probe viaggia per arrivare a destinazione nell’aprile 2030.';
 assert.match(researchPassages(text,plan),/^Il lancio della sonda è avvenuto il 14 ottobre 2024/);
});
