(() => {
  const phone = navigator.userAgentData?.mobile === true || /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent);
  if (!phone) return;

  const copy = {
    it: ['Solo per PC e Mac', 'LlamaNest non è per smartphone al momento, ma ci stiamo lavorando.'],
    en: ['PC and Mac only', 'Not available for smartphones yet, but we are working on it.'],
    fr: ['Uniquement sur PC et Mac', 'Pas encore disponible sur smartphone, mais nous y travaillons.'],
    de: ['Nur für PC und Mac', 'Für Smartphones derzeit nicht verfügbar, aber wir arbeiten daran.'],
    es: ['Solo para PC y Mac', 'Todavía no está disponible para móviles, pero estamos trabajando en ello.']
  };
  const language = document.documentElement.lang.slice(0, 2).toLowerCase();
  const [label, message] = copy[language] || copy.en;
  const heroNote = document.querySelector('.hero-note');
  if (heroNote?.lastChild) heroNote.lastChild.textContent = label;

  const blocked = 'a[href="#download"], a[href="/app/"], a[href="/nuovo-web/"], a.download-card, .footer-links a[href*="/releases/tag/rust-"]';
  for (const link of document.querySelectorAll(blocked)) {
    link.addEventListener('click', event => {
      event.preventDefault();
      window.alert(message);
    });
  }
})();
