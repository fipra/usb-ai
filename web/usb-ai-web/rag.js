import { visibleAnswer } from './thinking.js';
import { documentQuestion, recentContext } from './retrieval.js';

const FORMAT_GUIDE = { role:'system', content:'You are LlamaNest, an AI assistant. Reply in the language of the user’s latest message unless they request another language. Answer directly and match the length to the request. Reply to a greeting with a greeting, not an explanation. For example, for Italian “ciao”, say “Ciao! Come posso aiutarti?”; for “chi sei”, say “Sono LlamaNest, un assistente AI.” Answer simple questions briefly. Avoid unsolicited sections, examples, background, and self-description. Give detail when requested or needed. Be clear and honest; do not invent facts. Use Markdown only when useful, and fenced blocks for code.' };

export function appQuestion(question) {
  const asksToBuild = /\b(crea|creare|costruisci|sviluppa|scrivi|create|build|make|develop|write|erstelle|baue|crée|construis|crea|haz)\b/i.test(question);
  const asksForApp = /\b(app|applicazione|application|website|sito|webpage|pagina web|html|javascript)\b/i.test(question);
  if (!asksToBuild || !asksForApp) return question;
  return `${question}\n\nProvide a complete runnable browser app. Prefer one fenced html block with CSS and JavaScript inline. If you use separate files, include every referenced file as a complete fenced html, css, or javascript block. Ensure event handlers target existing elements and forms do not reload the page. Do not leave placeholders or omit closing code fences.`;
}

export function ragContexts(history, question, sources, fullDocument = false) {
  question = appQuestion(question);
  if (!sources.length) return [[FORMAT_GUIDE, ...recentContext(history, question)]];
  return [
    [FORMAT_GUIDE, ...recentContext(history, documentQuestion(question, sources, fullDocument ? 2000000 : 1300, fullDocument ? 1100 : 900), 700)],
    [FORMAT_GUIDE, { role:'user', content:documentQuestion(question, sources.slice(0,1), 500) }]
  ];
}

export async function completeWithRetry(contexts, stream, onToken, signal, onRetry = () => {}) {
  let lastError;
  for (let i = 0; i < contexts.length; i++) {
    if (signal.aborted) return;
    let visible = '';
    try {
      const usage = await stream(contexts[i], token => {
        visible += token;
        onToken(token);
      }, signal);
      if (visibleAnswer(visible)) return usage;
    } catch (error) {
      if (signal.aborted) return;
      lastError = error;
      if (visible.trim() || i === contexts.length - 1) throw error;
    }
    if (i < contexts.length - 1) onRetry();
  }
  throw lastError || Error('EMPTY_MODEL_RESPONSE');
}
