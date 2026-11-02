import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function harness() {
  const elements = Object.fromEntries(['starter-card', 'starter-title', 'starter-info', 'starter-percent', 'starter-meter', 'starter-fill'].map(id => [id, { hidden:true, textContent:'', style:{}, attrs:{}, setAttribute(name,value) { this.attrs[name] = value; } }]));
  const calls = [];
  const context = { $:id => elements[id], tr:key => key, chooseModel:async id => calls.push(id), console };
  const source = readFileSync(new URL('../../../scripts/experimental-web-start.js', import.meta.url), 'utf8');
  runInNewContext(`${source}\nglobalThis.testApi = {starterProgress, restoreExperimentalModel};`, context);
  return { elements, calls, api:context.testApi };
}

test('download progress and verification show distinct accessible states', () => {
  const { elements, api } = harness();
  api.starterProgress('download', 37.9);
  assert.equal(elements['starter-card'].hidden, false);
  assert.equal(elements['starter-title'].textContent, 'starterDownloadTitle');
  assert.equal(elements['starter-percent'].textContent, '37%');
  assert.equal(elements['starter-meter'].attrs['aria-valuenow'], '37');
  assert.equal(elements['starter-fill'].style.width, '37%');
  api.starterProgress('verify');
  assert.equal(elements['starter-title'].textContent, 'starterVerifyTitle');
  assert.equal(elements['starter-meter'].hidden, true);
  api.starterProgress('done');
  assert.equal(elements['starter-card'].hidden, true);
});

test('restoring the model uses the existing model and hides the loading card', async () => {
  const { elements, calls, api } = harness();
  await api.restoreExperimentalModel('saved-model');
  assert.deepEqual(calls, ['saved-model']);
  assert.equal(elements['starter-title'].textContent, 'starterRestoreTitle');
  assert.equal(elements['starter-card'].hidden, true);
});
