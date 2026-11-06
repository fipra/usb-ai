function prepareNewsResults(results) {
  const clean = value => value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return results.flatMap(result => {
    if (!result || typeof result.title !== 'string' || typeof result.url !== 'string' || typeof result.description !== 'string') return [];
    let url;
    try { url = new URL(result.url); } catch { return []; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
    const title = clean(result.title).slice(0, 150), description = clean(result.description).slice(0, 1800);
    return title && description ? [{title, url:url.href, description}] : [];
  }).slice(0, 3);
}
function newsMatchScore(query, entry) {
  const stop = new Set(['delle','della','degli','dello','dalla','sono','quale','cerca','risultati','notizie','the','and','what','when','news','results','from','with','about','this','that','pour','dans','avec','para','las','los','como','oder','die','der','und']);
  const tokens = value => (value.toLowerCase().replace(/elezioni|elections|wahl|élections|elecciones/g,'election').replace(/medio termine|metà mandato|midterms/g,'midterm').replace(/\b(?:stati\s+uniti|united\s+states|u\.?s\.?a?\.?)\b/g, ' usa ').match(/[\p{L}\p{N}]{3,}/gu) || []);
  const terms = [...new Set(tokens(query).filter(x => !stop.has(x) && !/^\d{4}$/.test(x)))];
  const words = new Set(tokens(entry.title + ' ' + entry.description.split(': ').slice(1).join(': ')));
  const matches = terms.filter(term => words.has(term)).length;
  return terms.length > 1 && matches < 2 ? 0 : matches;
}
// Google News returns headlines, not the full articles. Treat them accordingly.
async function searchNewsOnce(query, language, signal) {
  const discovery = fetch('/article-discovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal}).then(r=>r.ok?r.json():{}).catch(()=>({}));
  const request = fetch('/news-search', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({query, language}), signal, credentials: 'same-origin'
  });
  const feedsRequest = fetch('/news-feeds', {method:'POST', signal, credentials:'same-origin'}).catch(() => null);
  const response = await request;
  if (!response.ok) throw Error('WEB_SEARCH_FAILED');
  const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
  if (xml.querySelector('parsererror')) throw Error('WEB_SEARCH_FAILED');
  const entries = Array.from(xml.querySelectorAll('channel > item')).slice(0, 10).map(item => {
    const title = item.querySelector('title')?.textContent || '';
    const url = item.querySelector('link')?.textContent || '';
    const date = item.querySelector('pubDate')?.textContent || '';
    return {title, url, description: `Google News headline only; published ${date}: ${title}`};
  });
  const feedResponse = await feedsRequest;
  if (feedResponse?.ok) {
    let feeds = [];
    try { feeds = await feedResponse.json(); } catch {}
    for (const raw of Array.isArray(feeds) ? feeds.slice(0, 5) : []) {
      if (typeof raw !== 'string') continue;
      const doc = new DOMParser().parseFromString(raw, 'application/xml');
      if (doc.querySelector('parsererror')) continue;
      for (const item of Array.from(doc.querySelectorAll('channel > item')).slice(0, 80)) {
        const title = item.querySelector('title')?.textContent || '';
        const url = item.querySelector('link')?.textContent || '';
        const date = item.querySelector('pubDate')?.textContent || '';
        const summary = (item.querySelector('description')?.textContent || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (title && summary) entries.push({title, url, description:`RSS summary; published ${date}: ${summary}`});
      }
    }
  }
  const payload = await discovery;
  for (const item of Array.isArray(payload.results) ? payload.results.slice(0,10) : []) {
    if (typeof item.title === 'string' && typeof item.url === 'string') entries.push({title:item.title,url:item.url,description:typeof item.description === 'string' ? item.description : ''});
  }
  const ranked = entries.map((entry, i) => ({entry, i, score:newsMatchScore(query, entry)})).sort((a,b) => b.score-a.score || Number(b.entry.description.startsWith('RSS summary;')) - Number(a.entry.description.startsWith('RSS summary;')) || a.i-b.i);
  const selected = ranked.filter(x => x.score > 0 && !x.entry.url.includes('news.google.com')).map(x => x.entry);
  return readCandidates(selected, '/read-article', signal);
}

const newsStrings = {
  en: ['Your question and an earlier question for follow-ups are sent to Google News. Google, BBC, The Guardian and ANSA can see your IP address. The local model receives Google News headlines and RSS summaries from BBC, The Guardian and ANSA, not full articles.', 'News results can be incomplete or outdated. No API key is required.', 'Google privacy policy', 'The question is sent to Google News; the model runs locally.'],
  it: ['La domanda e, per le richieste successive, una domanda precedente vengono inviate a Google News. Google, BBC, The Guardian e ANSA possono vedere il tuo indirizzo IP. Il modello locale riceve titoli di Google News e riassunti RSS di BBC, The Guardian e ANSA, non gli articoli completi.', 'I risultati possono essere incompleti o non aggiornati. Non serve una chiave API.', 'Informativa sulla privacy di Google', 'La domanda viene inviata a Google News; il modello risponde in locale.'],
  fr: ['Votre question et, pour les suivis, une question précédente sont envoyées à Google News. Google, BBC, The Guardian et ANSA peuvent voir votre adresse IP. Le modèle local reçoit les titres Google News et les résumés RSS de BBC, The Guardian et ANSA, pas les articles complets.', 'Les résultats peuvent être incomplets ou anciens. Aucune clé API nécessaire.', 'Confidentialité Google', 'La question est envoyée à Google News ; le modèle reste local.'],
  de: ['Deine Frage und bei Folgefragen eine frühere Frage werden an Google News gesendet; Google, BBC, The Guardian und ANSA können deine IP-Adresse sehen. Das lokale Modell erhält Google-News-Schlagzeilen und RSS-Zusammenfassungen von BBC, The Guardian und ANSA, keine vollständigen Artikel.', 'Ergebnisse können unvollständig oder veraltet sein. Kein API-Schlüssel erforderlich.', 'Google-Datenschutzerklärung', 'Die Frage wird an Google News gesendet; das Modell läuft lokal.'],
  es: ['Tu pregunta y, para consultas posteriores, una pregunta anterior se envían a Google News. Google, BBC, The Guardian y ANSA pueden ver tu IP. El modelo local recibe titulares de Google News y resúmenes RSS de BBC, The Guardian y ANSA, no artículos completos.', 'Los resultados pueden estar incompletos o desactualizados. No se necesita clave API.', 'Privacidad de Google', 'La pregunta se envía a Google News; el modelo funciona en local.']
};
for (const [lang, values] of Object.entries(newsStrings)) Object.assign(window.USB_AI_I18N[lang], {webSearchPrivacy: values[0], webSearchFree: values[1], webSearchTerms: values[2], webSearchNotice: values[3]});

async function searchGoogleNews(query, language, signal) { return researchArticles(query, language, signal, searchNewsOnce); }
