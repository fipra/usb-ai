const { createHmac } = require('node:crypto');
const { isIP } = require('node:net');

module.exports = async function visitorCount(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { KV_REST_API_URL: url, KV_REST_API_TOKEN: token, VISITOR_COUNT_SECRET: secret } = process.env;
  const ip = (req.headers['x-vercel-forwarded-for'] || '').split(',')[0].trim();
  if (!url || !token || !secret || !isIP(ip)) return res.status(503).json({ error: 'Counter unavailable' });
  const digest = createHmac('sha256', secret).update(ip).digest('hex');
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['SADD', 'llamanest:visitor-ips:v1', digest], ['SCARD', 'llamanest:visitor-ips:v1']]),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json();
    if (!response.ok || !Array.isArray(result) || result.some(item => item.error) || !Number.isSafeInteger(result[1]?.result)) throw new Error('Storage unavailable');
    return res.status(200).json({ count: result[1].result });
  } catch {
    return res.status(503).json({ error: 'Counter unavailable' });
  }
};
