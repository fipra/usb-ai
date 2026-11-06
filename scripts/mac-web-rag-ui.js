// Web RAG v4 glue for the Mac app. The pipeline (web-rag.js) is wrapped in WebRag.
// Plan with the local model, search Purili + Wikipedia, read pages through the
// local Rust endpoints, rank chunks, and pass the best sources to the model.
async function webRagSources(question, history, signal) {
  const post = async (url, body) => {
    const response = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal, credentials:'same-origin'});
    if (!response.ok) throw Error('HTTP ' + response.status);
    return response.json();
  };
  const deps = {
    // A failed plan falls back to the question itself.
    complete: async ({user}) => { try { return (await call('web-plan', {prompt:user})).text || ''; } catch { return ''; } },
    search: async query => {
      const data = await post('/article-discovery', {query});
      return (Array.isArray(data.results) ? data.results : []).filter(x => x && typeof x.url === 'string' && x.url.startsWith('https://')).slice(0, 8)
        .map(x => ({title:String(x.title || '').slice(0, 300), url:x.url, description:String(x.description || '').slice(0, 1500)}));
    },
    wikipedia: async (query, lang) => WebRag.parseWikipediaSearch(await post('/wiki-search', {query, lang}), lang),
    read: async url => { const data = await post('/read-article', {url}); return typeof data.html === 'string' ? data.html : null; }
  };
  const {sources} = await WebRag.gatherSources(question, {history, language:state.language, deps, onStep:step => showWait(tr('webRag_' + step))});
  return sources.map(s => ({title:(s.title + (s.date ? ' · ' + s.date.slice(0, 10) : '')).slice(0, 590), url:s.url, description:s.text.slice(0, 7000)}));
}

const webRagStrings = {
  en:{webSearchTitle:'Web search v4 · experimental', webSearchPrivacy:'The local model turns your question (and, for follow-ups, earlier questions) into search queries sent to Purili and Wikipedia. Pages found are read directly by this Mac, so websites see your IP address. The model answers locally and cites sources as [1], [2]…', webSearchFree:'Experimental v4: no account or API key. Answers can contain errors; numbers missing from the sources are flagged. Check the sources.', webSearchNotice:'Search queries go to Purili and Wikipedia; the model runs locally.', webSearchEmpty:'No usable pages found. Try rephrasing the question.', webSearchError:'Web search failed. Check your connection.', webRag_plan:'Preparing searches…', webRag_search:'Searching the web…', webRag_read:'Reading pages…'},
  it:{webSearchTitle:'Ricerca web v4 · sperimentale', webSearchPrivacy:'Il modello locale trasforma la domanda (e, per le domande successive, quelle precedenti) in ricerche inviate a Purili e Wikipedia. Le pagine trovate vengono lette direttamente da questo Mac: i siti vedono il tuo indirizzo IP. Il modello risponde in locale e cita le fonti come [1], [2]…', webSearchFree:'Versione sperimentale v4: nessun account o chiave API. Le risposte possono contenere errori; i numeri assenti dalle fonti vengono segnalati. Controlla le fonti.', webSearchNotice:'Le ricerche vanno a Purili e Wikipedia; il modello risponde in locale.', webSearchEmpty:'Nessuna pagina utilizzabile trovata. Prova a riformulare la domanda.', webSearchError:'Ricerca web non riuscita. Controlla la connessione.', webRag_plan:'Preparo le ricerche…', webRag_search:'Cerco sul web…', webRag_read:'Leggo le pagine…'},
  fr:{webSearchTitle:'Recherche web v4 · expérimentale', webSearchPrivacy:'Le modèle local transforme votre question (et, pour les suites, les questions précédentes) en requêtes envoyées à Purili et Wikipédia. Les pages trouvées sont lues directement par ce Mac : les sites voient votre adresse IP. Le modèle répond en local et cite les sources [1], [2]…', webSearchFree:'Version expérimentale v4 : ni compte ni clé API. Les réponses peuvent contenir des erreurs ; les nombres absents des sources sont signalés. Vérifiez les sources.', webSearchNotice:'Les requêtes vont à Purili et Wikipédia ; le modèle reste local.', webSearchEmpty:'Aucune page exploitable trouvée. Reformulez la question.', webSearchError:'La recherche web a échoué. Vérifiez la connexion.', webRag_plan:'Préparation des recherches…', webRag_search:'Recherche sur le web…', webRag_read:'Lecture des pages…'},
  de:{webSearchTitle:'Websuche v4 · experimentell', webSearchPrivacy:'Das lokale Modell macht aus deiner Frage (und bei Folgefragen aus früheren Fragen) Suchanfragen an Purili und Wikipedia. Gefundene Seiten werden direkt von diesem Mac gelesen; Websites sehen deine IP-Adresse. Das Modell antwortet lokal und nennt Quellen als [1], [2]…', webSearchFree:'Experimentelle v4: kein Konto, kein API-Schlüssel. Antworten können Fehler enthalten; Zahlen, die nicht in den Quellen stehen, werden markiert. Prüfe die Quellen.', webSearchNotice:'Suchanfragen gehen an Purili und Wikipedia; das Modell läuft lokal.', webSearchEmpty:'Keine verwertbaren Seiten gefunden. Formuliere die Frage um.', webSearchError:'Websuche fehlgeschlagen. Prüfe die Verbindung.', webRag_plan:'Suchanfragen werden vorbereitet…', webRag_search:'Suche im Web…', webRag_read:'Seiten werden gelesen…'},
  es:{webSearchTitle:'Búsqueda web v4 · experimental', webSearchPrivacy:'El modelo local convierte tu pregunta (y, en las siguientes, las anteriores) en búsquedas enviadas a Purili y Wikipedia. Las páginas encontradas se leen directamente desde este Mac: los sitios ven tu dirección IP. El modelo responde en local y cita las fuentes como [1], [2]…', webSearchFree:'Versión experimental v4: sin cuenta ni clave API. Las respuestas pueden contener errores; se señalan los números ausentes en las fuentes. Comprueba las fuentes.', webSearchNotice:'Las búsquedas van a Purili y Wikipedia; el modelo funciona en local.', webSearchEmpty:'No se encontraron páginas útiles. Reformula la pregunta.', webSearchError:'Falló la búsqueda web. Comprueba la conexión.', webRag_plan:'Preparando búsquedas…', webRag_search:'Buscando en la web…', webRag_read:'Leyendo páginas…'}
};
for (const [lang, values] of Object.entries(webRagStrings)) Object.assign(window.USB_AI_I18N[lang], values);
