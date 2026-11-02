import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../../../landing-mobile-gate.js', import.meta.url), 'utf8');
function run(userAgent) {
  const web = {href:'/app/', handlers:[], addEventListener(_event, cb){this.handlers.push(cb)}};
  const newWeb = {href:'/nuovo-web/', handlers:[], addEventListener(_event, cb){this.handlers.push(cb)}};
  const download = {href:'#download', handlers:[], addEventListener(_event, cb){this.handlers.push(cb)}};
  const note = {lastChild:{textContent:''}};
  const alerts = [];
  const document = {documentElement:{lang:'it'}, querySelector:()=>note,
    querySelectorAll:selector => selector === 'a[href="/app/"]' ? [web] : selector.includes('a[href="/app/"]') ? [web,newWeb,download] : [download]};
  runInNewContext(script,{document,navigator:{userAgent},window:{alert:message=>alerts.push(message)}});
  return {web,newWeb,download,note,alerts};
}
test('iPhone Web link and desktop download are blocked', () => {
  const {web,newWeb,download,note,alerts}=run('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)');
  assert.equal(web.href,'/app/');assert.equal(web.handlers.length,1);
  assert.equal(newWeb.handlers.length,1);
  assert.equal(note.lastChild.textContent,'Solo per PC e Mac');
  let prevented=false;download.handlers[0]({preventDefault:()=>{prevented=true}});
  assert.equal(prevented,true);assert.equal(alerts.length,1);
});
test('Android continues to block the web link', () => {
  const {web}=run('Mozilla/5.0 (Linux; Android 16; Pixel 10) Mobile');
  assert.equal(web.handlers.length,1);
});
