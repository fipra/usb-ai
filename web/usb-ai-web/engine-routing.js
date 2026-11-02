// Only route formats identified from the model record; unknown formats keep
// the user's current engine. Filenames, original URLs and split parts are kept
// by the different import and download paths.
export function engineForModel(model) {
  if (!model || model.source === 'remote' || String(model.id || '').startsWith('remote:')) return null;
  const values = [model.filename, model.url, model.sourceUrl, model.name,
    ...(model.files || []).map(file => file.name),
    ...(model.shards || []).flatMap(part => [part.filename, part.name, part.url])]
    .filter(value => typeof value === 'string');
  const identity = values.join(' ').toUpperCase();
  const hasQuant = quant => new RegExp(`(?:^|[^A-Z0-9])${quant}(?=$|[^A-Z0-9])`).test(identity);
  if (hasQuant('PTQ1_0')) return 'unsupported-ptq1';
  if (hasQuant('PQ2_0')) return 'prism';
  // Q1_0 is supported by the standard runtime; other Bonsai packings use Prism.
  if (/BONSAI/.test(identity)) return hasQuant('Q1_0') ? 'standard' : 'prism';
  // A known regular GGUF selects the standard engine. For ambiguous names,
  // leave the manual choice untouched rather than guessing.
  if (/(?:^|[^A-Z0-9])(?:Q[1-8](?:_[A-Z0-9]+)*|IQ[1-4](?:_[A-Z0-9]+)*|BF16|F16|F32)(?=$|[^A-Z0-9])/.test(identity)) return 'standard';
  return null;
}
