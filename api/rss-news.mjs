// Only fixed public feed URLs are fetched. Browser-provided URLs are never used.
const feeds = ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://www.theguardian.com/world/rss', 'https://www.ansa.it/sito/ansait_rss.xml', 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', 'https://www.theguardian.com/us-news/rss'];
export function createHandler(fetcher = fetch) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    const {query, language} = req.body || {};
    if (typeof query !== 'string' || !query.trim() || query.length > 600 || /[\u0000-\u001f\u007f]/.test(query)) return res.status(400).json({error:'INVALID_QUERY'});
    const locales = {it:['it','IT','IT:it'], en:['en-US','US','US:en'], fr:['fr','FR','FR:fr'], de:['de','DE','DE:de'], es:['es','ES','ES:es']};
    const [hl, gl, ceid] = locales[language] || locales.en;
    const url = new URL('https://news.google.com/rss/search');
    for (const [key,value] of Object.entries({q:query.trim(),hl,gl,ceid})) url.searchParams.set(key,value);
    const get = async url => {
      try {
        const response = await fetcher(url, {redirect:'error', signal:AbortSignal.timeout(10000)});
        if (!response.ok || Number(response.headers.get('content-length') || 0) > 1048576) return null;
        const reader = response.body.getReader(); let size = 0; const chunks = [];
        while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > 1048576) { await reader.cancel(); return null; } chunks.push(value); }
        const joined = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { joined.set(chunk,offset); offset += chunk.length; }
        return new TextDecoder().decode(joined);
      } catch { return null; }
    };
    const discovery = (async () => {
      try {
        const response = await fetcher('https://puri.li/api/search', {method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:query.trim()}),signal:AbortSignal.timeout(8000)});
        if (!response.ok || Number(response.headers.get('content-length') || 0) > 1048576) return [];
        const reader = response.body.getReader(); const chunks=[]; let size=0;
        while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>1048576){await reader.cancel();return [];} chunks.push(value); }
        const bytes=new Uint8Array(size); let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
        const data=JSON.parse(new TextDecoder().decode(bytes));
        return Array.isArray(data.results) ? data.results.slice(0,10) : [];
      } catch { return []; }
    })();
    const [google, ...rss] = await Promise.all([url.href, ...feeds].map(get));
    const results = await discovery;
    if (!google && rss.every(x => !x) && !results.length) return res.status(502).json({error:'NEWS_UNAVAILABLE'});
    return res.status(200).json({google, feeds:rss.filter(Boolean), results});
  };
}
export default createHandler();
