import test from 'node:test';
import assert from 'node:assert/strict';
import {webTurnPrompt, parseWebTurn, resolveWebTurn, groundedWebTurn, previousWebSources, hasWebCitation, searchWeb, webAnswerMessages} from '../web-search.js';
const sources=[{title:'Tennis rankings',url:'https://www.atptour.com/en/rankings/singles',description:'Dated tennis ranking evidence.',kind:'page'}];
const history=[{role:'user',text:'Chi è il numero uno del tennis ora?'},{role:'assistant',text:'Sinner.',webSources:sources}];
const json=(action,question,query='')=>JSON.stringify({action,question,query});
test('local interpretation sees both sides, repeated follow-ups and source titles',()=>{
 const prompt=webTurnPrompt('controlla ancora',[...history,{role:'user',text:'sei sicuro?'},{role:'assistant',text:'Sì.'}],'2026-11-07');
 for(const part of ['Chi è il numero uno','Sinner','sei sicuro','Sì.','2026-11-07'])assert.ok(prompt.includes(part));
 assert.ok(webTurnPrompt('mettilo in tabella',history).includes('Tennis rankings'));
});
test('verification searches the resolved factual subject and never the literal doubt',async()=>{
 const queries=[];
 const turn=await resolveWebTurn('sei sicuro??',history,async prompt=>{assert.match(prompt,/Sinner/);return json('verify','Verifica il numero uno del tennis oggi','tennis ATP ranking current');},undefined,async query=>{queries.push(query);return sources;});
 assert.deepEqual(queries,['tennis ATP ranking current']);assert.equal(turn.verify,true);
 const answer=groundedWebTurn('sei sicuro??',turn,history);
 assert.match(answer,/Verifica il numero uno/);assert.match(answer,/bare yes\/no/);assert.match(answer,/NOT verified facts/);
});
test('formatting, explanation and translation reuse persisted evidence without network',async()=>{
 for(const request of ['mettilo in tabella','spiegamelo meglio','traducilo in inglese']){
  const turn=await resolveWebTurn(request,JSON.parse(JSON.stringify(history)),async()=>json('reuse',request+' sul ranking del tennis'),undefined,async()=>assert.fail('no external search'));
  assert.deepEqual(turn.sources,sources);assert.match(groundedWebTurn(request,turn,history),/Carry out the requested/);
 }
});
test('entity reference from the assistant and a new topic use the planned query',async()=>{
 for(const [q,query] of [['Dove è nata?','Mary Shelley birthplace'],['Ora la fotosintesi','photosynthesis process']]){
  const turn=await resolveWebTurn(q,history,async()=>json('search',query,query),undefined,async actual=>{assert.equal(actual,query);return sources;});
  assert.equal(turn.verify,false);
 }
});
test('chat continues normally, without sources from a different earlier subject',async()=>{
 const turn=await resolveWebTurn('scrivi una poesia',history,async()=>json('chat','Scrivi una poesia'),undefined,async()=>assert.fail('no search'));
 assert.deepEqual(turn.sources,[]);
 assert.deepEqual(previousWebSources([...history,{role:'assistant',text:'Una poesia'}]),[]);
});
test('malformed or ambiguous plans never fall back to searching a literal follow-up',async()=>{
 for(const raw of ['Sì',json('clarify','Chi intendi?'),'{"action":"search","query":"sicuro"}',json('search','Verifica','')]){
  await assert.rejects(resolveWebTurn('e lui?',history,async()=>raw,undefined,async()=>assert.fail('no search')),/WEB_CONTEXT_UNCLEAR/);
 }
 assert.equal(parseWebTurn('```json\n'+json('reuse','Riassumi la missione')+'\n```').action,'reuse');
});
test('cancellation after planning prevents network and empty evidence cannot confirm',async()=>{
 const c=new AbortController();
 await assert.rejects(resolveWebTurn('verifica',history,async()=>{c.abort();return json('verify','Verifica tennis','tennis ranking');},c.signal,async()=>assert.fail('no search')),e=>e.name==='AbortError');
 await assert.rejects(resolveWebTurn('verifica',history,async()=>json('verify','Verifica tennis','tennis ranking'),undefined,async()=>[]),/WEB_SEARCH_EMPTY/);
});
test('native persisted sources can be reused and unsafe source URLs are rejected',()=>{
 assert.equal(previousWebSources([{role:'assistant',sources:[{name:'ATP',docId:'web:https://www.atptour.com/en/rankings/singles',text:'Tennis ranking'}]}]).length,1);
 assert.equal(previousWebSources([{role:'assistant',sources:[{name:'Bad',docId:'web:javascript:alert(1)',text:'bad'}]}]).length,0);
});

test('short confirmation and invented citation numbers cannot pass the final evidence check',()=>{
 assert.equal(hasWebCitation('Sì.',3),false);
 assert.equal(hasWebCitation('Sì, sono sicuro. [4]',3),false);
 assert.equal(hasWebCitation('La fonte indica questo dato. [1]',1),true);
});
test('planned searches preserve the requested fact instead of reducing the query to a name',async()=>{
 const queries=[];
 await searchWeb('Mary Shelley birthplace',undefined,async(url,options)=>{
  if(url.endsWith('/search'))queries.push(JSON.parse(options.body).q);
  return {ok:true,json:async()=>({results:[]})};
 },{exactQuery:true,question:'Dove è nata Mary Shelley?'});
 assert.deepEqual(queries,['Mary Shelley birthplace']);
});

test('answer generation preserves chat roles and does not trust a planner-invented topic',()=>{
 const messages=webAnswerMessages('Mettilo in tabella',{action:'reuse',question:'pannelli solari',sources,verify:false},history);
 assert.deepEqual(messages.slice(1),[{role:'user',content:history[0].text},{role:'assistant',content:'Sinner.'},{role:'user',content:'Mettilo in tabella'}]);
 assert.equal(JSON.stringify(messages).includes('pannelli solari'),false);
 assert.match(messages[0].content,/NOT verified facts/);
 assert.equal(webTurnPrompt('Mettilo in tabella',history).includes('pannelli solari'),false);
});
test('an omitted query is repaired locally before any network request',async()=>{
 let calls=0;const sent=[];
 const turn=await resolveWebTurn('sei sicuro?',history,async()=>++calls===1?json('verify','Verifica il primo nel tennis'):'tennis ATP rankings current',undefined,async q=>{sent.push(q);return sources;});
 assert.equal(calls,2);assert.equal(turn.verify,true);assert.deepEqual(sent,['tennis ATP rankings current']);
 await assert.rejects(resolveWebTurn('sei sicuro?',history,async()=>++calls===3?json('verify','Verifica il tennis'):'sei sicuro',undefined,async()=>assert.fail('generic query must not leave device')),/WEB_CONTEXT_UNCLEAR/);
});
