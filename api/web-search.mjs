// Only the visitor's key is forwarded; the deployment has no shared search key.
export function createHandler(fetcher = fetch) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    const {query, key, language} = req.body || {};
    if (typeof query !== 'string' || !query.trim() || query.length > 600 || query.trim().split(/\s+/).length > 75 || typeof key !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(key)) return res.status(400).json({error:'INVALID_REQUEST'});
    const params = new URLSearchParams({q:query.trim(), count:'5', search_lang:['en','it','fr','de','es'].includes(language) ? language : 'en'});
    try {
      const upstream = await fetcher('https://api.search.brave.com/res/v1/web/search?' + params, {headers:{'Accept':'application/json','X-Subscription-Token':key}, signal:AbortSignal.timeout(12000)});
      if (!upstream.ok) return res.status(upstream.status === 401 || upstream.status === 403 ? 401 : 502).json({error:'SEARCH_UNAVAILABLE'});
      const data = await upstream.json();
      const results = Array.isArray(data.web?.results) ? data.web.results.slice(0, 5).map(({title,url,description}) => ({title,url,description})) : [];
      return res.status(200).json({results});
    } catch { return res.status(502).json({error:'SEARCH_UNAVAILABLE'}); }
  };
}
export default createHandler();
