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
  if (webSearchKey) { webSearchEnabled = true; render(); return; }
  $('web-search-dialog').showModal();
  $('web-search-key').focus();
};
$('web-search-close').onclick = () => $('web-search-dialog').close();
$('web-search-enable').onclick = () => {
  const key = $('web-search-key').value.trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(key)) { $('web-search-key').setCustomValidity(tr('webSearchKeyError')); $('web-search-key').reportValidity(); return; }
  $('web-search-key').setCustomValidity('');
  webSearchKey = key; $('web-search-key').value = '';
  webSearchEnabled = true; $('web-search-dialog').close(); render();
};
$('web-search-key').oninput = () => $('web-search-key').setCustomValidity('');
