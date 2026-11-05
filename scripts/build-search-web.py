#!/usr/bin/env python3
"""Build an isolated web-search experiment from the regular browser app."""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
web = root / 'web'

def replace(path, old, new):
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f'Expected text missing in {path}: {old[:80]}')
    path.write_text(text.replace(old, new, 1))

with tempfile.TemporaryDirectory(prefix='llamanest-search-') as tmp:
    work = Path(tmp) / 'web'
    shutil.copytree(web, work, ignore=shutil.ignore_patterns('node_modules', 'dist'))
    (work / 'node_modules').symlink_to(web / 'node_modules', target_is_directory=True)
    app = work / 'usb-ai-web'
    main = app / 'main.js'
    replace(main, "import './style.css';", "import './style.css';\nimport { prepareWebResults, webSearchQuestion } from './web-search.js';")
    replace(main, 'let thinking = false, semanticEnabled = false;', 'let thinking = false, semanticEnabled = false;\nlet webSearchEnabled = false, webSearchKey = "";')
    replace(main, "$('semantic-toggle').textContent = tr(semanticEnabled ? 'semanticOn' : 'semanticOff');", "renderWebSearch(); $('semantic-toggle').textContent = tr(semanticEnabled ? 'semanticOn' : 'semanticOff');")
    replace(main, "  $('semantic-toggle').disabled = value;", "  $('semantic-toggle').disabled = value;\n  $('web-search-toggle').disabled = value;")
    replace(main, "    if (!isRemote(selectedId)) {\n      setStatus(tr('loading'), false, true);", """    if (webSearchEnabled) {
      if (isRemote(selectedId)) throw Error(tr('webSearchLocalOnly'));
      if (text.length > 600 || text.trim().split(/\\s+/).length > 75) throw Error(tr('webSearchLong'));
      setStatus(tr('webSearchSearching'), false, true);
      const response = await fetch('/api/web-search', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:text, key:webSearchKey, language}), signal:controller.signal});
      if (!response.ok) {
        if (response.status === 401) { webSearchKey = ''; webSearchEnabled = false; }
        throw Error(response.status === 401 ? tr('webSearchKeyError') : response.status === 429 ? tr('webSearchLimit') : tr('webSearchError'));
      }
      const result = await response.json();
      const entries = prepareWebResults(result.results);
      if (!entries.length) throw Error(tr('webSearchEmpty'));
      answer.webSources = entries;
      for (const context of contexts) {
        const last = context.at(-1);
        last.content = webSearchQuestion(last.content, entries);
      }
    }
    if (!isRemote(selectedId)) {
      setStatus(tr('loading'), false, true);""")
    replace(main, "if (message.text) content.append(messageActions(chat, message));", """if (message.webSources?.length) {
  const details = node('details', undefined, 'source');
  details.append(node('summary', `${tr('webSearchSources')} (${message.webSources.length})`));
  for (const [index, source] of prepareWebResults(message.webSources).entries()) {
    const row = node('p'); const link = node('a', `[${index + 1}] ${source.title}`);
    link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link); details.append(row);
  }
  content.append(details);
} if (message.text) content.append(messageActions(chat, message));""")
    replace(main, "setupRemoteUi();\ninit();", (root / 'scripts' / 'web-search-ui.js').read_text() + "\nsetupRemoteUi();\ninit();")
    replace(app / 'storage.js', "const DB = 'usb-ai-web-v1'", "const DB = 'usb-ai-web-search-experiment-v1'")
    replace(app / 'public' / 'sw.js', 'usb-ai-web-shell-', 'usb-ai-search-experiment-shell-')
    html = app / 'index.html'
    replace(html, '<button type="button" id="thinking-toggle"', '<button type="button" id="web-search-toggle" class="tool-chip" aria-pressed="false"></button><button type="button" id="thinking-toggle"')
    replace(html, '</body>', '''<dialog id="web-search-dialog"><header class="dialog-head"><h2 data-i18n="webSearchTitle"></h2><button type="button" class="close" id="web-search-close" aria-label="Close">×</button></header><div class="dialog-body"><p data-i18n="webSearchPrivacy"></p><p><a href="https://app.tavily.com/" target="_blank" rel="noopener noreferrer" data-i18n="webSearchGetKey"></a></p><label><span data-i18n="webSearchKey"></span> <input type="password" id="web-search-key" autocomplete="off" maxlength="200"></label><p class="hint" data-i18n="webSearchKeyNote"></p><button type="button" id="web-search-enable" class="action" data-i18n="webSearchActivate"></button></div></dialog></body>''')
    with (app / 'i18n.js').open('a') as out:
        out.write('\n' + (root / 'scripts' / 'web-search-strings.js').read_text())
    env = dict(os.environ, USB_AI_WEB_BASE='/ricerca-web/')
    subprocess.run(['npm', 'run', 'build'], cwd=work, env=env, check=True)
    shutil.copytree(work / 'dist', root / '.vercel-static' / 'ricerca-web', dirs_exist_ok=True)
