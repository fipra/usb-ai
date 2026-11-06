import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { deviceReply } from '../device-reply.js';

test('device date answers the reported question in the question language', () => {
  const now = new Date(2026,10,6,7,15);
  assert.equal(deviceReply('che giorno è oggi?', 'en', now), 'Oggi è venerdì 6 novembre 2026.');
  assert.match(deviceReply('what day is it today?', 'it', now), /Friday.*November 6, 2026/);
  for (const q of ['quel jour sommes-nous?', 'welcher Tag ist heute?', '¿qué día es hoy?']) assert.match(deviceReply(q,'en',now), /2026/);
  assert.equal(deviceReply('  CAO! '), 'Ciao! Come posso aiutarti?');
});

test('clock is evaluated on every request using the device timezone, including midnight', () => {
  const moduleUrl = new URL('../device-reply.js', import.meta.url).href;
  const source = `import {deviceReply} from ${JSON.stringify(moduleUrl)}; console.log(deviceReply('che giorno è oggi','it',new Date('2026-11-06T00:30:00Z')))`;
  const result = tz => execFileSync(process.execPath,['--input-type=module','-e',source],{env:{...process.env,TZ:tz},encoding:'utf8'});
  assert.match(result('Europe/Zurich'), /venerdì 6 novembre/);
  assert.match(result('America/Los_Angeles'), /giovedì 5 novembre/);
  assert.notEqual(deviceReply('che giorno è oggi','it',new Date(2026,10,6)),deviceReply('che giorno è oggi','it',new Date(2026,10,7)));
  assert.match(deviceReply('che ore sono','it',new Date(2026,10,6,7,15)), /07:15/);
});

test('news, compound requests and foreign timezone questions keep their normal route', () => {
  for(const q of ['notizie sulle elezioni in Israele oggi','ciao, cerca le notizie','che giorno è oggi a Tokyo','che giorno è oggi e quali sono le notizie','riassumi il documento','in che percentuale hanno vinto']) assert.equal(deviceReply(q),null,q);
  assert.equal(deviceReply('che giorno è oggi','it',new Date(NaN)),null);
});
