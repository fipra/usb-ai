#!/usr/bin/env python3
"""Build the experimental Prism Web app with selectable PrismML and standard engines."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import sys
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parent))
import web_rag_patch  # noqa: E402

root = Path(__file__).resolve().parents[1]
web = root / 'web'
base_path = os.environ.get('LLAMA_PRISM_DUAL_BASE', '/prism-dual/')
if base_path not in ('/prism-dual/', '/prism-gpu/', '/prism-fast/', '/prism-dflash/', '/nuovo-web/', '/intel-prova/', '/dory-web/', '/web-veloce/', '/nuovo-ricerca/'):
    raise RuntimeError('Unsupported dual-engine base path')
experimental_web = base_path in ('/nuovo-web/', '/intel-prova/', '/dory-web/', '/web-veloce/', '/nuovo-ricerca/')
# /nuovo-ricerca/ = /nuovo-web/ plus the web search v4 experiment, with separate data.
web_rag = base_path == '/nuovo-ricerca/'
dest = root / '.vercel-static' / base_path.strip('/')

def replace_file(path, old, new):
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f'Expected text not found in {path.name}')
    path.write_text(text.replace(old, new, 1))

with tempfile.TemporaryDirectory(prefix='llamanest-prism-gpu-') as tmp:
    work = Path(tmp) / 'web'
    shutil.copytree(web, work, ignore=shutil.ignore_patterns('node_modules', 'dist'))
    (work / 'node_modules').symlink_to(web / 'node_modules', target_is_directory=True)
    app = work / 'usb-ai-web'
    if web_rag:
        web_rag_patch.apply(app, root, replace_file)
    runtime_archive = 'dory-webgpu-runtime.zip' if base_path == '/dory-web/' else 'prism-webgpu-intel-runtime.zip' if base_path in ('/intel-prova/', '/web-veloce/') else 'prism-dflash-runtime.zip' if base_path == '/prism-dflash/' else 'prism-webgpu-fast-runtime.zip' if base_path in ('/prism-fast/', '/nuovo-web/', '/nuovo-ricerca/') else 'prism-webgpu-runtime.zip'
    with zipfile.ZipFile(root / 'scripts' / runtime_archive) as archive:
        for name in ('prism-webgpu.js', 'prism-wllama.js', 'prism-webgpu.wasm'):
            (app / name).write_bytes(archive.read(name))
    if base_path == '/prism-dflash/':
        binding = app / 'prism-wllama.js'
        replace_file(binding, 'const modelFiles = yield prepareBlobs(blobs);\n      yield this.proxy.moduleInit(modelFiles.all);', 'const modelFiles = yield prepareBlobs(blobs);\n      if (params.dflash_blob) modelFiles.all.push({blob: params.dflash_blob, name: "dflash.gguf"});\n      yield this.proxy.moduleInit(modelFiles.all);')
        replace_file(binding, 'spec_draft_model: params.spec_draft_model,', 'spec_draft_model: params.dflash_blob ? "/models/dflash.gguf" : void 0,')
    if base_path == '/dory-web/':
        routing = app / 'engine-routing.js'
        replace_file(routing, "  if (hasQuant('PTQ1_0'))", "  if (/DORY1[._-]?0/.test(identity)) return 'prism';\n  if (hasQuant('PTQ1_0'))")
    if experimental_web:
        catalog = app / 'catalog.js'
        text = catalog.read_text()
        start = text.index('export const CATALOG = [')
        end = text.index('];', start) + 2
        catalog.write_text(text[:start] + """export const CATALOG = [{
  id:'qwen2.5-0.5b-q4', name:'Qwen 2.5 · 0.5B Instruct Q4', size:491400032,
  url:'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/6dd44a1fb35d11b5d1b28902876ce3cc9e882d0e/qwen2.5-0.5b-instruct-q4_k_m.gguf',
  source:'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF',
  sha256:'74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db', license:'Apache-2.0'
}];""" + text[end:])
    runtime = app / 'runtime.js'
    replace_file(runtime, 'wasm/wllama.wasm', 'wasm/standard-wllama.wasm')
    replace_file(runtime, "let engine;", "let engineMode = 'prism';\nexport function setEngineMode(value) { if (!['prism','standard'].includes(value)) throw Error('Invalid engine'); engineMode = value; }\nlet engine;")
    replace_file(runtime, "import('@wllama/wllama').then(({ ModelManager })", "import('./prism-wllama.js').then(({ ModelManager })")
    replace_file(runtime, "    import('@wllama/wllama'),\n    import('@wllama/wllama-compat/wasm/wllama.js?raw')", "    ...(engineMode === 'prism' ? [import('./prism-wllama.js'), import('./prism-webgpu.js?raw')] : [import('@wllama/wllama'), import('@wllama/wllama-compat/wasm/wllama.js?raw')])")
    replace_file(runtime, "  const runtime = new Wllama(paths, { logger, allowOffline: true });\n  runtime.setCompat({ wasm: `${import.meta.env.BASE_URL}wasm/wllama-compat.wasm`, worker: { code: compatWorker } });", "  const runtime = engineMode === 'prism' ? new Wllama({default:`${import.meta.env.BASE_URL}wasm/prism-webgpu.wasm`}, { logger, allowOffline:true, prismWorkerCode:compatWorker }) : new Wllama(paths, { logger, allowOffline:true });\n  runtime.setCompat(engineMode === 'prism' ? null : { wasm: `${import.meta.env.BASE_URL}wasm/wllama-compat.wasm`, worker: { code: compatWorker } });")
    replace_file(runtime, '  const options = modelOptions({iosDiagnostic:diagnostic, contextSize, threads, backend});', "  if (engineMode === 'prism' && (!navigator.gpu || typeof WebAssembly.Suspending !== 'function')) throw Error('WebGPU and Chrome JSPI are required for PrismML');\n  const options = modelOptions({iosDiagnostic:diagnostic, contextSize, threads, backend});\n  if (engineMode === 'prism') { options.n_gpu_layers = 99999; options.n_batch = 64; options.n_ubatch = 64; options.warmup = false; }")
    if base_path == '/prism-dflash/':
        replace_file(runtime, 'let engine;', 'let draftFile;\nexport async function setDraftFile(file) { await unload(); draftFile = file; }\nlet engine;')
        replace_file(runtime, '  if (loadedId === id && engine', '  if (engineMode === \'prism\' && draftFile) { options.dflash_blob = draftFile; options.spec_draft_ngl = 99999; }\n  if (loadedId === id && engine')
    replace_file(runtime, '      return next.loadModel(cached, options);', '      return next.loadModel(await cached.open(), options);')
    replace_file(runtime, '    const metadata = next.getModelMetadata();', "    if (engineMode === 'prism' && detector.value().kind !== 'gpu') throw Error('The model could not be loaded on WebGPU');\n    const metadata = next.getModelMetadata();")
    if experimental_web:
        replace_file(runtime, "let engineMode = 'prism';", "let engineMode = 'standard';")
    main = app / 'main.js'
    if base_path == '/web-veloce/':
        replace_file(main, "'/nuovo-web/'].includes(import.meta.env.BASE_URL)", "'/nuovo-web/', '/web-veloce/'].includes(import.meta.env.BASE_URL)")
    if web_rag:
        replace_file(main, "'/nuovo-web/'].includes(import.meta.env.BASE_URL)", "'/nuovo-web/', '/nuovo-ricerca/'].includes(import.meta.env.BASE_URL)")
    replace_file(main, 'loadModel, unload, loadedModelId', 'loadModel, unload, setEngineMode, ' + ('setDraftFile, ' if base_path == '/prism-dflash/' else '') + 'loadedModelId')
    replace_file(main, 'let contextSize = 0, outputLimit = 0, cpuThreads', "let webEngine = 'prism';\nlet contextSize = 0, outputLimit = 0, cpuThreads")
    replace_file(main, 'remoteConfig, contextSize, outputLimit, temperature, cpuThreads,', 'remoteConfig, contextSize, outputLimit, temperature, webEngine, cpuThreads,')
    replace_file(main, "const settings = await db.get('settings','main');", "const settings = await db.get('settings','main'); webEngine = settings?.webEngine === 'standard' ? 'standard' : 'prism'; setEngineMode(webEngine); $('web-engine').value = webEngine;")
    replace_file(main, "$('generation-temperature').onchange =", "$('web-engine').onchange = () => run(async () => { if (busy) { $('web-engine').value=webEngine; return; } const value=$('web-engine').value; setBusy(true); try { await unload(); setEngineMode(value); webEngine=value; await saveSettings(); setStatus(tr('engineChanged')); render(); } finally { setBusy(false); } });\n$('generation-temperature').onchange =")
    if base_path == '/prism-dflash/':
        replace_file(main, "const files = [...event.target.files]; event.target.value = ''; const result = await addLocalModel(files);", "const files = [...event.target.files]; event.target.value = ''; if (files.length === 1 && /^Ternary-Bonsai-2-9B-DFlash2-Q8_0\\.gguf$/i.test(files[0].name)) { if (new TextDecoder().decode(await files[0].slice(0,4).arrayBuffer()) !== 'GGUF') throw Error('Invalid DFlash2 GGUF'); await setDraftFile(files[0]); setStatus(tr('dflashReady')); $('model-progress').textContent = tr('dflashReady'); return; } const result = await addLocalModel(files);")
        replace_file(main, 'setupRemoteUi();\ninit();', "$('dflash-file').onchange = () => run(async () => { const file = $('dflash-file').files[0]; if (file && (!/Ternary-Bonsai-2-9B-DFlash2-Q8_0\\.gguf$/i.test(file.name) || new TextDecoder().decode(await file.slice(0, 4).arrayBuffer()) !== 'GGUF')) throw Error('Invalid DFlash2 GGUF'); await setDraftFile(file); setStatus('DFlash2: ' + (file?.name || 'off')); });\nsetupRemoteUi();\ninit();")
    if experimental_web:
        replace_file(main, "import './style.css';", "import './style.css';\nimport './experimental-loading.css';\nimport { firstWelcome } from './experimental-welcome.js';")
        replace_file(main, "import './style.css';", "import './style.css';\nimport { engineForModel } from './engine-routing.js';")
        replace_file(main, "let webEngine = 'prism';", "let webEngine = 'standard';")
        replace_file(main, "settings?.webEngine === 'standard' ? 'standard' : 'prism'", "settings?.webEngine === 'prism' ? 'prism' : 'standard'")
        replace_file(main, "Llama-3.2-1B-Instruct-Q4_K_M.gguf", "qwen2.5-0.5b-instruct-q4_k_m.gguf")
        replace_file(main, "  let loaded = false;\n  try {\n    await loadModel(id, contextSize, cpuThreads, isWindows() ? windowsBackend : 'auto');", """  let loaded = false;
  const previousEngine = webEngine;
  try {
    const route = engineForModel(models.find(model => model.id === id));
    if (route === 'unsupported-ptq1') throw Error(tr('enginePtqUnsupported'));
    if (route === 'prism' && (!navigator.gpu || typeof WebAssembly.Suspending !== 'function')) throw Error(tr('enginePrismUnavailable'));
    if (route && route !== webEngine) {
      await unload(); setEngineMode(route); webEngine = route; $('web-engine').value = route;
    }
    await loadModel(id, contextSize, cpuThreads, isWindows() ? windowsBackend : 'auto');""")
        replace_file(main, "    if ($('models-dialog').open) $('models-dialog').close();\n  } finally {\n    clearInterval(elapsed);", """    if ($('models-dialog').open) $('models-dialog').close();
  } catch (error) {
    if (webEngine !== previousEngine) { setEngineMode(previousEngine); webEngine = previousEngine; $('web-engine').value = previousEngine; }
    throw error;
  } finally {
    clearInterval(elapsed);""")

        replace_file(main, "else if (isStarterModel(models.find(model => model.id === selectedId))) await run(() => chooseModel(selectedId));", "else if (isStarterModel(models.find(model => model.id === selectedId))) await run(() => restoreExperimentalModel(selectedId));")

        replace_file(main, 'remoteConfig, contextSize, outputLimit, temperature, webEngine, cpuThreads,', 'remoteConfig, contextSize, outputLimit, temperature, webEngine, firstWelcomeSeen, cpuThreads,')
        replace_file(main, "const settings = await db.get('settings','main');", "const settings = await db.get('settings','main'); firstWelcomeSeen = settings?.firstWelcomeSeen === true;")
        replace_file(main, "content.append(node('strong', message.role === 'user' ? tr('you') : tr('assistant')), body);", "content.append(node('strong', message.role === 'user' ? tr('you') : message.presetWelcome ? tr('welcomePresetLabel') : tr('assistant')), body);")
        replace_file(main, "  if (!text || busy) return;\n  const command", """  if (!text || busy) return;
  if (!editing && !firstWelcomeSeen) {
    firstWelcomeSeen = true;
    let firstChat = chats.find(item => item.id === activeId);
    if (!firstChat) { await newChat(); firstChat = chats.find(item => item.id === activeId); }
    firstChat.messages.push({role:'user', text}, {role:'assistant', text:firstWelcome(language), presetWelcome:true});
    if (!firstChat.titleCustom) firstChat.title = text.slice(0,55);
    firstChat.updated = Date.now();
    $('prompt').value = '';
    await db.put('chats', firstChat); await saveSettings(); render();
    return;
  }
  if (!editing && !selectedId && starterPromise) await starterPromise;
  const command""")
    replace_file(main, 'function renderModels() {\n', 'function renderModels() {\n  renderBonsaiRecommendation();\n')
    recommendation = (root / 'scripts' / 'prism-recommendation.js').read_text()
    replace_file(main, 'setupRemoteUi();\ninit();', recommendation + "\nsetupRemoteUi();\ninit().then(() => { if (new URLSearchParams(location.search).get('recommended') === 'bonsai') { renderModels(); if (!$('models-dialog').open) $('models-dialog').showModal(); } });")
    if experimental_web:
        start = (root / 'scripts' / 'experimental-web-start.js').read_text()
        replace_file(main, 'setupRemoteUi();\ninit().then(', start + "\nsetupRemoteUi();\ninit().then(")
        replace_file(main, "init().then(() => { if (new URLSearchParams", "init().then(() => { if (!selectedId) starterPromise = startExperimentalModel(); if (new URLSearchParams")
    translations = app / 'i18n.js'
    with translations.open('a') as out:
        out.write("\nconst webEngineStrings={en:{webEngine:'Model engine',enginePrism:'PrismML (WebGPU)',engineStandard:'Standard llama.cpp',engineChanged:'Engine changed. The model will reload on the next message.',engineHelp:'Choose the engine for compatible models. PrismML requires WebGPU and Chrome JSPI; changing engines reloads the model.'},it:{webEngine:'Motore del modello',enginePrism:'PrismML (WebGPU)',engineStandard:'llama.cpp standard',engineChanged:'Motore cambiato. Il modello si ricarica al prossimo messaggio.',engineHelp:'Scegli il motore per i modelli compatibili. PrismML richiede WebGPU e Chrome JSPI; il cambio ricarica il modello.'},fr:{webEngine:'Moteur du modèle',enginePrism:'PrismML (WebGPU)',engineStandard:'llama.cpp standard',engineChanged:'Moteur modifié. Le modèle sera rechargé au prochain message.',engineHelp:'Choisissez le moteur. PrismML nécessite WebGPU et Chrome JSPI ; le modèle sera rechargé.'},de:{webEngine:'Modell-Engine',enginePrism:'PrismML (WebGPU)',engineStandard:'llama.cpp Standard',engineChanged:'Engine geändert. Das Modell wird bei der nächsten Nachricht neu geladen.',engineHelp:'Wähle die Engine. PrismML benötigt WebGPU und Chrome JSPI; das Modell wird neu geladen.'},es:{webEngine:'Motor del modelo',enginePrism:'PrismML (WebGPU)',engineStandard:'llama.cpp estándar',engineChanged:'Motor cambiado. El modelo se cargará de nuevo en el siguiente mensaje.',engineHelp:'Elige el motor. PrismML requiere WebGPU y Chrome JSPI; el modelo se recargará.'}};\nfor(const lang of Object.keys(webEngineStrings)) Object.assign(translations[lang],webEngineStrings[lang]);\n")
    if experimental_web:
        with translations.open('a') as out:
            out.write('\n' + (root / 'scripts' / 'experimental-loading-strings.js').read_text())
            out.write('\n' + (root / 'scripts' / 'experimental-engine-strings.js').read_text())
    if base_path == '/prism-dflash/':
        with translations.open('a') as out:
            out.write("\nconst dflashStrings={en:{dflashReady:'DFlash2 selected. Now load Bonsai 2 9B PQ2_0.',dflashSelect:'DFlash2 file (experimental)',dflashHelp:'Select the DFlash2 GGUF and use PrismML with Bonsai 2 9B PQ2_0. This uses additional memory; results are unverified.'},it:{dflashReady:'DFlash2 selezionato. Ora carica Bonsai 2 9B PQ2_0.',dflashSelect:'File DFlash2 (sperimentale)',dflashHelp:'Seleziona il GGUF DFlash2 e usa PrismML con Bonsai 2 9B PQ2_0. Richiede memoria aggiuntiva; risultati non verificati.'},fr:{dflashReady:'DFlash2 sélectionné. Chargez maintenant Bonsai 2 9B PQ2_0.',dflashSelect:'Fichier DFlash2 (expérimental)',dflashHelp:'Sélectionnez le GGUF DFlash2 et utilisez PrismML avec Bonsai 2 9B PQ2_0. Mémoire supplémentaire nécessaire ; résultats non vérifiés.'},de:{dflashReady:'DFlash2 ausgewählt. Lade jetzt Bonsai 2 9B PQ2_0.',dflashSelect:'DFlash2-Datei (experimentell)',dflashHelp:'Wähle die DFlash2-GGUF und nutze PrismML mit Bonsai 2 9B PQ2_0. Zusätzlicher Speicher nötig; Ergebnisse ungeprüft.'},es:{dflashReady:'DFlash2 seleccionado. Ahora carga Bonsai 2 9B PQ2_0.',dflashSelect:'Archivo DFlash2 (experimental)',dflashHelp:'Selecciona el GGUF DFlash2 y usa PrismML con Bonsai 2 9B PQ2_0. Requiere memoria adicional; resultados sin verificar.'}}; for(const lang of Object.keys(dflashStrings)) Object.assign(translations[lang],dflashStrings[lang]);\n")
    if experimental_web:
        with translations.open('a') as out:
            out.write("\nconst expStrings={en:{welcomePresetLabel:'Welcome message',starterHint:'Qwen 2.5 0.5B is loading locally. Write your first message to see the introduction.',safariStarterHint:'Qwen 2.5 0.5B is loading locally. Write your first message to see the introduction.'},it:{welcomePresetLabel:'Messaggio di benvenuto',starterHint:'Qwen 2.5 0,5B si prepara in locale. Scrivi il primo messaggio per leggere il benvenuto.',safariStarterHint:'Qwen 2.5 0,5B si prepara in locale. Scrivi il primo messaggio per leggere il benvenuto.'},fr:{welcomePresetLabel:'Message de bienvenue',starterHint:'Qwen 2.5 0,5B se prépare localement. Écrivez votre premier message pour voir l’accueil.',safariStarterHint:'Qwen 2.5 0,5B se prépare localement. Écrivez votre premier message pour voir l’accueil.'},de:{welcomePresetLabel:'Willkommensnachricht',starterHint:'Qwen 2.5 0,5B wird lokal vorbereitet. Schreibe deine erste Nachricht für die Begrüßung.',safariStarterHint:'Qwen 2.5 0,5B wird lokal vorbereitet. Schreibe deine erste Nachricht für die Begrüßung.'},es:{welcomePresetLabel:'Mensaje de bienvenida',starterHint:'Qwen 2.5 0,5B se prepara localmente. Escribe tu primer mensaje para ver la bienvenida.',safariStarterHint:'Qwen 2.5 0,5B se prepara localmente. Escribe tu primer mensaje para ver la bienvenida.'}}; for(const lang of Object.keys(expStrings)) Object.assign(translations[lang],expStrings[lang]);\n")
    replace_file(app / 'hub.js', 'export const WEB_FILE_LIMIT = 2_000_000_000;', 'export const WEB_FILE_LIMIT = 3_000_000_000;')
    database = 'usb-ai-web-nuovo-ricerca-v1' if web_rag else 'usb-ai-web-veloce-v1' if base_path == '/web-veloce/' else 'usb-ai-web-dory-experiment-v1' if base_path == '/dory-web/' else 'usb-ai-web-intel-test-v1' if base_path == '/intel-prova/' else 'usb-ai-web-nuovo-v2' if base_path == '/nuovo-web/' else 'usb-ai-web-prism-dflash-v1' if base_path == '/prism-dflash/' else 'usb-ai-web-prism-fast-v1' if base_path == '/prism-fast/' else 'usb-ai-web-prism-gpu-experimental-v1'
    replace_file(app / 'storage.js', "const DB = 'usb-ai-web-v1'", f"const DB = '{database}'")
    replace_file(app / 'main.js', 'llamanest-remote-panel-open', 'llamanest-prism-gpu-remote-panel-open')
    replace_file(app / 'folder-models.js', 'usb-ai-models', 'usb-ai-prism-gpu-models')
    replace_file(app / 'public' / 'sw.js', 'usb-ai-web-shell-', 'usb-ai-nuovo-ricerca-shell-' if web_rag else 'usb-ai-veloce-shell-' if base_path == '/web-veloce/' else 'usb-ai-dory-test-shell-' if base_path == '/dory-web/' else 'usb-ai-intel-test-shell-' if base_path == '/intel-prova/' else 'usb-ai-nuovo-v2-shell-' if base_path == '/nuovo-web/' else 'usb-ai-prism-dflash-shell-' if base_path == '/prism-dflash/' else 'usb-ai-prism-fast-shell-' if base_path == '/prism-fast/' else 'usb-ai-prism-gpu-shell-')
    config = app / 'vite.config.js'
    replace_file(config, "copyFileSync(resolve(base, 'wllama.wasm'), resolve(dest, 'wllama.wasm'));", "copyFileSync(resolve(base, 'wllama.wasm'), resolve(dest, 'standard-wllama.wasm'));\n    copyFileSync(resolve(import.meta.dirname, 'prism-webgpu.wasm'), resolve(dest, 'prism-webgpu.wasm'));")
    if experimental_web:
        # A new URL prevents existing service-worker caches from serving the old runtime.
        replace_file(runtime, 'wasm/prism-webgpu.wasm', 'wasm/prism-fast-webgpu.wasm')
        replace_file(config, "resolve(dest, 'prism-webgpu.wasm')", "resolve(dest, 'prism-fast-webgpu.wasm')")
    html = app / 'index.html'
    replace_file(html, '<div id="model-progress"', '<section id="bonsai-recommendation" style="background:#ecf8f0;border:1px solid #9bceb0;border-radius:14px;padding:18px;margin-bottom:18px"><strong id="bonsai-title"></strong><p id="bonsai-description" class="hint"></p><button id="bonsai-start" type="button" class="action" style="background:#137a49;color:white;border:0"></button></section><div id="model-progress"')
    replace_file(html, '<h3 data-i18n="generationSettings"></h3>', '<h3 data-i18n="generationSettings"></h3><label><span data-i18n="webEngine"></span> <select id="web-engine"><option value="prism" data-i18n="enginePrism"></option><option value="standard" data-i18n="engineStandard"></option></select></label><p class="hint" data-i18n="engineHelp"></p>')
    if experimental_web:
        replace_file(html, '<div id="status" class="status" role="status"></div>', '<section id="starter-card" class="starter-card" role="status" aria-live="polite" hidden><div class="starter-orbit" aria-hidden="true">✦</div><div class="starter-copy"><div class="starter-heading"><strong id="starter-title"></strong><span id="starter-percent" class="starter-percent"></span></div><p id="starter-info"></p><div id="starter-meter" class="starter-meter" role="progressbar" aria-label="Download" aria-valuemin="0" aria-valuemax="100" hidden><span id="starter-fill"></span></div></div></section><div id="status" class="status" role="status"></div>')
    if base_path == '/prism-dflash/':
        replace_file(html, '<h3 data-i18n="generationSettings"></h3>', '<h3 data-i18n="generationSettings"></h3><label><span data-i18n="dflashSelect"></span> <input id="dflash-file" type="file" accept=".gguf"></label><p class="hint" data-i18n="dflashHelp"></p>')
    banner = '''<div id="prism-gpu-notice" style="background:#fff3cd;padding:10px;text-align:center;color:#503a00">Experimental Prism WebGPU: GPU for model layers; some operations run on CPU. Chrome on Apple Silicon tested; performance varies. Separate browser data.</div><script>const m={it:'Prism WebGPU sperimentale: livelli del modello sulla GPU; alcune operazioni usano la CPU. Provato con Chrome su Apple Silicon; velocità variabile. Dati del browser separati.',fr:'Prism WebGPU expérimental : couches du modèle sur GPU ; certaines opérations utilisent le processeur. Testé avec Chrome sur Apple Silicon ; vitesse variable. Données séparées.',de:'Prism WebGPU experimentell: Modellebenen auf der GPU; einige Vorgänge nutzen die CPU. Mit Chrome auf Apple Silicon getestet; Geschwindigkeit variiert. Separate Browserdaten.',es:'Prism WebGPU experimental: capas del modelo en GPU; algunas operaciones usan la CPU. Probado con Chrome en Apple Silicon; velocidad variable. Datos separados.'};document.getElementById('prism-gpu-notice').textContent=m[(navigator.language||'en').slice(0,2)]||document.getElementById('prism-gpu-notice').textContent;</script>'''
    if experimental_web:
        banner = ''
    if base_path == '/web-veloce/':
        banner = '''<div style="background:#fff3cd;padding:10px;text-align:center;color:#503a00" id="speed-test-notice">Experimental WebGPU speed test · Separate browser data · Results may vary</div><script>const speedNotice={it:'Prova sperimentale WebGPU: velocità in verifica · Dati separati',fr:'Test expérimental WebGPU : vitesse en cours de vérification · Données séparées',de:'Experimenteller WebGPU-Test: Geschwindigkeit wird geprüft · Separate Daten',es:'Prueba experimental WebGPU: velocidad en evaluación · Datos separados'};document.getElementById('speed-test-notice').textContent=speedNotice[(navigator.language||'en').slice(0,2)]||document.getElementById('speed-test-notice').textContent;</script>'''
    if base_path == '/dory-web/':
        banner = '''<div id="dory-test-notice" style="background:#fff3cd;padding:10px;text-align:center;color:#503a00">Experimental Dory Web: the engine and speed are being tested. Browser data is separate.</div><script>const doryNotice={it:'Dory Web sperimentale: il motore e la velocità sono in fase di verifica. I dati del browser sono separati.',fr:'Dory Web expérimental : moteur et vitesse en cours de vérification. Données séparées.',de:'Experimentelles Dory Web: Engine und Geschwindigkeit werden geprüft. Separate Browserdaten.',es:'Dory Web experimental: motor y velocidad en evaluación. Datos separados.'};document.getElementById('dory-test-notice').textContent=doryNotice[(navigator.language||'en').slice(0,2)]||document.getElementById('dory-test-notice').textContent;</script>'''
    if base_path == '/intel-prova/':
        banner = '''<div id="intel-test-notice" style="background:#fff3cd;padding:10px;text-align:center;color:#503a00">Experimental Intel GPU test. Speed and answer quality are not yet verified. Browser data is separate.</div><script>const m={it:'Test sperimentale GPU Intel. Velocità e correttezza delle risposte non sono ancora verificate. I dati del browser sono separati.',fr:'Test GPU Intel expérimental. Vitesse et qualité des réponses non encore vérifiées. Données séparées.',de:'Experimenteller Intel-GPU-Test. Geschwindigkeit und Antwortqualität sind noch nicht geprüft. Separate Browserdaten.',es:'Prueba experimental de GPU Intel. La velocidad y la calidad de las respuestas aún no están verificadas. Datos separados.'};document.getElementById('intel-test-notice').textContent=m[(navigator.language||'en').slice(0,2)]||document.getElementById('intel-test-notice').textContent;</script>'''
    if base_path == '/prism-fast/':
        banner = '''<div id="prism-fast-notice" style="background:#fff3cd;padding:10px;text-align:center;color:#503a00">Experimental Bonsai GPU test: performance and correctness are not guaranteed. Browser data is separate; import a local GGUF or download it again.</div><script>const m={it:'Test sperimentale Bonsai GPU: velocità e correttezza non sono garantite. I dati del browser sono separati; importa un GGUF locale o scaricalo di nuovo.',fr:'Test expérimental Bonsai GPU : performances et précision non garanties. Données séparées ; importez ou retéléchargez le GGUF.',de:'Experimenteller Bonsai-GPU-Test: Leistung und Genauigkeit sind nicht garantiert. Getrennte Browserdaten; GGUF importieren oder erneut herunterladen.',es:'Prueba experimental Bonsai GPU: no se garantizan velocidad ni precisión. Datos separados; importa o descarga de nuevo el GGUF.'};document.getElementById('prism-fast-notice').textContent=m[(navigator.language||'en').slice(0,2)]||document.getElementById('prism-fast-notice').textContent;</script>'''
    replace_file(html, '<body>', '<body>' + banner)
    env = dict(os.environ, USB_AI_WEB_BASE=base_path)
    subprocess.run(['npm', 'run', 'build'], cwd=work, env=env, check=True)
    shutil.copytree(work / 'dist', dest, dirs_exist_ok=True)
