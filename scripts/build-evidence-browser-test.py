#!/usr/bin/env python3
"""Generate a self-contained browser regression fixture for the article reader."""
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
code = (root / 'web/usb-ai-web/evidence-reader.js').read_text().replace('export ', '')
tests = r'''
const long = 'This is a sufficiently long news paragraph describing the USA election and its reported results. ';
const html = '<main><article><p>'+long+'First update.</p></article><article><p>'+long+'Second update: the Orange party won.</p><p>The Orange party won 230 seats.</p></article></main>';
const extracted = extractArticle(html);
const noMain = extractArticle(html.replace('<main>','').replace('</main>',''));
const inert = extractArticle('<article><script>window.readerInjected=true;<\/script><p>'+long+'</p></article>');
const passed = extracted.includes('First update') && extracted.includes('Second update') && extracted.includes('The Orange party won 230 seats.') && noMain.includes('Second update') && !inert.includes('readerInjected') && !window.readerInjected;
document.body.textContent = passed ? 'PASS: multiple live updates, article fallback, inert scripts' : 'FAIL';
'''
script = (code + tests).replace('</script', '<\\/script')
Path(sys.argv[1]).write_text('<!doctype html><title>Evidence Reader regression tests</title><body><script>' + script + '</script>')
