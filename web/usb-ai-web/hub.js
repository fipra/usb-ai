const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const PART = /^[A-Za-z0-9._-]+$/;
const HASH = /^[a-f0-9]{64}$/;
export const WEB_FILE_LIMIT = 2_000_000_000;
const MIN_MODEL_SIZE = 32_000_000;
const SEARCH_PAGE_SIZE = 24;
const AUXILIARY = /(?:mmproj|adapter|lora|vocab|tokenizer|token[-_.]?embd|ple[-_.]fp8|qwen[-_.]nvfp4[-_.]gptq[-_.]dense|embedding|embedder|vision|audio|image[-_.]?encoder|projector|preprocessor|siglip|mtp|dflash|draft|imatrix|importance[-_.]?matrix|calibration|vocoder|speech|tts|asr)/i;
const NON_CHAT_REPO = /(?:^|[-_.])(?:tts|asr|speech|audio|music|vocoder|vision|image|video|ocr|embedding|embedder|rerank|reward|vl|omni)(?:$|[-_.])/i;

export function isAuxiliaryGguf(filename) {
  return String(filename).split(/[/?#]/).some(part => AUXILIARY.test(part));
}

export function isNonChatRepo(repo) {
  return NON_CHAT_REPO.test(String(repo).split('/').at(-1));
}

export function plausibleModelSize(repo, filename, size) {
  const modelName = `${String(repo).split('/').at(-1)}/${filename}`;
  const declared = [...modelName.matchAll(/(?:^|[^a-z0-9])(\d+(?:\.\d+)?)B(?=$|[^a-z0-9])/gi)]
    .map(match => Number(match[1]));
  if (!declared.length) return true;
  // Even very aggressive text-model quantization needs roughly 0.22 bytes per parameter.
  // This deliberately loose floor catches small auxiliary files mislabeled as the full model.
  return size >= Math.max(...declared) * 1_000_000_000 * 0.22;
}

export function estimateMemory(size) {
  const gib = size / 1_073_741_824;
  return { minimum: Math.ceil(gib + 2), recommended: Math.ceil(gib * 1.3 + 4) };
}

export function searchTerm(query) {
  const raw = query.trim();
  if (!/\.gguf$/i.test(raw)) return raw;
  return raw.split('/').at(-1)
    .replace(/\.gguf$/i, '')
    .replace(/[-_.](?:I?Q\d+(?:_[A-Za-z0-9]+)*|BF16|F16)$/i, '')
    .replace(/^Qwen_(?=Qwen)/i, '');
}

export function splitSearchTerm(query) {
  return searchTerm(query).replace(/([A-Za-z])\s+(?=\d+\.\d+)/g, '$1').replace(/\s+/g, '-').replace(/-GGUF$/i, '') + '-split';
}

export function modelFromEntry(repo, entry, license = 'see source', allowShard = false) {
  if (!REPO.test(repo) || isNonChatRepo(repo) || typeof entry?.path !== 'string') return null;
  const parts = entry.path.split('/');
  const name = parts.at(-1);
  if (!parts.every(part => PART.test(part) && part !== '.' && part !== '..') || !/\.gguf$/i.test(name) || isAuxiliaryGguf(entry.path) || (!allowShard && /-of-\d+\.gguf$/i.test(name))) return null;
  const size = entry.size;
  const sha256 = String(entry.lfs?.sha256 || entry.lfs?.oid || '').toLowerCase();
  if (!Number.isSafeInteger(size) || size < (allowShard ? 1024 : MIN_MODEL_SIZE) || !HASH.test(sha256) || (!allowShard && !plausibleModelSize(repo, name, size))) return null;
  const url = `https://huggingface.co/${repo}/resolve/main/${parts.map(encodeURIComponent).join('/')}`;
  return { id: `hf:${sha256}`, name: `${repo} / ${name}`, filename: name, size, sha256, url, tooLargeForWeb: size > WEB_FILE_LIMIT,
    source: `https://huggingface.co/${repo}/blob/main/${parts.map(encodeURIComponent).join('/')}`, license };
}

export function modelsFromEntries(repo, entries, license = 'see source') {
  const models = entries.map(entry => modelFromEntry(repo, entry, license)).filter(Boolean);
  const groups = new Map();
  for (const entry of entries) {
    const match = /^(.+)-(\d{5})-of-(\d{5})\.gguf$/i.exec(entry?.path || '');
    if (!match) continue;
    const number = Number(match[2]), count = Number(match[3]);
    if (count < 2 || count > 1000 || number < 1 || number > count) continue;
    const key = `${match[1]}:${count}`;
    if (!groups.has(key)) groups.set(key, { name: match[1], count, entries: new Map() });
    groups.get(key).entries.set(number, entry);
  }
  for (const group of groups.values()) {
    if (group.entries.size !== group.count) continue;
    const shards = Array.from({length:group.count}, (_,i) => modelFromEntry(repo, group.entries.get(i+1), license, true));
    if (shards.some(shard => !shard || shard.tooLargeForWeb)) continue;
    const parts = shards;
    const total = parts.reduce((sum,part)=>sum+part.size,0);
    if (!plausibleModelSize(repo, group.name, total)) continue;
    models.push({id:`hf-split:${parts[0].sha256}`,name:`${repo} / ${group.name}.gguf`,filename:`${group.name}.gguf`,size:total,sha256:parts[0].sha256,url:parts[0].url,source:parts[0].source,license,tooLargeForWeb:false,shards:parts});
  }
  return models;
}

export function groupLocalGgufs(files) {
  const groups = new Map();
  const models = [];
  for (const file of files) {
    const name = file.filename || file.name;
    const match = /^(.+)-(\d{5})-of-(\d{5})\.gguf$/i.exec(name);
    if (!match) {
      models.push({ name, filename:name, size:file.size, members:[file] });
      continue;
    }
    const number = Number(match[2]), count = Number(match[3]);
    if (count < 2 || count > 1000 || number < 1 || number > count || file.size > WEB_FILE_LIMIT) continue;
    const key = `${match[1].toLowerCase()}:${count}`;
    if (!groups.has(key)) groups.set(key, { name:`${match[1]}.gguf`, count, members:new Map() });
    groups.get(key).members.set(number, file);
  }
  for (const group of groups.values()) {
    if (group.members.size !== group.count) continue;
    const members = Array.from({length:group.count}, (_,index) => group.members.get(index+1));
    if (members.some(member => !member)) continue;
    models.push({ name:group.name, filename:members[0].filename || members[0].name,
      size:members.reduce((sum,member) => sum+member.size,0), members });
  }
  return models;
}

function familyName(repo) {
  const base = repo.tags?.find(tag => tag.startsWith('base_model:') && !tag.startsWith('base_model:quantized:'))?.slice(11);
  return (base || repo.id).split('/').at(-1).replace(/(?:[-_.]?(?:GGUF|split))+$/i, '').replace(/[-_]/g, ' ').trim();
}

function quantizationRank(model) {
  const name = model.name.toUpperCase();
  const preferred = ['Q4_K_M', 'Q4_K_S', 'Q5_K_M', 'Q4_0', 'Q3_K_M', 'Q5_K_S', 'Q6_K', 'Q8_0', 'Q3', 'Q2', 'IQ'];
  const index = preferred.findIndex(quant => name.includes(quant));
  return index < 0 ? preferred.length : index;
}

function bestCompleteModels(candidates) {
  // Prefer ready-to-load releases, but retain large single files for local splitting.
  const rank = (a, b) => Number(a.tooLargeForWeb) - Number(b.tooLargeForWeb) || quantizationRank(a) - quantizationRank(b) || a.size - b.size;
  const chosen = new Map();
  for (const { repo, files } of candidates) {
    const family = familyName(repo);
    const key = family.toLowerCase().replace(/[^a-z0-9]/g, '');
    const usable = [...files];
    usable.sort(rank);
    const candidate = usable[0];
    if (!candidate) continue;
    const previous = chosen.get(key);
    if (!previous || rank(candidate, previous) < 0) {
      chosen.set(key, { ...candidate, name: family });
    }
  }
  return [...chosen.values()].sort((a, b) => a.size - b.size);
}

export async function searchModels(query, skip = 0, fetcher = fetch) {
  const term = searchTerm(query);
  const requestedName = query.trim().split('/').at(-1).toLowerCase();
  const alternateName = requestedName.replace(/^qwen_(?=qwen)/, '');
  const filenameSearch = /\.gguf$/i.test(requestedName);
  if (term.length < 2 || term.length > 80) throw Error('Use 2–80 characters');
  const response = await fetcher(`https://huggingface.co/api/models?filter=gguf&search=${encodeURIComponent(term)}&sort=downloads&direction=-1&limit=${SEARCH_PAGE_SIZE}&skip=${skip}`);
  if (!response.ok) throw Error(`Hugging Face search: HTTP ${response.status}`);
  const primaryRepos = await response.json();
  if (!Array.isArray(primaryRepos)) throw Error('Invalid search results');
  let repos = primaryRepos;
  if (skip === 0) {
    const splitTerm = splitSearchTerm(query);
    if (splitTerm !== term) {
      const splitResponse = await fetcher(`https://huggingface.co/api/models?filter=gguf&search=${encodeURIComponent(splitTerm)}&sort=downloads&direction=-1&limit=8`);
      if (splitResponse.ok) {
        const splitRepos = await splitResponse.json();
        if (Array.isArray(splitRepos)) repos = [...splitRepos, ...primaryRepos.filter(repo => !splitRepos.some(split => split.id === repo.id))];
      }
    }
  }
  const candidates = [];
  for (let start = 0; start < repos.length; start += 6) {
    const batch = await Promise.all(repos.slice(start, start + 6).map(async repo => {
      if (!REPO.test(repo.id || '') || isNonChatRepo(repo.id) || repo.gated) return [];
      try {
        const tree = await fetcher(`https://huggingface.co/api/models/${repo.id}/tree/main?recursive=true`);
        if (!tree.ok) return [];
        const entries = await tree.json();
        if (!Array.isArray(entries)) return [];
        const license = repo.tags?.find(tag => tag.startsWith('license:'))?.slice(8) || 'see source';
        const files = modelsFromEntries(repo.id, entries, license);
        if (filenameSearch) files.sort((a, b) => {
          const score = item => item.name.toLowerCase().endsWith(` / ${requestedName}`) ? 2 : item.name.toLowerCase().endsWith(` / ${alternateName}`) ? 1 : 0;
          return score(b) - score(a);
        });
        return { repo, files };
      } catch { return []; }
    }));
    candidates.push(...batch.filter(item => item && !Array.isArray(item)));
  }
  const models = candidates.flatMap(item => item.files);
  const exact = filenameSearch ? models.filter(item => item.name.toLowerCase().endsWith(` / ${requestedName}`)) : [];
  const alternate = filenameSearch ? models.filter(item => item.name.toLowerCase().endsWith(` / ${alternateName}`)) : [];
  const selected = filenameSearch && (exact.length || alternate.length)
    ? bestCompleteModels(candidates.map(item => ({...item, files:item.files.filter(file => (exact.length ? exact : alternate).includes(file))})))
    : bestCompleteModels(candidates);
  const oversizedCount = candidates.flatMap(item => item.files).filter(item => item.tooLargeForWeb).length;
  return { models: selected, oversizedCount, nextSkip: primaryRepos.length === SEARCH_PAGE_SIZE ? skip + SEARCH_PAGE_SIZE : null };
}
