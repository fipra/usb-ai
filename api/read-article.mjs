import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function allowedArticle(value) {
  try {
    const u=new URL(value);
    return typeof value==='string' && value.length<=2000 && u.protocol==='https:' && !u.username && !u.password && !u.port
      && !/[\u0000-\u0020\\]/.test(value) && !isIP(u.hostname.replace(/^\[|\]$/g,''))
      && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(u.hostname)
      && !/\.(?:local|localhost|internal|test|invalid|example|home|lan)$/i.test(u.hostname);
  } catch { return false; }
}
export function publicIPv4(ip) {
  if(isIP(ip)!==4)return false;
  const [a,b]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
export async function resolvePublic(url, resolver=lookup) {
  if(!allowedArticle(url))throw Error('INVALID_ARTICLE');
  const records=await resolver(new URL(url).hostname,{all:true,family:4});
  if(!records.length||records.some(r=>!publicIPv4(r.address)))throw Error('INVALID_ARTICLE');
  return records[0].address;
}
// DNS is checked AND pinned to the socket; redirects undergo the same checks.
export async function fetchPublicArticle(value, options={}) {
  const signal=options.signal || AbortSignal.timeout(10000);
  let url=value;
  for(let hop=0;hop<=2;hop++) {
    const address=await resolvePublic(url);signal.throwIfAborted();
    const response=await new Promise((resolve,reject)=>{
      const req=https.get(url,{signal,headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'LlamaNest/4 (local research assistant)'},lookup:(_host,opts,cb)=>opts.all?cb(null,[{address,family:4}]):cb(null,address,4)},res=>{
        if([301,302,303,307,308].includes(res.statusCode)) {res.resume();resolve({redirect:res.headers.location});return;}
        if(res.statusCode!==200||!/text\/html|application\/xhtml\+xml/i.test(res.headers['content-type']||'')||Number(res.headers['content-length']||0)>1048576){res.destroy();reject(Error('ARTICLE_UNAVAILABLE'));return;}
        let size=0;const chunks=[];
        res.on('data',chunk=>{size+=chunk.length;if(size>1048576){res.destroy(Error('ARTICLE_TOO_LARGE'));return;}chunks.push(chunk);});
        res.on('error',reject);res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{headers:{'Content-Type':'text/html'}})));
      });req.on('error',reject);
    });
    if(response instanceof Response)return response;
    if(!response.redirect||hop===2)throw Error('ARTICLE_UNAVAILABLE');
    url=new URL(response.redirect,url).href;
  }
}
export function createHandler(fetcher=fetchPublicArticle) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    const url=req.body?.url;
    if(!allowedArticle(url))return res.status(400).json({error:'INVALID_ARTICLE'});
    try {
      const response=await fetcher(url,{redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
      if(!response.ok||!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type')||'')||Number(response.headers.get('content-length')||0)>1048576)throw Error();
      const reader=response.body.getReader();let size=0;const chunks=[];
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();throw Error();}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      return res.status(200).json({url,html:new TextDecoder().decode(bytes)});
    }catch{return res.status(502).json({error:'ARTICLE_UNAVAILABLE'});}
  };
}
export default createHandler();
