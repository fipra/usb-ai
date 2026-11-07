import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedArticle, publicIPv4, resolvePublic, createHandler} from '../../../api/read-article.mjs';
test('article URLs exclude credentials, literal IPs, local names and non-HTTPS',()=>{
 for(const url of ['file:///tmp/a','http://nasa.gov/','https://127.0.0.1/','https://[::1]/','https://user:pass@nasa.gov/','https://nasa.gov:8443/','https://nasa.gov\\@127.0.0.1/','https://a.LOCAL/'])assert.equal(allowedArticle(url),false,url);
 assert.equal(allowedArticle('https://science.nasa.gov/mission/'),true);
});
test('DNS validation rejects mixed public/private answers',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.1.1','192.168.1.1','172.16.0.1','100.64.0.1','224.0.0.1'])assert.equal(publicIPv4(ip),false);
 await assert.rejects(resolvePublic('https://science.nasa.gov/',async()=>[{address:'8.8.8.8'},{address:'127.0.0.1'}]),/INVALID_ARTICLE/);
 assert.equal(await resolvePublic('https://science.nasa.gov/',async()=>[{address:'8.8.8.8'}]),'8.8.8.8');
});
test('reader rejects oversized and non-HTML responses and returns no upstream secrets',async()=>{
 const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}});
 for(const response of [new Response('secret',{headers:{'Content-Type':'application/json'}}),new Response('secret',{headers:{'Content-Type':'text/html','Content-Length':'1048577'}})]){
  const output=res();await createHandler(async()=>response)({method:'POST',body:{url:'https://science.nasa.gov/'}},output);assert.equal(output.code,502);assert.deepEqual(output.data,{error:'ARTICLE_UNAVAILABLE'});
 }
 const output=res();await createHandler(async()=>assert.fail())({method:'POST',body:{url:'file:///etc/passwd'}},output);assert.equal(output.code,400);
});
