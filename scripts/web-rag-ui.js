// Web RAG v4 browser I/O and toggle (inserted into main.js by build-rag-web.py).
// Search results and pages are untrusted data; they only reach the model as sources.
async function webRagSearch(query) {
  const response = await fetch('https://puri.li/api/search', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({q:query}), credentials:'omit', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('WEB_SEARCH_FAILED');
  const data = await response.json();
  return (Array.isArray(data.results) ? data.results : []).filter(x => x && typeof x.url === 'string' && x.url.startsWith('https://')).slice(0, 8)
    .map(x => ({title:String(x.title || '').slice(0, 300), url:x.url, description:String(x.description || '').slice(0, 1500)}));
}
async function webRagWikipedia(query, lang) {
  const response = await fetch(wikipediaSearchURL(query, lang) + '&origin=*', {credentials:'omit', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(10000)});
  if (!response.ok) return [];
  return parseWikipediaSearch(await response.json(), lang);
}
async function webRagRead(url) {
  const response = await fetch('/api/read-article', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url}), signal:AbortSignal.timeout(12000)});
  if (!response.ok) return null;
  const data = await response.json();
  return typeof data.html === 'string' ? data.html : null;
}
async function webRagGenerate({user, grammar, maxTokens}, signal) {
  let out = '';
  await streamChat([{role:'user', content:user}], token => { out += token; }, signal, false, 0, 0, grammar, maxTokens);
  return normalizeThinking(out);
}
function renderWebSearch() {
  const button = $('web-search-toggle');
  button.textContent = tr(webSearchEnabled ? 'webSearchOn' : 'webSearchOff');
  button.setAttribute('aria-pressed', String(webSearchEnabled));
  button.classList.toggle('on', webSearchEnabled);
  button.disabled = busy;
  if (webSearchEnabled && !isRemote(selectedId)) document.querySelector('.composer-note').textContent = tr('webSearchNotice');
}
$('web-search-toggle').onclick = () => {
  if (busy) return;
  if (webSearchEnabled) { webSearchEnabled = false; render(); return; }
  $('web-search-dialog').showModal();
  $('web-search-enable').focus();
};
$('web-search-close').onclick = () => $('web-search-dialog').close();
$('web-search-enable').onclick = () => { webSearchEnabled = true; $('web-search-dialog').close(); render(); };
