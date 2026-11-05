// Only the visitor's key is forwarded; the deployment has no shared search key.
export function createHandler(fetcher = fetch) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    const {query, key, language} = req.body || {};
    if (typeof query !== 'string' || !query.trim() || query.length > 600 || query.trim().split(/\s+/).length > 75 || typeof key !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(key)) return res.status(400).json({error:'INVALID_REQUEST'});
    try {
      const upstream = await fetcher('https://api.tavily.com/search', {method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`}, body:JSON.stringify({query:query.trim(),search_depth:'basic',auto_parameters:false,max_results:5,language:['en','it','fr','de','es'].includes(language) ? language : 'en'}), signal:AbortSignal.timeout(15000)});
      if (!upstream.ok) {
        if ([429, 432, 433, 434].includes(upstream.status)) return res.status(429).json({error:'SEARCH_LIMIT'});
        return res.status(upstream.status === 401 || upstream.status === 403 ? 401 : 502).json({error:'SEARCH_UNAVAILABLE'});
      }
      const data = await upstream.json();
      const results = Array.isArray(data.results) ? data.results.slice(0, 5).map(({title,url,content}) => ({title,url,description:content})) : [];
      return res.status(200).json({results});
    } catch { return res.status(502).json({error:'SEARCH_UNAVAILABLE'}); }
  };
}
export default createHandler();
