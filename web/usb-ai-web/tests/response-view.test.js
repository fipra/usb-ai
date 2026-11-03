import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { USB_AI_CODE_VIEW: { render(container, text) { container.textContent = text; } } };
await import('../../response-view.js');

const element = tag => ({
  tagName: tag.toUpperCase(), children: [], textContent: '', className: '',
  append(...children) { this.children.push(...children); },
  replaceChildren(...children) { this.children = children; }
});

test('thinking stays collapsed and token metrics remain under the final answer', () => {
  const original = globalThis.document;
  globalThis.document = { createElement: element };
  try {
    const message = { text:'<think>First draft</think>Final answer', usage:{inputTokens:42,outputTokens:9,tokensPerSecond:18.5} };
    const box = element('div');
    window.USB_AI_RESPONSE_VIEW.render(box, message, 'it', true);
    assert.equal(box.children[0].tagName, 'DETAILS');
    assert.equal(box.children[0].open, undefined);
    assert.equal(box.children[0].children[1].textContent, 'First draft');
    assert.equal(box.children[1].textContent, 'Final answer');
    assert.match(box.children[2].textContent, /Input 42 · Output 9 · 18\.5 token\/s/);
    window.USB_AI_RESPONSE_VIEW.render(box, message, 'it', false);
    assert.equal(box.children.length, 2);
    assert.equal(box.children[0].textContent, 'Final answer');
  } finally { globalThis.document = original; }
});

test('unfinished thinking does not leak into the answer', () => {
  assert.deepEqual(window.USB_AI_RESPONSE_VIEW.splitThinking('<think>working'), {answer:'',thinking:'working'});
});


test('correction can use the complete visible answer without hidden reasoning', () => {
  const answer = 'First part ' + 'x'.repeat(900) + ' corrected ending';
  const result = window.USB_AI_RESPONSE_VIEW.splitThinking(`<think>private reasoning</think>${answer}`);
  assert.equal(result.answer, answer);
  assert.equal(result.thinking, 'private reasoning');
});
