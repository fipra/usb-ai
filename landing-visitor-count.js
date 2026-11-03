(() => {
  const counter = document.getElementById('visitor-counter');
  const number = document.getElementById('visitor-count');
  if (!counter || !number) return;
  fetch('/api/visitor-count', { method: 'POST', cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      if (!Number.isSafeInteger(data.count) || data.count < 1) return;
      number.textContent = new Intl.NumberFormat(document.documentElement.lang).format(data.count);
      counter.hidden = false;
    }).catch(() => {});
})();
