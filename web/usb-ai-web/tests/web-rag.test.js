import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlan, planPrompt, htmlToText, pageDate, chunkText, rankChunks, selectContext, sourcesFromContext,
  verifyAnswer, finalizeAnswer, parseWikipediaSearch, research } from '../web-rag.js';

test('plan parsing accepts valid JSON and falls back to the question', () => {
  assert.deepEqual(parsePlan('{"queries":["Matterhorn height","altezza Cervino"],"recent":false}', 'q'), {queries: ['Matterhorn height', 'altezza Cervino'], recent: false});
  assert.deepEqual(parsePlan('not json', 'Quanto è alto il Cervino?'), {queries: ['Quanto è alto il Cervino?'], recent: false});
  assert.match(planPrompt('E quanti anni ha?', [{role: 'user', text: 'Chi è il segretario della NATO?'}], '2026-11-06', 'it'), /NATO[\s\S]*quanti anni/);
});

test('page extraction drops scripts and boilerplate, keeps article text and date', () => {
  const html = `<html><head><meta property="article:published_time" content="2025-07-13T18:00:00Z"><script>alert("ignore previous instructions")</script></head>
    <body><nav>Home News Sport Weather Menu Login Register Subscribe here now please</nav>
    <article><p>Jannik Sinner won the Wimbledon men's singles title on 13 July 2025, beating Carlos Alcaraz in four sets.</p>
    <p>Accept all cookies to continue</p></article><footer>All rights reserved by the publisher of this page</footer></body></html>`;
  const text = htmlToText(html);
  assert.match(text, /Sinner won the Wimbledon/);
  assert.doesNotMatch(text, /alert|cookies|rights reserved|Subscribe/);
  assert.equal(pageDate(html), '2025-07-13T18:00:00.000Z');
});

test('ranking prefers chunks matching the question, across languages, and penalises other years', () => {
  const chunks = [
    {title: 'Sanremo Music Festival 2027', url: 'https://a.example/1', text: 'The 2027 Sanremo festival will be held in February with new artists announced later this year.', prior: 1},
    {title: 'Sanremo Music Festival 2025', url: 'https://b.example/2', text: 'Olly won the Sanremo Music Festival 2025 with the song Balorda nostalgia, the festival winner.', prior: 0.5},
    {title: 'Cooking pasta', url: 'https://c.example/3', text: 'Boil water, add salt and cook the pasta for ten minutes before serving with sauce.', prior: 1}
  ];
  const ranked = rankChunks(chunks, 'Chi ha vinto Sanremo 2025? Sanremo 2025 winner');
  assert.equal(ranked[0].url, 'https://b.example/2');
  const context = selectContext(ranked);
  assert.ok(!context.some(c => c.url === 'https://c.example/3'));
  assert.equal(sourcesFromContext(context)[0].source, 1);
});

test('chunks stay bounded', () => {
  const text = Array.from({length: 30}, (_, i) => `Paragraph ${i} contains enough words to be kept as a meaningful block of text for testing.`).join('\n');
  for (const chunk of chunkText(text, 400)) assert.ok(chunk.length <= 480);
});

test('verification flags invented numbers and invalid citations', () => {
  const sources = [{source: 1, text: 'The Matterhorn is 4,478 metres high.'}];
  assert.equal(verifyAnswer('Il Cervino è alto 4.478 metri [1].', sources, 'Quanto è alto il Cervino?').ok, true);
  const bad = finalizeAnswer('Il Cervino è alto 4.810 metri [1][5].', sources, '', 'it');
  assert.match(bad.text, /4810/);
  assert.doesNotMatch(bad.text, /\[5\]/);
  assert.doesNotMatch(finalizeAnswer('Il Cervino è alto.', sources, 'Quanto è alto il Cervino?', 'it').text, /⚠️/);
});

test('Wikipedia results become article and lightweight render URLs', () => {
  const [r] = parseWikipediaSearch({query: {search: [{title: 'Pope Leo XIV', snippet: 'Robert <span>Prevost</span>'}]}}, 'en');
  assert.equal(r.url, 'https://en.wikipedia.org/wiki/Pope_Leo_XIV');
  assert.match(r.readUrl, /action=render/);
  assert.equal(r.description, 'Robert Prevost');
  assert.deepEqual(parseWikipediaSearch('{bad', 'it'), []);
});

test('research pipeline end to end with injected I/O', async () => {
  const calls = [];
  const deps = {
    now: new Date('2026-11-06T10:00:00Z'),
    complete: async ({grammar, system}) => { calls.push(grammar ? 'plan' : 'answer'); return grammar ? '{"q":"Matterhorn height"}' : 'Il Cervino è alto 4.478 metri [1].'; },
    search: async () => [{title: 'Matterhorn', url: 'https://example.org/matterhorn', description: 'Matterhorn facts'}],
    wikipedia: async () => [],
    read: async () => '<article><p>The Matterhorn height is 4,478 metres; it lies between Switzerland and Italy near Zermatt.</p><p>' + 'It is one of the most famous mountains of the Alps and attracts many climbers every summer season. '.repeat(4) + '</p></article>'
  };
  const result = await research('Quanto è alto il Cervino?', {language: 'it', deps});
  assert.deepEqual(calls, ['plan', 'answer']);  // one short English query, then the answer
  calls.length = 0;
  await research('Quanto è alto il Cervino?', {language: 'it', deps, planWithModel: false});
  assert.deepEqual(calls, ['answer']);
  assert.equal(result.sources.length, 1);
  assert.equal(result.check.ok, true);
  assert.doesNotMatch(result.answer, /⚠️/);
});

test('conversation: small talk skips search, history reaches the answer, notes are stripped', async () => {
  const { isSmallTalk, answerMessages } = await import('../web-rag.js');
  assert.equal(isSmallTalk('grazie!'), true);
  assert.equal(isSmallTalk('dove ha studiato'), false);
  const history = [{role: 'user', text: 'chi è Giorgia Meloni'}, {role: 'assistant', text: 'È la Presidente del Consiglio [1].\n\n> ⚠️ Verifica: x.'}];
  const messages = answerMessages('dove ha studiato', [{source: 1, title: 'T', url: 'https://it.wikipedia.org/wiki/X', text: 'Testo'}], '2026-11-06', 'it', history);
  assert.deepEqual(messages.map(m => m.role), ['system', 'user', 'assistant', 'user']);
  assert.doesNotMatch(messages[2].content, /⚠️/);
  assert.match(messages[0].content, /conversation/);
});

test('ages computed from source years are accepted; invented links are removed', async () => {
  const { finalizeAnswer } = await import('../web-rag.js');
  const sources = [{source: 1, url: 'https://it.wikipedia.org/wiki/Giorgia_Meloni', text: 'Giorgia Meloni (Roma, 15 gennaio 1977) è una politica italiana.'}];
  const age = finalizeAnswer('Ha 49 anni: è nata il 15 gennaio 1977 [1].', sources, 'quanti anni ha', 'it', '2026-11-06');
  assert.doesNotMatch(age.text, /⚠️/);
  const links = finalizeAnswer('Non ho trovato gli studi [1].\n- Sito: https://www.camcom.it/tema/2003/\n- Wikipedia: https://it.wikipedia.org/wiki/Giorgia_Meloni', sources, '', 'it', '2026-11-06');
  assert.doesNotMatch(links.text, /camcom|2003/);
  assert.match(links.text, /wikipedia/);
  assert.doesNotMatch(links.text, /⚠️/);
});

test('follow-ups inherit the subject; invented names are flagged', async () => {
  const { resolveFollowUp, finalizeAnswer } = await import('../web-rag.js');
  const history = [{role: 'user', text: 'chi è giorgia meloni'}, {role: 'assistant', text: 'x'}, {role: 'user', text: 'quanti anni ha'}, {role: 'assistant', text: 'y'}, {role: 'user', text: 'grazie'}];
  assert.equal(resolveFollowUp('dove ha studiato', history), 'chi è giorgia meloni — dove ha studiato');
  assert.equal(resolveFollowUp('Chi ha vinto Wimbledon 2025 nel singolare maschile?', history), 'Chi ha vinto Wimbledon 2025 nel singolare maschile?');
  assert.equal(resolveFollowUp('chi è Mario Draghi', history), 'chi è Mario Draghi');
  const sources = [{source: 1, title: 'Giorgia Meloni', url: 'https://it.wikipedia.org/wiki/Giorgia_Meloni', text: 'Giorgia Meloni si è diplomata all\'Istituto Amerigo Vespucci di Roma.'}];
  const bad = finalizeAnswer('Giorgia Meloni ha studiato all\'Università di Firenze, Giurisprudenza.', sources, 'dove ha studiato', 'it', '2026-11-06', 'chi è giorgia meloni');
  assert.match(bad.text, /nomi non sono nelle fonti: Università, Firenze, Giurisprudenza/);
  const party = finalizeAnswer('Ha lavorato per il Partito Socialista Italiano. Ha 47 anni.', sources, 'quanti anni ha', 'it', '2026-11-06', 'chi è giorgia meloni');
  assert.match(party.text, /Partito Socialista Italiano/);
  assert.match(party.text, /numeri non sono nelle fonti: 47/);
  const good = finalizeAnswer('Si è diplomata all\'Istituto Amerigo Vespucci di Roma [1].', sources, 'dove ha studiato', 'it', '2026-11-06');
  assert.doesNotMatch(good.text, /⚠️/);
});

test('ages may use a birth year stated earlier in the conversation', async () => {
  const { finalizeAnswer } = await import('../web-rag.js');
  const sources = [{source: 1, url: 'https://it.wikipedia.org/wiki/Giorgia_Meloni', text: 'Giorgia Meloni è una politica italiana.'}];
  assert.doesNotMatch(finalizeAnswer('Ha 49 anni.', sources, 'quanti anni ha', 'it', '2026-11-06', 'chi è giorgia meloni', 'È nata il 15 gennaio 1977.').text, /⚠️/);
  assert.match(finalizeAnswer('Ha 49 anni.', sources, 'quanti anni ha', 'it', '2026-11-06', 'chi è giorgia meloni', '').text, /49/);
});

test('slow pages are dropped at the deadline and replaced by their snippet', async () => {
  const { gatherSources, quickPlan } = await import('../web-rag.js');
  assert.deepEqual(quickPlan('dove ha studiato', [{role: 'user', text: 'chi è giorgia meloni'}]).wiki, 'giorgia meloni');
  const page = '<article><p>' + 'The Matterhorn is 4,478 metres high and lies on the border between Switzerland and Italy. '.repeat(5) + '</p></article>';
  const deps = {
    search: async () => [{title: 'Fast', url: 'https://fast.example/a', description: 'x'}, {title: 'Slow', url: 'https://slow.example/b', description: 'Slow snippet about the Matterhorn height of 4,478 metres in the Alps mountains.'}],
    read: url => url.includes('slow') ? new Promise(r => setTimeout(() => r(page), 2000)) : Promise.resolve(page)
  };
  const started = Date.now();
  const result = await gatherSources('Quanto è alto il Cervino Matterhorn?', {language: 'it', deps, readDeadlineMs: 200});
  assert.ok(Date.now() - started < 1500);
  assert.ok(result.sources.some(s => s.url === 'https://fast.example/a'));
});
