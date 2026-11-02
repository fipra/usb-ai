import test from 'node:test';
import assert from 'node:assert/strict';
import { engineForModel } from '../engine-routing.js';

test('routes Bonsai PQ2 models from imports, downloads and split GGUF files', () => {
  for (const model of [
    {name:'Ternary-Bonsai-2-9B-PQ2_0.gguf'},
    {name:'Bonsai 2',url:'https://huggingface.co/prism-ml/model/resolve/main/Ternary-Bonsai-2-9B-PQ2_0.gguf'},
    {name:'model',shards:[{url:'https://huggingface.co/prism-ml/model/resolve/main/Bonsai-PQ2_0-00001-of-00002.gguf'}]},
    {name:'model',files:[{name:'Ternary-Bonsai-2-9B-PQ2_0.gguf'}]}
  ]) assert.equal(engineForModel(model), 'prism');
});

test('selects standard for regular quantizations and rejects unsupported PTQ1', () => {
  assert.equal(engineForModel({name:'Qwen 2.5',url:'https://huggingface.co/Qwen/model/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf'}), 'standard');
  assert.equal(engineForModel({filename:'Llama-3.2-Q8_0.gguf'}), 'standard');
  assert.equal(engineForModel({filename:'Gemma-3-Q4.gguf'}), 'standard');
  assert.equal(engineForModel({filename:'Bonsai-27B-Q1_0.gguf'}), 'standard');
  assert.equal(engineForModel({filename:'Ternary-Bonsai-2-9B-PTQ1_0.gguf'}), 'unsupported-ptq1');
});

test('does not override the user choice for ambiguous or remote models', () => {
  assert.equal(engineForModel({name:'custom-model.gguf'}), null);
  assert.equal(engineForModel({id:'remote:bonsai-pq2_0',name:'Bonsai-PQ2_0.gguf'}), null);
  assert.equal(engineForModel(null), null);
});
