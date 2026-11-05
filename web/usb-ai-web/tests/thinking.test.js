import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeThinking, visibleAnswer } from '../thinking.js';
import { recentContext } from '../retrieval.js';
import { completeWithRetry } from '../rag.js';

test('hides reasoning when the model omits an opening tag', () => {
  assert.equal(normalizeThinking('private reasoning</think>Answer'), '<think>private reasoning</think>Answer');
  assert.equal(visibleAnswer('private reasoning</think>Answer'), 'Answer');
  assert.equal(visibleAnswer('<think>private</think>Answer'), 'Answer');
  assert.equal(visibleAnswer('<think>unfinished'), '');
  assert.equal(visibleAnswer('ordinary answer'), 'ordinary answer');
});

test('conversation history omits reasoning even with an implicit opening', () => {
  assert.equal(recentContext([{role:'assistant', text:'secret</think>visible'}], 'question')[0].content, 'visible');
});

test('reasoning without a final answer is not treated as a successful response', async () => {
  await assert.rejects(completeWithRetry([[]], async (_messages, onToken) => onToken('secret</think>'), () => {}, {aborted:false}), /EMPTY_MODEL_RESPONSE/);
});

test('normalization works when the closing marker arrives in separate chunks', () => {
  let response = '';
  for (const chunk of ['hidden ', 'reasoning</th', 'ink>', 'answer']) response += chunk;
  assert.equal(visibleAnswer(response), 'answer');
});
