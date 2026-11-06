// Only the explicitly enabled search tool is executable. Model output is untrusted.
function agentWebQuery(output) {
  if (typeof output !== 'string' || output.length > 30000) return null;
  const call = output.match(/<use_mcp_tool>\s*([\s\S]*?)\s*<\/use_mcp_tool>/i);
  if (!call) return null;
  const field = name => call[1].match(new RegExp(`<${name}>\\s*([\\s\\S]*?)\\s*</${name}>`, 'i'))?.[1];
  if (field('server_name') !== 'web' || field('tool_name') !== 'google_search') return null;
  let args;
  try { args = JSON.parse(field('arguments')); } catch { return null; }
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => k !== 'query')) return null;
  const query = args.query;
  if (typeof query !== 'string' || !query.trim() || query.length > 600 || query.trim().split(/\s+/).length > 75 || /[\x00-\x1f\x7f]/.test(query)) return null;
  return query.trim();
}
if (typeof module !== 'undefined' && module.exports) module.exports = {agentWebQuery};
