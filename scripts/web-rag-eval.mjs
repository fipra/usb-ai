#!/usr/bin/env node
// Evaluates Web RAG v4 against a running llama-server.
// Usage: node scripts/web-rag-eval.mjs --server http://127.0.0.1:8090 [--only 1,2] [--out report.json]
// Compares "closed book" (model alone) with the web pipeline on questions whose
// answers are known. Network: Purili search + direct HTTPS page reads.
import { research, wikipediaSearchURL, parseWikipediaSearch } from '../web/usb-ai-web/web-rag.js';
import { fetchPublicArticle } from '../api/read-article.mjs';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a, []));
const server = args.server || 'http://127.0.0.1:8090';

// Answers are facts after the training cutoff of most small models (2024-2025).
export const QUESTIONS = [
  {lang: 'it', q: 'Chi è il papa attuale?', expect: [/leone xiv|leo xiv|prevost/i]},
  {lang: 'it', q: 'Chi ha vinto il Festival di Sanremo 2025?', expect: [/olly/i]},
  {lang: 'it', q: "Chi ha vinto l'Eurovision 2025?", expect: [/\bjj\b|wasted love|austria/i]},
  {lang: 'it', q: 'Chi ha vinto Wimbledon 2025 nel singolare maschile?', expect: [/sinner/i]},
  {lang: 'it', q: 'Chi è il cancelliere tedesco dopo le elezioni del 2025?', expect: [/merz/i]},
  {lang: 'it', q: 'Chi ha vinto lo scudetto di Serie A 2024-25?', expect: [/napoli/i]},
  {lang: 'it', q: "Chi ha vinto il Pallone d'Oro 2025?", expect: [/demb[eé]l[eé]/i]},
  {lang: 'it', q: 'Chi è il segretario generale della NATO?', expect: [/rutte/i]},
  {lang: 'en', q: 'Who won the 2025 Formula 1 drivers championship?', expect: [/norris/i]},
  {lang: 'en', q: 'Who won the 2024 Nobel Prize in Physics?', expect: [/hopfield/i, /hinton/i]},
  {lang: 'it', q: 'Quando è stato lanciato GPT-5 da OpenAI?', expect: [/agosto 2025|august 2025|7 agosto|august 7/i]},
  {lang: 'it', q: 'Chi ha vinto la Champions League 2024-25?', expect: [/paris saint|psg/i]},
  {lang: 'de', q: 'Wer ist der aktuelle Bundespräsident der Schweiz 2025?', expect: [/keller-sutter/i]},
  {lang: 'fr', q: 'Qui a gagné le Tour de France 2025 ?', expect: [/poga[cč]ar/i]},
  {lang: 'es', q: '¿Quién ganó el Mundial de Clubes de la FIFA 2025?', expect: [/chelsea/i]},
  {lang: 'it', q: 'Quanto è alto il Cervino?', expect: [/4[.\s]?478/]},
  // follow-up: needs the conversation to resolve "lui"
  {lang: 'it', q: 'E quanti anni ha?', history: [{role: 'user', text: 'Chi è il segretario generale della NATO?'}], expect: [/\b5[89]\b/]},
];

async function complete({system, user, grammar, maxTokens = 600}) {
  const body = {
    messages: [...(system ? [{role: 'system', content: system}] : []), {role: 'user', content: user}],
    temperature: grammar ? 0 : 0.2, max_tokens: maxTokens,
    chat_template_kwargs: {enable_thinking: false}
  };
  if (grammar) body.grammar = grammar;
  const r = await fetch(server + '/v1/chat/completions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(300000)});
  if (!r.ok) throw Error('llama-server ' + r.status + ' ' + await r.text());
  const data = await r.json();
  return (data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

async function search(query) {
  const r = await fetch('https://puri.li/api/search', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({q: query}), signal: AbortSignal.timeout(15000)});
  if (!r.ok) throw Error('search ' + r.status);
  const data = await r.json();
  return (data.results || []).filter(x => typeof x.url === 'string' && x.url.startsWith('https://')).slice(0, 8)
    .map(x => ({title: String(x.title || ''), url: x.url, description: String(x.description || '')}));
}

async function wikipedia(query, lang){const r=await fetch(wikipediaSearchURL(query,lang),{headers:{'User-Agent':'LlamaNest/4 (local research assistant)'},signal:AbortSignal.timeout(10000)});return parseWikipediaSearch(await r.json(),lang);}
async function read(url) {
  const response = await fetchPublicArticle(url, {signal: AbortSignal.timeout(9000)});
  return await response.text();
}

const pass = (text, expect) => expect.every(re => re.test(text));
const only = args.only ? new Set(args.only.split(',').map(Number)) : null;
const rows = [];
for (const [i, item] of QUESTIONS.entries()) {
  if (only && !only.has(i + 1)) continue;
  const started = Date.now();
  let closed = '', web = {answer: '', sources: [], plan: null, check: null}, error = '';
  try {
    const history = item.history || [];
    const chat = history.map(m => m.text).join('\n');
    closed = await complete({user: (chat ? chat + '\n' : '') + item.q, maxTokens: 200});
    web = await research(item.q, {history, language: item.lang, deps: {complete, search, wikipedia, read}});
  } catch (e) { error = String(e.message || e); }
  const row = {n: i + 1, q: item.q, closedOk: pass(closed, item.expect), webOk: pass(web.answer, item.expect), seconds: Math.round((Date.now() - started) / 1000),
    queries: web.plan?.queries, sources: web.sources.map(s => s.url), check: web.check, closed, answer: web.answer, error};
  rows.push(row);
  console.log(`#${row.n} closed:${row.closedOk ? 'OK ' : 'NO '} web:${row.webOk ? 'OK ' : 'NO '} ${row.seconds}s  ${item.q}`);
  console.log('   queries:', JSON.stringify(row.queries), ' sources:', row.sources.length, error ? ' ERROR ' + error : '');
  console.log('   web   →', web.answer.replace(/\s+/g, ' ').slice(0, 260));
}
const total = rows.length;
console.log(`\nClosed book: ${rows.filter(r => r.closedOk).length}/${total}   Web RAG v4: ${rows.filter(r => r.webOk).length}/${total}`);
if (args.out) writeFileSync(args.out, JSON.stringify(rows, null, 2));
