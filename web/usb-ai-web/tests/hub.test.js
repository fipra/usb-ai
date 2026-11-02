import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateMemory, groupLocalGgufs, isAuxiliaryGguf, isNonChatRepo, plausibleModelSize, modelFromEntry, modelsFromEntries, searchModels, searchTerm, splitSearchTerm } from '../hub.js';

const hash = 'a'.repeat(64);
test('only verified standalone GGUF files become results', () => {
  const valid = modelFromEntry('owner/repo', { path:'models/tiny-q4.gguf', size:100_000_000, lfs:{sha256:hash} }, 'apache-2.0');
  assert.equal(valid.sha256, hash);
  assert.equal(valid.url, 'https://huggingface.co/owner/repo/resolve/main/models/tiny-q4.gguf');
  assert.equal(modelFromEntry('owner/repo', { path:'../tiny.gguf', size:30_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'mmproj.gguf', size:30_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'tiny.gguf', size:30_000_000 }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'tiny.gguf', size:5_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'adapter.gguf', size:100_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'mtp-q4.gguf', size:100_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'draft-q4.gguf', size:100_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'DeepSeek-V4-Flash-Vision-Encoder.gguf', size:500_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'DeepSeek-V4.1-Flash-Vision.gguf', size:971_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'DeepSeek-V4.1-Flash-vision-BF16.gguf', size:971_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'vision_projector.gguf', size:500_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'imatrix/DeepSeek-V4.1-Flash-1017-imatrix.gguf', size:785_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'imatrix-dsv41-262144.gguf', size:789_000_000, lfs:{sha256:hash} }), null);
  assert.equal(modelFromEntry('owner/repo', { path:'imatrix/model-Q4_K_M.gguf', size:789_000_000, lfs:{sha256:hash} }), null);
  assert.equal(isAuxiliaryGguf('https://huggingface.co/owner/repo/resolve/main/imatrix/DeepSeek-V4.1-Flash-1017-imatrix.gguf'), true);
  for (const filename of ['token-embd-bf16.gguf','ple-fp8.gguf','qwen-nvfp4-gptq-dense.gguf']) {
    assert.equal(isAuxiliaryGguf(filename), true, filename);
    assert.equal(modelFromEntry('Maximilian228/Qwen3.8-Flash-Next-NVFP4-GPTQ-Strata', {path:filename,size:1_270_000_000,lfs:{sha256:hash}}), null);
  }
  assert.equal(isAuxiliaryGguf('Qwen3.8-Flash-Next-Q4_K_M.gguf'), false);
  assert.equal(modelFromEntry('ggml-org/Qwen3.8-27B-GGUF', {path:'dflash-Qwen3.8-27B-Q4_0.gguf',size:1_094_000_000,lfs:{sha256:hash}}), null);
  assert.equal(modelFromEntry('owner/Qwen3-TTS-12Hz-0.6B-GGUF', {path:'model-Q4_K_M.gguf',size:605_000_000,lfs:{sha256:hash}}), null);
  assert.equal(isNonChatRepo('owner/Qwen3-TTS-12Hz-0.6B-GGUF'), true);
  assert.equal(plausibleModelSize('owner/Qwen3.8-27B-GGUF', 'Qwen3.8-27B-Q4_0.gguf', 1_094_000_000), false);
  assert.equal(plausibleModelSize('owner/Qwen3.5-4B-GGUF', 'Qwen3.5-4B-Q4_K_M.gguf', 1_949_000_000), true);
  const large = modelFromEntry('owner/repo', { path:'Qwen3.5-9B-Q4_K_M.gguf', size:5_627_044_256, lfs:{sha256:hash} });
  assert.equal(large.tooLargeForWeb, true);
});
test('DeepSeek search reaches small distill models beyond the first eight repositories', async () => {
  const repos = Array.from({length:24}, (_,i) => ({id:i === 9 ? 'unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF' : `owner/DeepSeek-V4-${i}-GGUF`,tags:[]}));
  const fetcher = async url => ({ok:true,json:async () => url.includes('/tree/')
    ? url.includes('Distill-Qwen-1.5B')
      ? [{path:'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',size:1_100_000_000,lfs:{sha256:hash}}]
      : [{path:'DeepSeek-V4-Flash-Vision-Encoder.gguf',size:500_000_000,lfs:{sha256:hash}}]
    : repos});
  const result = await searchModels('deepseek', 0, fetcher);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].name, 'DeepSeek R1 Distill Qwen 1.5B');
  assert.match(result.models[0].url, /1\.5B-Q4_K_M\.gguf$/);
  assert.equal(result.nextSkip, 24);
});
test('DeepSeek imatrix files never become downloadable chat models', async () => {
  const repos = [
    {id:'mrfakename/DeepSeek-V4.1-Flash-1017-GGUF',tags:['license:mit']},
    {id:'smalinin/DeepSeek-V4.1-Flash-GGUF',tags:['license:mit']},
    {id:'unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF',tags:['license:apache-2.0']}
  ];
  const fetcher = async url => ({ok:true,json:async () => url.includes('/tree/')
    ? url.includes('mrfakename')
      ? [{path:'imatrix/DeepSeek-V4.1-Flash-1017-imatrix.gguf',size:785_000_000,lfs:{sha256:hash}}]
      : url.includes('smalinin')
        ? [{path:'imatrix-dsv41-262144.gguf',size:789_000_000,lfs:{sha256:hash}}]
        : [{path:'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',size:1_117_000_000,lfs:{sha256:hash}}]
    : repos});
  const result = await searchModels('deepseek', 0, fetcher);
  assert.deepEqual(result.models.map(model => model.name), ['DeepSeek R1 Distill Qwen 1.5B']);
});
test('a GGUF filename searches for its model repository', () => {
  assert.equal(searchTerm('Qwen_Qwen3.5-9B-Q4_K_M.gguf'), 'Qwen3.5-9B');
  assert.equal(splitSearchTerm('Qwen 3.5 9B'), 'Qwen3.5-9B-split');
});
test('search lists verified files from public repositories', async () => {
  const fetcher = async url => ({ ok:true, json:async () => url.includes('/tree/')
    ? [{path:'tiny.gguf',size:100_000_000,lfs:{sha256:hash}}]
    : [{id:'owner/repo',tags:['license:apache-2.0']}] });
  const result = await searchModels('tiny', 0, fetcher);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].license, 'apache-2.0');
  assert.equal(result.nextSkip, null);
});
test('search offers one complete recommended file per model', async () => {
  const entries = [
    {path:'model-Q2_K.gguf',size:80_000_000,lfs:{sha256:'b'.repeat(64)}},
    {path:'model-Q4_K_M.gguf',size:120_000_000,lfs:{sha256:'c'.repeat(64)}},
    {path:'model-Q8_0.gguf',size:210_000_000,lfs:{sha256:'d'.repeat(64)}}
  ];
  const fetcher = async url => ({ok:true,json:async () => url.includes('/tree/') ? entries : [{id:'owner/repo',tags:[]}]});
  const result = await searchModels('model', 0, fetcher);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].name, 'repo');
  assert.match(result.models[0].url, /model-Q4_K_M\.gguf$/);
});
test('search merges duplicate publishers of the same base model', async () => {
  const repos = ['publisher-a/DeepSeek-R1-GGUF','publisher-b/DeepSeek-R1-GGUF'].map(id => ({id,tags:['base_model:deepseek-ai/DeepSeek-R1']}));
  const fetcher = async url => ({ok:true,json:async () => url.includes('/tree/')
    ? [{path:'DeepSeek-R1-Q4_K_M.gguf',size:900_000_000,lfs:{sha256:hash}}]
    : repos});
  const result = await searchModels('DeepSeek R1', 0, fetcher);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].name, 'DeepSeek R1');
});
test('memory estimate includes browser and inference overhead', () => {
  assert.deepEqual(estimateMemory(1_073_741_824), {minimum:3,recommended:6});
});
test('complete GGUF shard sets can exceed 2 GB in total', () => {
  const entries = [1,2,3].map(i => ({path:`large-0000${i}-of-00003.gguf`,size:1_100_000_000,lfs:{sha256:String(i).repeat(64)}}));
  const models = modelsFromEntries('owner/repo', entries);
  assert.equal(models.length, 1);
  assert.equal(models[0].size, 3_300_000_000);
  assert.equal(models[0].tooLargeForWeb, false);
  assert.equal(models[0].shards.length, 3);
  assert.match(models[0].shards[1].url, /large-00002-of-00003\.gguf$/);
  assert.equal(modelsFromEntries('owner/repo', entries.slice(0,2)).length, 0);
  const smallLast = [
    {path:'large-00001-of-00002.gguf',size:1_900_000_000,lfs:{sha256:hash}},
    {path:'large-00002-of-00002.gguf',size:8_000_000,lfs:{sha256:'b'.repeat(64)}}
  ];
  assert.equal(modelsFromEntries('owner/repo', smallLast)[0].shards.length, 2);
});
test('existing local shard files reload as one model in numeric order', () => {
  const files = [4,1,3,2].map(i => ({filename:`Gemma-9B-Q4-0000${i}-of-00004.gguf`,size:1_875_000_000,fileHandle:{id:i}}));
  const groups = groupLocalGgufs(files);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Gemma-9B-Q4.gguf');
  assert.equal(groups[0].size, 7_500_000_000);
  assert.deepEqual(groups[0].members.map(file => file.fileHandle.id), [1,2,3,4]);
  assert.equal(groupLocalGgufs(files.slice(0,3)).length, 0);
});
test('search includes split repositories before single files above 2 GB', async () => {
  const fetcher = async url => ({ok:true,json:async () => url.includes('/tree/')
    ? url.includes('/split/')
      ? [1,2].map(i=>({path:`Qwen3.5-9B-0000${i}-of-00002.gguf`,size:1_500_000_000,lfs:{sha256:String(i).repeat(64)}}))
      : [{path:'Qwen3.5-9B-Q4.gguf',size:5_000_000_000,lfs:{sha256:hash}}]
    : url.includes('search=Qwen3.5-9B-split')
      ? [{id:'owner/split',tags:[]}]
      : [{id:'owner/single',tags:[]}]});
  const result = await searchModels('Qwen 3.5 9B', 0, fetcher);
  assert.equal(result.models.length, 2);
  assert.equal(result.models[1].tooLargeForWeb, true);
  assert.equal(result.models[0].shards.length, 2);
  assert.equal(result.models[0].tooLargeForWeb, false);
});
test('Gemma 9B search chooses complete verified shards over an oversized single file', async () => {
  const urls = [];
  const fetcher = async url => {
    urls.push(url);
    if (url.includes('/tree/')) return {ok:true,json:async () => url.includes('split')
      ? [1,2,3,4].map(i => ({path:`gemma-2-9b-it-Q4_K_M-0000${i}-of-00004.gguf`,size:1_875_000_000,lfs:{sha256:String(i).repeat(64)}}))
      : [{path:'gemma-2-9b-it-Q4_K_M.gguf',size:7_500_000_000,lfs:{sha256:hash}}]};
    return {ok:true,json:async () => url.includes('search=gemma-9b-split')
      ? [{id:'owner/gemma-2-9b-it-GGUF-split',tags:['base_model:google/gemma-2-9b-it']}]
      : [{id:'owner/gemma-2-9b-it-GGUF',tags:['base_model:google/gemma-2-9b-it']}]};
  };
  const result = await searchModels('gemma 9b', 0, fetcher);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].shards.length, 4);
  assert.equal(result.models[0].size, 7_500_000_000);
  assert.equal(result.models[0].tooLargeForWeb, false);
  assert.equal(result.oversizedCount, 1);
  assert.ok(urls.some(url => url.includes('search=gemma-9b-split')));
});
test('generic model search also checks for already split GGUF releases', async () => {
  const urls = [];
  const fetcher = async url => {
    urls.push(url);
    return {ok:true,json:async () => url.includes('/tree/')
      ? [1,2].map(i => ({path:`gemma-0000${i}-of-00002.gguf`,size:1_500_000_000,lfs:{sha256:String(i).repeat(64)}}))
      : url.includes('search=gemma-split') ? [{id:'owner/gemma-GGUF-split',tags:[]}] : []};
  };
  const result = await searchModels('gemma', 0, fetcher);
  assert.equal(result.models[0].shards.length, 2);
  assert.ok(urls.some(url => url.includes('search=gemma-split')));
});
test('Web search includes a large single GGUF marked for splitting', async () => {
  const urls = [];
  const fetcher = async url => {
    urls.push(url);
    return { ok:true, json:async () => url.includes('/tree/')
      ? [{path:'Qwen3.5-9B-Q4_K_M.gguf',size:5_627_044_256,lfs:{sha256:hash}}]
      : [{id:'owner/Qwen3.5-9B-GGUF',tags:['license:apache-2.0']}] };
  };
  const result = await searchModels('Qwen_Qwen3.5-9B-Q4_K_M.gguf', 0, fetcher);
  assert.match(urls[0], /search=Qwen3\.5-9B/);
  assert.equal(result.models.length, 1);
  assert.equal(result.models[0].tooLargeForWeb, true);
  assert.equal(result.models[0].size, 5_627_044_256);
});
test('exact GGUF filename takes priority over similar quantizations', async () => {
  const fetcher = async url => ({ ok:true, json:async () => url.includes('/tree/')
    ? [
      {path:'Qwen_Qwen3.5-3B-Q3_K_M.gguf',size:1_400_000_000,lfs:{sha256:hash}},
      {path:'Qwen_Qwen3.5-3B-Q4_K_M.gguf',size:1_600_000_000,lfs:{sha256:'b'.repeat(64)}}
    ] : [{id:'bartowski/Qwen_Qwen3.5-3B-GGUF',tags:[]}] });
  const result = await searchModels('Qwen_Qwen3.5-3B-Q4_K_M.gguf', 0, fetcher);
  assert.equal(result.models.length, 1);
  assert.match(result.models[0].url, /Qwen_Qwen3\.5-3B-Q4_K_M\.gguf/);
});

test('search hides Qwen auxiliary weights and speech models while retaining a small chat model', async () => {
  const repos = [
    {id:'ggml-org/Qwen3.8-27B-GGUF',tags:['license:apache-2.0']},
    {id:'owner/Qwen3-TTS-12Hz-0.6B-GGUF',tags:['license:apache-2.0']},
    {id:'owner/Qwen3.5-4B-GGUF',tags:['license:apache-2.0']}
  ];
  const fetcher = async url => ({ok:true,json:async () => url.includes('/tree/')
    ? url.includes('Qwen3.8-27B')
      ? [{path:'dflash-Qwen3.8-27B-Q4_0.gguf',size:1_094_000_000,lfs:{sha256:hash}},
         {path:'Qwen3.8-27B-Q4_K_M.gguf',size:19_000_000_000,lfs:{sha256:'b'.repeat(64)}}]
      : [{path:'Qwen3.5-4B-Q4_K_M.gguf',size:1_949_000_000,lfs:{sha256:'c'.repeat(64)}}]
    : repos});
  const result = await searchModels('qwen', 0, fetcher);
  assert.deepEqual(result.models.map(model => model.name), ['Qwen3.5 4B', 'Qwen3.8 27B']);
  assert.equal(result.models[1].tooLargeForWeb, true);
  assert.equal(result.models[0].filename, 'Qwen3.5-4B-Q4_K_M.gguf');
});
