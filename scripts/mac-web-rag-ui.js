// Web RAG v4 glue for the Mac app. The pipeline (web-rag.js) is wrapped in WebRag.
// Plan with the local model, search Purili + Wikipedia, read pages through the
// local Rust endpoints, rank chunks, and pass the best sources to the model.
let webRagDocNotice = false;
async function webRagSources(question, history, signal) {
  // Every request has its own time limit, so a search can never hang the chat.
  const post = async (url, body, ms = 12000) => {
    const timeout = AbortSignal.timeout(ms);
    const response = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal, credentials:'same-origin'});
    if (!response.ok) throw Error('HTTP ' + response.status);
    return response.json();
  };
  const deps = {
    // A failed plan falls back to the question itself.
    // The English query runs on its own server thread, in parallel with page reads.
    complete: async ({user}) => { try { return (await post('/web-plan', {prompt:user}, 15000)).text || ''; } catch { return ''; } },
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
  en:{webSkipped:'Answered without web search.', webSearchOffForDocument:'Web search switched off: answers will use the document.', webSearchBlockedByDocument:'This chat contains a document, so web search stays off. Open a new chat to search the web.', webSearchTitle:'Web search v4.1 · experimental', webSearchPrivacy:'The local model turns your question (and, for follow-ups, earlier questions) into search queries sent to Purili and Wikipedia. Pages found are read directly by this Mac, so websites see your IP address. The model answers locally and cites sources as [1], [2]…', webSearchFree:'Experimental v4.1: no account or API key. Answers can contain errors; numbers missing from the sources are flagged. Check the sources.', webSearchNotice:'Search queries go to Purili and Wikipedia; the model runs locally.', webSearchEmpty:'No usable pages found. Try rephrasing the question.', webSearchError:'Web search failed. Check your connection.', webRag_plan:'Preparing searches…', webRag_search:'Searching the web…', webRag_read:'Reading pages…'},
  it:{webSkipped:'Risposto senza ricerca web.', webSearchOffForDocument:'Ricerca web disattivata: le risposte useranno il documento.', webSearchBlockedByDocument:'Questa chat contiene un documento: la ricerca web resta spenta. Apri una nuova chat per cercare sul web.', webSearchTitle:'Ricerca web v4.1 · sperimentale', webSearchPrivacy:'Il modello locale trasforma la domanda (e, per le domande successive, quelle precedenti) in ricerche inviate a Purili e Wikipedia. Le pagine trovate vengono lette direttamente da questo Mac: i siti vedono il tuo indirizzo IP. Il modello risponde in locale e cita le fonti come [1], [2]…', webSearchFree:'Versione sperimentale v4.1: nessun account o chiave API. Le risposte possono contenere errori; i numeri assenti dalle fonti vengono segnalati. Controlla le fonti.', webSearchNotice:'Le ricerche vanno a Purili e Wikipedia; il modello risponde in locale.', webSearchEmpty:'Nessuna pagina utilizzabile trovata. Prova a riformulare la domanda.', webSearchError:'Ricerca web non riuscita. Controlla la connessione.', webRag_plan:'Preparo le ricerche…', webRag_search:'Cerco sul web…', webRag_read:'Leggo le pagine…'},
  fr:{webSkipped:'Réponse sans recherche web.', webSearchOffForDocument:'Recherche web désactivée : les réponses utiliseront le document.', webSearchBlockedByDocument:'Cette discussion contient un document : la recherche web reste désactivée. Ouvrez une nouvelle discussion pour chercher sur le web.', webSearchTitle:'Recherche web v4.1 · expérimentale', webSearchPrivacy:'Le modèle local transforme votre question (et, pour les suites, les questions précédentes) en requêtes envoyées à Purili et Wikipédia. Les pages trouvées sont lues directement par ce Mac : les sites voient votre adresse IP. Le modèle répond en local et cite les sources [1], [2]…', webSearchFree:'Version expérimentale v4.1 : ni compte ni clé API. Les réponses peuvent contenir des erreurs ; les nombres absents des sources sont signalés. Vérifiez les sources.', webSearchNotice:'Les requêtes vont à Purili et Wikipédia ; le modèle reste local.', webSearchEmpty:'Aucune page exploitable trouvée. Reformulez la question.', webSearchError:'La recherche web a échoué. Vérifiez la connexion.', webRag_plan:'Préparation des recherches…', webRag_search:'Recherche sur le web…', webRag_read:'Lecture des pages…'},
  de:{webSkipped:'Ohne Websuche beantwortet.', webSearchOffForDocument:'Websuche ausgeschaltet: Die Antworten nutzen das Dokument.', webSearchBlockedByDocument:'Dieser Chat enthält ein Dokument, daher bleibt die Websuche aus. Öffne einen neuen Chat, um im Web zu suchen.', webSearchTitle:'Websuche v4.1 · experimentell', webSearchPrivacy:'Das lokale Modell macht aus deiner Frage (und bei Folgefragen aus früheren Fragen) Suchanfragen an Purili und Wikipedia. Gefundene Seiten werden direkt von diesem Mac gelesen; Websites sehen deine IP-Adresse. Das Modell antwortet lokal und nennt Quellen als [1], [2]…', webSearchFree:'Experimentelle v4.1: kein Konto, kein API-Schlüssel. Antworten können Fehler enthalten; Zahlen, die nicht in den Quellen stehen, werden markiert. Prüfe die Quellen.', webSearchNotice:'Suchanfragen gehen an Purili und Wikipedia; das Modell läuft lokal.', webSearchEmpty:'Keine verwertbaren Seiten gefunden. Formuliere die Frage um.', webSearchError:'Websuche fehlgeschlagen. Prüfe die Verbindung.', webRag_plan:'Suchanfragen werden vorbereitet…', webRag_search:'Suche im Web…', webRag_read:'Seiten werden gelesen…'},
  es:{webSkipped:'Respondido sin búsqueda web.', webSearchOffForDocument:'Búsqueda web desactivada: las respuestas usarán el documento.', webSearchBlockedByDocument:'Este chat contiene un documento: la búsqueda web sigue desactivada. Abre un chat nuevo para buscar en la web.', webSearchTitle:'Búsqueda web v4.1 · experimental', webSearchPrivacy:'El modelo local convierte tu pregunta (y, en las siguientes, las anteriores) en búsquedas enviadas a Purili y Wikipedia. Las páginas encontradas se leen directamente desde este Mac: los sitios ven tu dirección IP. El modelo responde en local y cita las fuentes como [1], [2]…', webSearchFree:'Versión experimental v4.1: sin cuenta ni clave API. Las respuestas pueden contener errores; se señalan los números ausentes en las fuentes. Comprueba las fuentes.', webSearchNotice:'Las búsquedas van a Purili y Wikipedia; el modelo funciona en local.', webSearchEmpty:'No se encontraron páginas útiles. Reformula la pregunta.', webSearchError:'Falló la búsqueda web. Comprueba la conexión.', webRag_plan:'Preparando búsquedas…', webRag_search:'Buscando en la web…', webRag_read:'Leyendo páginas…'}
};
for (const [lang, values] of Object.entries(webRagStrings)) Object.assign(window.USB_AI_I18N[lang], values);

// A chat with documents answers from them: the web button stays off there.
{
  const toggle = $('web-search-toggle');
  const original = toggle.onclick;
  toggle.onclick = () => {
    if (!webSearchEnabled && state && state.documents.some(doc => doc.chatId === active)) { showWait(tr('webSearchBlockedByDocument')); return; }
    original();
  };
}
