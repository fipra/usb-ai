"""Shared Web RAG v4 patch for browser builds (build-rag-web.py, build-prism-dual.py)."""


def apply(app, root, replace):
    """Add the web search v4 toggle and pipeline to a copied browser app.

    Apply before other patches that rewrite the end of main.js.
    """
    main = app / 'main.js'
    replace(main, "import './style.css';", "import './style.css';\nimport { gatherSources, answerMessages, isSmallTalk, finalizeAnswer, parseWikipediaSearch, wikipediaSearchURL } from './web-rag.js';")
    replace(main, 'let thinking = false, semanticEnabled = false;', 'let thinking = false, semanticEnabled = false;\nlet webSearchEnabled = false;')
    replace(main, "$('semantic-toggle').textContent = tr(semanticEnabled ? 'semanticOn' : 'semanticOff');", "renderWebSearch(); $('semantic-toggle').textContent = tr(semanticEnabled ? 'semanticOn' : 'semanticOff');")
    replace(main, "  $('semantic-toggle').disabled = value;", "  $('semantic-toggle').disabled = value;\n  $('web-search-toggle').disabled = value;")
    replace(main, "let pendingAnswer = '';", "let pendingAnswer = '';\n  let webRagFound = null, webRagToday = '', webRagContext = '';")
    replace(main, "    if (!isRemote(selectedId)) {\n      setStatus(tr('loading'), false, true);", """    if (webSearchEnabled && !isSmallTalk(text)) {
      if (isRemote(selectedId)) throw Error(tr('webSearchLocalOnly'));
      if (text.length > 600) throw Error(tr('webSearchLong'));
      setStatus(tr('loading'), false, true);
      await loadModel(selectedId, contextSize, cpuThreads, isWindows() ? windowsBackend : 'auto');
      const earlierMessages = editing ? previousMessages.slice(0, editIndex) : chat.messages.slice(0, -2);
      const signal = controller.signal;
      let found;
      try {
        found = await gatherSources(text, {history:earlierMessages, language, onStep:step => setStatus(tr('webRag_' + step), false, true), deps:{
          complete:request => webRagGenerate(request, signal).catch(error => { if (signal.aborted) throw error; return ''; }),
          search:webRagSearch, wikipedia:webRagWikipedia, read:webRagRead
        }});
      } catch (error) { if (signal.aborted) throw error; throw Error(tr('webSearchError')); }
      if (!found.sources.length) throw Error(tr('webSearchEmpty'));
      webRagFound = found.sources;
      answer.webSources = found.sources.map(s => ({title:s.title, url:s.url, date:s.date || ''}));
      webRagToday = found.today;
      webRagContext = earlierMessages.filter(m => m.role === 'user').map(m => m.text).join(' ');
      // Sources + recent conversation, so follow-up questions stay in context.
      const messages = answerMessages(text, found.sources, found.today, language, earlierMessages);
      for (const context of contexts) context.splice(0, context.length, ...messages);
      setStatus(tr('generating'), false, true);
    }
    if (!isRemote(selectedId)) {
      setStatus(tr('loading'), false, true);""")
    replace(main, 'else answer.text = normalizeThinking(pendingAnswer);', 'else answer.text = normalizeThinking(pendingAnswer);\n    if (webRagFound && answer.text) answer.text = finalizeAnswer(answer.text, webRagFound, text, language, webRagToday, webRagContext).text;')
    replace(main, "if (message.text) content.append(messageActions(chat, message));", """if (message.webSources?.length) {
  const details = node('details', undefined, 'source');
  details.append(node('summary', `${tr('webSearchSources')} (${message.webSources.length})`));
  for (const [index, source] of message.webSources.entries()) {
    try {
      const url = new URL(source.url);
      if (url.protocol !== 'https:') continue;
      const row = node('p'); const link = node('a', `[${index + 1}] ${source.title}${source.date ? ' · ' + source.date.slice(0, 10) : ''}`);
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link); details.append(row);
    } catch {}
  }
  content.append(details);
} if (message.text) content.append(messageActions(chat, message));""")
    replace(main, "setupRemoteUi();\ninit();", (root / 'scripts' / 'web-rag-ui.js').read_text() + "\nsetupRemoteUi();\ninit();")
    runtime = app / 'runtime.js'
    replace(runtime, 'temperature = 0.7) {', 'temperature = 0.7, grammar, maxTokensOverride) {')
    replace(runtime, '    max_tokens: maxTokens,', '    max_tokens: maxTokensOverride || maxTokens,\n    ...(grammar ? {grammar} : {}),')
    html = app / 'index.html'
    replace(html, '<button type="button" id="thinking-toggle"', '<button type="button" id="web-search-toggle" class="tool-chip" aria-pressed="false"></button><button type="button" id="thinking-toggle"')
    replace(html, '</body>', '''<dialog id="web-search-dialog"><header class="dialog-head"><h2 data-i18n="webSearchTitle"></h2><button type="button" class="close" id="web-search-close" aria-label="Close">×</button></header><div class="dialog-body"><p data-i18n="webSearchPrivacy"></p><p class="hint" data-i18n="webSearchFree"></p><p><a href="https://puri.li/terms" target="_blank" rel="noopener noreferrer" data-i18n="webSearchTerms"></a></p><button type="button" id="web-search-enable" class="action" data-i18n="webSearchActivate"></button></div></dialog></body>''')
    with (app / 'i18n.js').open('a') as out:
        out.write('\n' + (root / 'scripts' / 'web-rag-strings.js').read_text())
