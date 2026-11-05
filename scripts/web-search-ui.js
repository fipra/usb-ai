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
$('web-search-enable').onclick = () => {
  webSearchEnabled = true; $('web-search-dialog').close(); render();
};
