let webSearchEnabled = false, webSearchController = null;
function renderWebSearch() {
  const button = $('web-search-toggle');
  button.textContent = tr(webSearchEnabled ? 'webSearchOn' : 'webSearchOff');
  button.setAttribute('aria-pressed', String(webSearchEnabled));
  button.classList.toggle('on', webSearchEnabled);
  button.disabled = busy;
}
$('web-search-toggle').onclick = () => {
  if (busy) return;
  if (webSearchEnabled) { webSearchEnabled = false; render(); return; }
  $('web-search-dialog').showModal();
};
$('web-search-close').onclick = () => $('web-search-dialog').close();
$('web-search-enable').onclick = () => { webSearchEnabled = true; $('web-search-dialog').close(); render(); };
