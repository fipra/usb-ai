// Exact publisher allowlist, HTTPS only, no redirects or caller headers.
export const publishers = new Set(['www.bbc.com','www.bbc.co.uk','www.theguardian.com','www.ansa.it','tg24.sky.it','www.vaticannews.va','www.ilpost.it','apnews.com','www.reuters.com']);
export function allowedArticle(value) {
  try { const u = new URL(value); return value.length <= 2000 && u.protocol === 'https:' && !u.username && !u.password && !u.port && publishers.has(u.hostname) && !/[\u0000-\u0020\\]/.test(value); } catch { return false; }
}
export function createHandler(fetcher = fetch) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    const url = req.body?.url;
    if (typeof url !== 'string' || !allowedArticle(url)) return res.status(400).json({error:'INVALID_ARTICLE'});
    try {
      const response = await fetcher(url,{redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(8000)});
      if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length') || 0) > 1048576) throw Error();
      const reader = response.body.getReader(); const chunks=[]; let size=0;
      while (true) { const {value,done}=await reader.read(); if(done) break; size+=value.length; if(size>1048576){await reader.cancel();throw Error();} chunks.push(value); }
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
      return res.status(200).json({url,html:new TextDecoder().decode(bytes)});
    } catch { return res.status(502).json({error:'ARTICLE_UNAVAILABLE'}); }
  };
}
export default createHandler();
