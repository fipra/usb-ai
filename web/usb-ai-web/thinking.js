// Some chat templates place the opening tag in the prompt, so generation
// begins inside the thinking block and emits only its closing tag.
export function normalizeThinking(text) {
  const value = String(text || '');
  const first = /<\/?think>/i.exec(value);
  return first && /^<\/think>$/i.test(first[0]) ? '<think>' + value : value;
}

export function visibleAnswer(text) {
  return normalizeThinking(text).replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
}
