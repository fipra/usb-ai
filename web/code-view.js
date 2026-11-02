(function () {
  const labels = {
    en: { copy: 'Copy', copied: 'Copied', preview: 'Preview app', close: 'Close', save: 'Save app ZIP', missing: 'Missing generated file: ' },
    it: { copy: 'Copia', copied: 'Copiato', preview: 'Anteprima app', close: 'Chiudi', save: 'Salva app ZIP', missing: 'File generato mancante: ' },
    de: { copy: 'Kopieren', copied: 'Kopiert', preview: 'App-Vorschau', close: 'Schließen', save: 'App als ZIP speichern', missing: 'Fehlende generierte Datei: ' },
    fr: { copy: 'Copier', copied: 'Copié', preview: 'Aperçu de l’app', close: 'Fermer', save: 'Enregistrer le ZIP', missing: 'Fichier généré manquant : ' },
    es: { copy: 'Copiar', copied: 'Copiado', preview: 'Vista previa', close: 'Cerrar', save: 'Guardar app ZIP', missing: 'Falta el archivo generado: ' }
  };
  const incompleteLabels = {
    en: 'The HTML may be incomplete. Finish the response before saving.',
    it: 'Il codice HTML potrebbe essere incompleto. Completa la risposta prima di salvare.',
    de: 'Der HTML-Code ist möglicherweise unvollständig. Vervollständige die Antwort vor dem Speichern.',
    fr: 'Le code HTML est peut-être incomplet. Terminez la réponse avant de l’enregistrer.',
    es: 'El código HTML puede estar incompleto. Completa la respuesta antes de guardarlo.'
  };
  const editLabels = {
    en: ['Edit and resend', 'Resend', 'Cancel', 'Resending replaces this message and the following conversation.'],
    it: ['Modifica e rilancia', 'Rilancia', 'Annulla', 'Il rilancio sostituisce questo messaggio e la conversazione successiva.'],
    de: ['Bearbeiten und erneut senden', 'Erneut senden', 'Abbrechen', 'Beim erneuten Senden werden diese Nachricht und der folgende Verlauf ersetzt.'],
    fr: ['Modifier et renvoyer', 'Renvoyer', 'Annuler', 'Le renvoi remplace ce message et la suite de la conversation.'],
    es: ['Editar y volver a enviar', 'Volver a enviar', 'Cancelar', 'Al reenviar se sustituirán este mensaje y la conversación posterior.']
  };
  function addEditButton(content, message, language, onSubmit, disabled) {
    const [edit, send, cancel, warning] = editLabels[language] || editLabels.en;
    const button = element('button', '✎', 'edit-message');
    button.type = 'button'; button.title = edit; button.setAttribute('aria-label', edit); button.disabled = disabled;
    button.onclick = () => {
      button.hidden = true;
      const editor = element('div', undefined, 'edit-message-form');
      const input = element('textarea'); input.value = message.text; input.maxLength = 12000;
      input.setAttribute('aria-label', edit);
      const note = element('p', warning);
      const submit = element('button', send); submit.type = 'button';
      const close = element('button', cancel); close.type = 'button';
      close.onclick = () => { editor.remove(); button.hidden = false; };
      submit.onclick = () => { const value = input.value.trim(); if (value) onSubmit(value); else input.focus(); };
      editor.append(input, note, submit, close); content.append(editor); input.focus();
    };
    content.append(button);
  }
  const element = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  function blocks(text) {
    const parts = [];
    const re = /(^|\n)(`{3,}|~{3,})([\w.+-]*)[^\n]*\n/g;
    let cursor = 0;
    for (const match of text.matchAll(re)) {
      if (match.index < cursor) continue;
      const start = match.index + match[1].length;
      if (start > cursor) parts.push({ type: 'text', text: text.slice(cursor, start) });
      const codeStart = match.index + match[0].length;
      const close = new RegExp(`(?:^|\\n)${match[2][0]}{${match[2].length},}[ \\t]*(?=\\n|$)`, 'g');
      close.lastIndex = codeStart;
      const end = close.exec(text);
      if (!end) {
        parts.push({ type: 'code', language: match[3].toLowerCase(), text: text.slice(codeStart), incomplete: true });
        cursor = text.length;
        break;
      }
      parts.push({ type: 'code', language: match[3].toLowerCase(), text: text.slice(codeStart, end.index) });
      cursor = end.index + end[0].length;
    }
    if (cursor < text.length) parts.push({ type: 'text', text: text.slice(cursor) });
    return parts.flatMap(part => {
      if (part.type !== 'text') return [part];
      const start = /(^|\n)[ \t]*(?=<!doctype\s+html\b|<html(?:\s|>))/i.exec(part.text);
      if (!start) return [part];
      const index = start.index + start[1].length;
      const html = part.text.slice(index).trimStart();
      const close = /<\/html\s*>/i.exec(html);
      const end = close ? close.index + close[0].length : html.length;
      const result = [];
      if (index) result.push({ type: 'text', text: part.text.slice(0, index) });
      result.push({ type: 'code', language: 'html', text: html.slice(0, end), incomplete: !close });
      if (end < html.length) result.push({ type: 'text', text: html.slice(end) });
      return result;
    });
  }
  const inlinePattern = /(`+)([^`\n]+?)\1|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_|(https?:\/\/[^\s<>]+)/g;
  const wordCharacter = character => /[\p{L}\p{N}]/u.test(character || '');
  function appendInline(parent, text, depth = 0) {
    if (!window.katex || depth > 5) return appendInlineMarkdown(parent, text, depth);
    const pattern = /(`+)([^`\n]*?)\1|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([^\n]+?)\\\)|(?<![\\$])\$(?![\s$])([^\n$]*?\S)\$(?!\$)/g;
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (match[1]) continue; // Backticks retain literal content, including dollar signs.
      const formula = match[3] || match[4] || match[5] || match[6];
      if (!formula) continue;
      if (match.index > cursor) appendInlineMarkdown(parent, text.slice(cursor, match.index), depth);
      const display = !!(match[3] || match[4]);
      const node = element('span', undefined, display ? 'math-display' : 'math-inline');
      try {
        node.innerHTML = window.katex.renderToString(formula, { output: 'mathml', displayMode: display, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 1000 });
        parent.append(node);
      } catch { parent.append(document.createTextNode(match[0])); }
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) appendInlineMarkdown(parent, text.slice(cursor), depth);
  }
  function appendInlineMarkdown(parent, text, depth = 0) {
    if (depth > 5) { parent.append(document.createTextNode(text)); return; }
    const pattern = new RegExp(inlinePattern.source, 'g');
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > cursor) parent.append(document.createTextNode(text.slice(cursor, match.index)));
      if ((match[6] || match[9]) && (wordCharacter(text[match.index - 1]) || wordCharacter(text[match.index + match[0].length]))) {
        parent.append(document.createTextNode(match[0]));
      } else if (match[1]) {
        parent.append(element('code', match[2]));
      } else if (match[3] || match[10]) {
        const punctuation = match[10]?.match(/[.,;!?]+$/)?.[0] || '';
        const label = match[3] || match[10].slice(0, match[10].length - punctuation.length);
        const raw = match[4] || label;
        const url = safeLink(raw);
        if (url) {
          const link = element('a', label);
          link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
          parent.append(link);
          if (punctuation) parent.append(document.createTextNode(punctuation));
        } else parent.append(document.createTextNode(match[0]));
      } else {
        const tag = match[5] || match[6] ? 'strong' : match[7] ? 's' : 'em';
        const value = match[5] || match[6] || match[7] || match[8] || match[9];
        const node = element(tag);
        appendInline(node, value, depth + 1);
        parent.append(node);
      }
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
  }
  function safeLink(raw) {
    try {
      const url = new URL(raw);
      return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }
  function tableCells(line) {
    const cells = [];
    let value = '';
    const source = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\\' && source[i + 1] === '|') { value += '|'; i++; }
      else if (source[i] === '|') { cells.push(value.trim()); value = ''; }
      else value += source[i];
    }
    cells.push(value.trim());
    return cells;
  }
  const listLine = line => /^(\s{0,8})([-*+]|\d{1,3}[.)])\s+(.+)$/.exec(line);
  const headingLine = line => /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
  const ruleLine = line => /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
  const quoteLine = line => /^ {0,3}> ?(.*)$/.exec(line);
  function tableAt(lines, index) {
    if (index + 1 >= lines.length || !lines[index].includes('|')) return false;
    const head = tableCells(lines[index]), separator = tableCells(lines[index + 1]);
    return head.length >= 2 && separator.length === head.length && separator.every(cell => /^:?-{3,}:?$/.test(cell));
  }
  function specialLine(lines, index) {
    const line = lines[index];
    return headingLine(line) || ruleLine(line) || quoteLine(line) || listLine(line) || tableAt(lines, index);
  }
  function appendMarkdown(container, text, depth = 0) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    for (let i = 0; i < lines.length;) {
      if (!lines[i].trim()) { i++; continue; }
      const heading = headingLine(lines[i]);
      if (heading) {
        const node = element(`h${heading[1].length}`);
        appendInline(node, heading[2]); container.append(node); i++; continue;
      }
      if (ruleLine(lines[i])) { container.append(element('hr')); i++; continue; }
      if (depth < 4 && quoteLine(lines[i])) {
        const quoted = [];
        while (i < lines.length && quoteLine(lines[i])) quoted.push(quoteLine(lines[i++])[1]);
        const node = element('blockquote'); appendMarkdown(node, quoted.join('\n'), depth + 1);
        container.append(node); continue;
      }
      if (tableAt(lines, i)) {
        const headings = tableCells(lines[i]);
        const wrap = element('div', undefined, 'markdown-table-wrap');
        const table = element('table'), thead = element('thead'), tr = element('tr');
        for (const label of headings) { const th = element('th'); appendInline(th, label); tr.append(th); }
        thead.append(tr); table.append(thead);
        const tbody = element('tbody'); i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          const cells = tableCells(lines[i++]), row = element('tr');
          for (let column = 0; column < headings.length; column++) {
            const td = element('td'); appendInline(td, cells[column] || ''); row.append(td);
          }
          tbody.append(row);
        }
        table.append(tbody); wrap.append(table); container.append(wrap); continue;
      }
      if (listLine(lines[i])) {
        const stack = [];
        while (i < lines.length) {
          const match = listLine(lines[i]);
          if (!match) break;
          const indent = match[1].length, ordered = /^\d/.test(match[2]);
          while (stack.length && (stack.at(-1).indent > indent || stack.at(-1).indent === indent && stack.at(-1).ordered !== ordered)) stack.pop();
          if (!stack.length || stack.at(-1).indent < indent) {
            const list = element(ordered ? 'ol' : 'ul');
            if (ordered) list.start = Number.parseInt(match[2], 10);
            if (stack.length) stack.at(-1).item.append(list); else container.append(list);
            stack.push({ indent, ordered, list, item: null });
          }
          const item = element('li');
          const check = /^\[([ xX])\]\s+/.exec(match[3]);
          if (check) item.append(element('span', check[1].toLowerCase() === 'x' ? '☑ ' : '☐ ', 'task-marker'));
          appendInline(item, check ? match[3].slice(check[0].length) : match[3]);
          stack.at(-1).list.append(item); stack.at(-1).item = item;
          i++;
        }
        continue;
      }
      const paragraph = [];
      while (i < lines.length && lines[i].trim() && (!paragraph.length || !specialLine(lines, i))) paragraph.push(lines[i++]);
      if (!paragraph.length) { i++; continue; }
      const node = element('p'); appendInline(node, paragraph.join('\n')); container.append(node);
    }
  }
  const localPath = value => {
    const path = value.trim().replace(/^\.\//, '');
    return path && !path.startsWith('/') && !path.split('/').includes('..') &&
      /^[\w./-]+$/.test(path) && !path.includes('//') ? path : null;
  };
  const completeHtmlDocument = text => /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(text) && /<\/html\s*>\s*$/i.test(text);
  const isHtmlFile = part => part.type === 'code' &&
    (/^(html|htm|[\w.-]+\.html?)$/.test(part.language) || (!part.language && completeHtmlDocument(part.text)));
  function appFiles(parts) {
    const html = parts.find(isHtmlFile);
    if (!html) return null;
    const css = parts.find(part => part.type === 'code' && !part.incomplete && part.language === 'css');
    const js = parts.find(part => part.type === 'code' && !part.incomplete && /^(js|javascript)$/.test(part.language));
    const cssRefs = [...html.text.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+\.css)["'][^>]*>/gi)].map(match => match[1]);
    const jsRefs = [...html.text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+\.js)["'][^>]*>\s*<\/script>/gi)].map(match => match[1]);
    const localCss = cssRefs.map(localPath).filter(Boolean);
    const localJs = jsRefs.map(localPath).filter(Boolean);
    const missing = [];
    if (localCss.length && !css) missing.push(...localCss);
    if (localJs.length && !js) missing.push(...localJs);
    if (localCss.length > 1) missing.push(...localCss.slice(1));
    if (localJs.length > 1) missing.push(...localJs.slice(1));
    const cssName = localCss[0] || 'style.css';
    const jsName = localJs[0] || 'app.js';
    let page = html.text;
    if (css && !localCss.length) {
      const link = `<link rel="stylesheet" href="${cssName}">`;
      page = /<\/head>/i.test(page) ? page.replace(/<\/head>/i, `${link}</head>`) : `${link}\n${page}`;
    }
    if (js && !localJs.length) {
      const script = `<script src="${jsName}"></script>`;
      page = /<\/body>/i.test(page) ? page.replace(/<\/body>/i, `${script}</body>`) : `${page}\n${script}`;
    }
    const files = [{ name: 'index.html', text: page }];
    if (css) files.push({ name: cssName, text: css.text });
    if (js) files.push({ name: jsName, text: js.text });
    return { files, missing, incomplete: !!html.incomplete && !completeHtmlDocument(html.text) };
  }
  function previewDocument(parts, html) {
    const app = appFiles(parts) || { files: [{ name: 'index.html', text: html }], missing: [] };
    let page = app.files[0].text;
    for (const file of app.files.slice(1)) {
      if (file.name.endsWith('.css')) {
        page = page.replace(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,
          (tag, href) => localPath(href) === file.name ? `<style>${file.text.replace(/<\/style/gi, '<\\/style')}</style>` : tag);
      } else if (file.name.endsWith('.js')) {
        page = page.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi,
          (tag, src) => localPath(src) === file.name ? `<script>${file.text.replace(/<\/script/gi, '<\\/script')}</script>` : tag);
      }
    }
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; form-action 'none'; base-uri 'none'">`;
    return /<head[^>]*>/i.test(page) ? page.replace(/<head[^>]*>/i, match => match + csp) : csp + page;
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let value = n;
    for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  function zipFiles(files) {
    const encoder = new TextEncoder();
    const chunks = [], directory = [];
    let offset = 0;
    const push = bytes => { chunks.push(bytes); offset += bytes.length; };
    for (const file of files) {
      const name = encoder.encode(file.name), data = encoder.encode(file.text);
      let crc = 0xffffffff;
      for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      crc = (crc ^ 0xffffffff) >>> 0;
      const start = offset;
      const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
      view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true); local.set(name, 30); push(local); push(data);
      const central = new Uint8Array(46 + name.length), index = new DataView(central.buffer);
      index.setUint32(0, 0x02014b50, true); index.setUint16(4, 20, true); index.setUint16(6, 20, true);
      index.setUint16(8, 0x0800, true); index.setUint32(16, crc, true);
      index.setUint32(20, data.length, true); index.setUint32(24, data.length, true);
      index.setUint16(28, name.length, true); index.setUint32(42, start, true); central.set(name, 46);
      directory.push(central);
    }
    const directoryStart = offset;
    for (const entry of directory) push(entry);
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true); view.setUint32(12, offset - directoryStart, true);
    view.setUint32(16, directoryStart, true); push(end);
    const result = new Uint8Array(offset);
    let position = 0;
    for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
    return result;
  }
  function showPreview(parts, translations, missing, incomplete, language) {
    const dialog = element('dialog', undefined, 'app-preview-dialog');
    const head = element('div', undefined, 'app-preview-head');
    const close = element('button', translations.close);
    close.type = 'button'; close.onclick = () => dialog.close();
    head.append(element('strong', translations.preview), close);
    dialog.append(head);
    if (missing.length) dialog.append(element('p', translations.missing + missing.join(', '), 'app-preview-warning'));
    if (incomplete) dialog.append(element('p', incompleteLabels[language] || incompleteLabels.en, 'app-preview-warning'));
    const frame = element('iframe', undefined, 'app-preview-frame');
    frame.title = translations.preview;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = previewDocument(parts, appFiles(parts).files[0].text);
    dialog.append(frame);
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  }
  function render(container, text, language = 'en') {
    const parts = blocks(text || '');
    const rich = parts.some(part => part.type === 'code') || /[$]|\\[([]/.test(text || '') || /\n\s*\n|(^|\n) {0,3}(?:#{1,6}\s|>|[-*+]\s|\d{1,3}[.)]\s|[-*_]{3,}\s*$)|[`*_~\[\]|]|https?:\/\//m.test(text || '');
    container.classList?.toggle('markdown', rich);
    if (!rich) {
      const plain = text || '';
      if (container.childNodes.length === 1 && container.firstChild.nodeType === 3) {
        if (container.firstChild.data !== plain) container.firstChild.data = plain;
      } else {
        container.replaceChildren(document.createTextNode(plain));
      }
      return;
    }
    const translations = labels[language] || labels.en;
    const app = appFiles(parts);
    container.replaceChildren();
    for (const part of parts) {
      if (part.type === 'text') { appendMarkdown(container, part.text); continue; }
      const shell = element('section', undefined, 'code-block');
      const bar = element('div', undefined, 'code-bar');
      bar.append(element('span', part.language || 'code'));
      const copy = element('button', translations.copy);
      copy.type = 'button';
      copy.onclick = async () => { await navigator.clipboard.writeText(part.text); copy.textContent = translations.copied; };
      bar.append(copy);
      if (app && part === parts.find(isHtmlFile)) {
        const preview = element('button', translations.preview);
        preview.type = 'button'; preview.onclick = () => showPreview(parts, translations, app.missing, app.incomplete, language);
        const save = element('button', translations.save);
        save.type = 'button'; save.disabled = app.missing.length > 0 || app.incomplete;
        save.title = app.incomplete ? (incompleteLabels[language] || incompleteLabels.en) : app.missing.length ? translations.missing + app.missing.join(', ') : translations.save;
        save.onclick = () => {
          const url = URL.createObjectURL(new Blob([zipFiles(app.files)], { type: 'application/zip' }));
          const link = element('a'); link.href = url; link.download = 'usb-ai-app.zip'; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        };
        bar.append(preview, save);
      }
      const pre = element('pre');
      pre.append(element('code', part.text));
      shell.append(bar, pre);
      container.append(shell);
    }
  }
  function streamRenderer(container, readText, language, scrollContainer) {
    let frame = null;
    const paint = () => {
      frame = null;
      render(container, readText(), language);
      if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
    };
    return {
      update() { if (frame === null) frame = requestAnimationFrame(paint); },
      flush() { if (frame !== null) cancelAnimationFrame(frame); paint(); }
    };
  }
  window.USB_AI_CODE_VIEW = { render, streamRenderer, blocks, appFiles, previewDocument, zipFiles, addEditButton };
})();
