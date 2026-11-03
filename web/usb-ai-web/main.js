import './style.css';
import katex from 'katex';
window.katex = katex;
import '../code-view.js';
import '../message-markdown.css';
import '../response-view.css';
import '../response-view.js';
import * as db from './storage.js';
import { translations, preferredLanguage } from './i18n.js';
import { CATALOG, IOS_DIAGNOSTIC_MODEL, starterModelForMode } from './catalog.js';
import { searchModels, estimateMemory, isAuxiliaryGguf, WEB_FILE_LIMIT } from './hub.js';
import { readDocument, chunks, retrieve, documentsForChat, completeDocumentForSummary, documentPageFacts } from './retrieval.js';
import { ragContexts, completeWithRetry } from './rag.js';
import { savedModels, downloadCurated, downloadVerified, moveCachedToFolder, addLocalModel, addModelsFromFolder, deleteModel, loadModel, unload, loadedModelId, loadedBackend, streamChat } from './runtime.js';
import { canSaveToFolder, showModelFolder } from './folder-models.js';
import { usesSafariCpu, needsSafariFallback, largeModelWarningBrowser, isWindows, inferencePreferences, hasUsableWebGpu } from './browser-capability.js';
import { browserHardware, modelGuidance, recommendedModel } from './model-guidance.js';
import { memoryContext, memoryMarkdown, parseMemoryMarkdown, rememberRequest, memoryCommand, identityMemoryNotes } from './memory.js';
import { splitGgufFile } from './gguf-split.js';
import { remoteModels, remoteDownload, remoteChat } from './remote.js';
import { iosDiagnosticsEnabled, iosDiagnostic } from './ios-diagnostics.js';
import { ensureSemanticIndex, semanticResults, embeddingQuery } from './semantic-search.js';
import { loadEmbeddingModel, unloadEmbeddingModel, embedText, EMBEDDING_MODEL_ID } from './embedding-runtime.js';
import { validPhotoFiles } from './photo-search.js';
import { sharedChat, parseSharedChat, createShareLink, parseShareLink, MAX_CHAT_BYTES } from './chat-share.js';

const $ = id => document.getElementById(id);
const correctionPrefillEnabled = ['/', '/app/', '/nuovo-web/'].includes(import.meta.env.BASE_URL);
const memoryLimit = correctionPrefillEnabled ? 16000 : 500;
$('memory-text').maxLength = memoryLimit;
$('memory-length-hint').hidden = !correctionPrefillEnabled;
let language = preferredLanguage();
let chats = [], documents = [], models = [], memories = [], activeId, selectedId, busy = false, controller, installing;
let pendingMemoryPrompt = null;
let thinking = false, semanticEnabled = false;
let temperature = 0.7;
let contextSize = 0, outputLimit = 0, cpuThreads = '1', windowsBackend = 'auto';
let remoteConfig, remoteEntries = [];
let remotePanelOpen = false;
try { remotePanelOpen = localStorage.getItem('llamanest-remote-panel-open') === '1'; } catch { /* Storage may be unavailable. */ }
const allModels = async () => [...await savedModels(), ...remoteEntries];
const isRemote = id => String(id || '').startsWith('remote:');
let hubResults = [], hubNext = null, hubSearching = false;
let pendingFirstPrompt = false;
let splitSourceFile, splitController;
const starterModel = () => starterModelForMode(iosDiagnosticsEnabled());
const STARTER_FILE = 'Llama-3.2-1B-Instruct-Q4_K_M.gguf';
const isStarterModel = model => model?.id === starterModel().id || (!iosDiagnosticsEnabled() && [model?.filename, model?.name, model?.url].some(value => typeof value === 'string' && value.endsWith(STARTER_FILE)));
const tr = key => translations[language]?.[key] || translations.en[key] || key;
function renderBrowserModelWarning() {
  const browser = largeModelWarningBrowser();
  for (const id of ['browser-model-warning', 'models-browser-warning']) {
    const warning = $(id);
    warning.hidden = !browser;
    if (browser) warning.textContent = tr(`${browser}LargeModelsUnsupported`);
  }
}
const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
const modelSize = bytes => bytes >= 1e9 ? `${(bytes/1e9).toFixed(2)} GB` : `${(bytes/1e6).toFixed(0)} MB`;
function setStatus(text = '', error = false, loading = false) { $('status').textContent = text; $('status').classList.toggle('error', error); $('status').classList.toggle('loading', loading); }
function translate() { document.documentElement.lang = language; document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = tr(element.dataset.i18n); }); document.querySelectorAll('[data-placeholder]').forEach(element => { element.placeholder = tr(element.dataset.placeholder); }); $('language').value = language; $('stop').ariaLabel = tr('stop'); $('send').ariaLabel = tr('send'); }
function closeSidebar() { $('sidebar').classList.remove('open'); }
function saveSettings() { return db.put('settings', { id: 'main', language, selectedId, activeId, thinking, remoteConfig, contextSize, outputLimit, temperature, cpuThreads, windowsBackend, semanticEnabled }); }
function renderChats() { const list = $('chat-list'); list.replaceChildren(); $('clear-chats').disabled = busy || !chats.length; if (!chats.length) list.append(node('p', tr('noChats'), 'empty')); for (const chat of [...chats].sort((a,b) => b.updated - a.updated)) { const row=node('div',undefined,'history-row'),button=node('button',chat.title,`chat-item${chat.id === activeId ? ' active' : ''}`),rename=node('button','✎','history-action'),remove=node('button','×','history-action'); button.onclick=()=>{activeId=chat.id;saveSettings();render();closeSidebar()}; for(const [control,key] of [[rename,'renameChat'],[remove,'deleteChat']]){control.type='button';control.title=tr(key);control.setAttribute('aria-label',tr(key)+': '+chat.title);control.disabled=busy} rename.onclick=()=>run(async()=>{if(busy)return;const value=prompt(tr('renamePrompt'),chat.title);if(value===null)return;const title=value.trim();if(!title||[...title].length>100||/[\x00-\x1f\x7f]/.test(title)){setStatus(tr('invalidTitle'),true);return}chat.title=title;chat.titleCustom=true;await db.put('chats',chat);render()});remove.onclick=()=>run(()=>deleteChats([chat.id],tr('deleteConfirm')));row.append(button,rename,remove);list.append(row)} }
async function deleteChats(ids,confirmation){if(busy||!ids.length||!confirm(confirmation))return;await db.removeChats(ids);const selected=new Set(ids);documents=documents.filter(doc=>!selected.has(doc.chatId));chats=chats.filter(chat=>!selected.has(chat.id));if(selected.has(activeId))activeId=chats[0]?.id;await saveSettings();render()}
function renderMessages() { const box = $('messages'); box.replaceChildren(); const chat = chats.find(item => item.id === activeId); $('chat-actions').hidden = !chat?.messages.length; if (!chat?.messages.length) { const welcome = node('div', undefined, 'welcome'); welcome.append(node('div', '✦', 'welcome-mark'), node('h1', tr('welcome')), node('p', iosDiagnosticsEnabled() && !selectedId ? tr('iosStarterHint') : models.length ? tr('welcomeNote') : tr(usesSafariCpu() ? 'safariStarterHint' : 'starterHint'))); box.append(welcome); return; } for (const [messageIndex, message] of chat.messages.entries()) { const row = node('article', undefined, `message ${message.role}`); row.append(node('div', message.role === 'user' ? 'U' : '✦', 'avatar')); const content = node('div'); const body = node('div', undefined, 'message-body'); if (message.role === 'assistant') window.USB_AI_RESPONSE_VIEW.render(body, message, language, thinking); else window.USB_AI_CODE_VIEW.render(body, message.text, language); content.append(node('strong', message.role === 'user' ? tr('you') : tr('assistant')), body); if (message.role === 'user') window.USB_AI_CODE_VIEW.addEditButton(content, message, language, value => run(() => send(value, messageIndex, chat.id)), busy); if (message.role === 'assistant' && message.text) { const correction = node('button', tr('rememberCorrection'), 'memory-correction'); correction.onclick = () => { pendingMemoryPrompt = null; $('memory-id').value = ''; $('memory-text').value = correctionPrefillEnabled ? window.USB_AI_RESPONSE_VIEW.splitThinking(message.text).answer : ''; $('memory-dialog').showModal(); $('memory-text').focus(); }; content.append(correction); } if (message.sources?.length) { const details = node('details', undefined, 'source'); details.append(node('summary', `${tr('sources')} (${message.sources.length})`)); for (const source of message.sources) details.append(node('p', `${source.name}: ${source.text}`)); content.append(details); } if (message.text) content.append(messageActions(chat, message)); row.append(content); box.append(row); } $('thread').scrollTop = $('thread').scrollHeight; }
function messageActions(chat, message) {
  const actions = node('div', undefined, 'message-actions');
  for (const [label, path, action] of [
    ['copyMessage', 'M8 4h10a2 2 0 0 1 2 2v11h-2V6H8z M5 8h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', async () => { try { await navigator.clipboard.writeText(message.text); setStatus(tr('messageCopied')); } catch { setStatus(tr('chatCopyError'), true); } }],
    ['shareMessage', 'M12 15V3 M8 7l4-4 4 4 M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6', () => openChatShare({title:chat.title, messages:[message]})]
  ]) {
    const button = node('button', undefined, 'message-action'); button.type = 'button'; button.title = tr(label); button.setAttribute('aria-label', tr(label));
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('aria-hidden','true');
    const shape = document.createElementNS('http://www.w3.org/2000/svg','path'); shape.setAttribute('d',path); svg.append(shape); button.append(svg); button.onclick = action; actions.append(button);
  }
  return actions;
}
function appendModelAdvice(info, model, hardware, recommended = false) {
  const advice = modelGuidance(model, hardware);
  const detail = tr(advice.reason).replace('{minimum}', advice.memory.minimum).replace('{recommended}', advice.memory.recommended);
  info.append(node('small', (recommended ? tr('deviceChoice') + ' · ' : '') + detail, 'model-advice ' + advice.fit));
}
function renderModels() {
  renderRemotePanel();
  const hardware = browserHardware();
  const best = recommendedModel(CATALOG, hardware);
  const summary = $('hardware-advice');
  summary.replaceChildren(node('strong', tr('hardwareAdviceTitle')));
  const hardwareText = hardware.ramGb === null ? tr('browserRamUnknown') : tr('browserHardware').replace('{ram}', hardware.ramGb).replace('{cores}', hardware.cores ?? '?');
  summary.append(node('span', hardwareText + (best ? ' ' + tr('hardwareAdviceChoice').replace('{model}', best.name) : '')));
  const catalog = $('catalog'); catalog.replaceChildren(); for (const item of [...(iosDiagnosticsEnabled() ? [IOS_DIAGNOSTIC_MODEL] : []), ...CATALOG]) { const saved = models.some(model => model.id === item.id); const card = node('div', undefined, 'model-card'); const info = node('div'); info.append(node('strong', item.name), node('small', `${(item.size/1e6).toFixed(0)} MB · ${item.license}`)); appendModelAdvice(info, item, hardware, best?.id === item.id); if (item.mobile) info.append(node('small', tr('phoneModel'))); const link = node('a', tr('source')); link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; info.append(link); card.append(info); if (!saved) { const button = node('button', tr('download'), 'action'); button.disabled = busy || !navigator.onLine; button.onclick = () => run(async () => { setBusy(true); setStatus(tr('downloading')); $('model-progress').classList.add('loading'); await downloadCurated(item.id, ({loaded,total}) => { $('model-progress').textContent = `${tr('downloading')} ${Math.round(loaded/total*100)}%`; }); setStatus(tr('verifying')); models = await allModels(); renderModels(); await chooseModel(item.id); $('model-progress').textContent = ''; }); card.append(button); } catalog.append(card); }
  const saved = $('saved-models'); saved.replaceChildren(); if (!models.length) saved.append(node('p', tr('chooseModel'), 'hint')); for (const model of models.filter(item => item.source !== 'remote')) { const card = node('div', undefined, 'model-card'); const info = node('div'); info.append(node('strong', model.name), node('small', modelSize(model.size))); const partCount = model.shards?.length || model.fileHandles?.length || model.files?.length || 1; if (partCount > 1) info.append(node('small', tr('splitParts').replace('{count}', partCount), 'split-parts')); appendModelAdvice(info, model, hardware); if (model.source === 'directory') info.append(node('small', `${model.folderLabel || 'usb-ai-models'}/${model.filename}`)); else if (model.source === 'download') info.append(node('small', tr('browserCache'))); const invalid = isAuxiliaryGguf(model.filename || model.shards?.[0]?.url || model.url || model.name); if (invalid) info.append(node('small', tr('auxiliaryFile'), 'error')); const needsSplit = model.source === 'directory' && Number(model.size) > WEB_FILE_LIMIT && (model.fileHandles?.length || 1) === 1 || model.source === 'file' && (model.files || []).some(file => file.size > WEB_FILE_LIMIT); if (needsSplit) info.append(node('small', tr('modelNeedsSplit'), 'error')); card.append(info); const actions = node('div', undefined, 'card-actions'); const button = node('button', invalid ? tr('invalidModel') : needsSplit ? tr('splitRequired') : loadedModelId() === model.id ? tr('loaded') : tr('load'), 'action'); button.disabled = invalid || needsSplit || busy || loadedModelId() === model.id; button.onclick = () => run(() => chooseModel(model.id)); actions.append(button); if (model.source === 'directory' && canSaveToFolder()) { const show = node('button', tr('showFolder'), 'action subtle'); show.disabled = busy; show.onclick = () => run(() => showModelFolder(model)); actions.append(show); } if (model.source === 'download' && canSaveToFolder()) { const move = node('button', tr('saveToFolder'), 'action subtle'); move.disabled = busy || !navigator.onLine; move.onclick = () => run(async () => { setBusy(true); $('model-progress').classList.add('loading'); await moveCachedToFolder(model, ({loaded,total}) => { $('model-progress').textContent = `${tr('downloading')} ${Math.round(loaded/total*100)}%`; }); models = await allModels(); $('model-progress').classList.remove('loading'); $('model-progress').textContent = ''; renderModels(); setStatus(tr('savedToFolder')); }); actions.append(move); } const remove = node('button', tr('remove'), 'action subtle'); remove.disabled = busy; remove.onclick = () => run(async () => { if (!confirm(tr(model.source === 'directory' ? 'removeFolderReferenceConfirm' : 'deleteModelConfirm'))) return; await deleteModel(model.id); if (selectedId === model.id) selectedId = undefined; models = await allModels(); await saveSettings(); render(); }); actions.append(remove); card.append(actions); saved.append(card); } }
function renderAttachments() { const box = $('chat-attachments'); box.replaceChildren(); for (const doc of documentsForChat(documents, activeId)) { const chip = node('button', '📄 ' + doc.name, 'attachment-chip'); chip.type = 'button'; chip.title = tr('documents'); chip.onclick = () => { renderDocs(); $('docs-dialog').showModal(); }; box.append(chip); } }
function renderDocs() { const box = $('doc-list'), legacy = $('legacy-doc-list'); box.replaceChildren(); legacy.replaceChildren(); const current = documentsForChat(documents, activeId); if (!current.length) box.append(node('p', tr('noChatDocs'), 'hint')); for (const doc of current) { const card = node('div', undefined, 'doc-card'); card.append(node('span', `${doc.name}${doc.pageCount ? ' · '+doc.pageCount+' '+tr('pages') : ''} · ${doc.chunks.length}`)); const button = node('button', tr('remove'), 'action subtle'); button.onclick = () => run(async () => { await db.remove('documents', doc.id); documents = documents.filter(item => item.id !== doc.id); render(); }); card.append(button); box.append(card); } const old = documents.filter(doc => !doc.chatId); if (old.length) { legacy.append(node('h3', tr('legacyDocs'))); for (const doc of old) { const card = node('div', undefined, 'doc-card'); card.append(node('span', doc.name)); const attach = node('button', tr('attachToChat'), 'action subtle'); attach.onclick = () => run(async () => { if (!activeId) await newChat(); doc.chatId = activeId; await db.put('documents', doc); render(); }); const remove = node('button', tr('remove'), 'action subtle'); remove.onclick = () => run(async () => { await db.remove('documents', doc.id); documents = documents.filter(item => item.id !== doc.id); render(); }); card.append(attach, remove); legacy.append(card); } } }
function renderMemory() {
  const box = $('memory-list'); box.replaceChildren();
  if (!memories.length) box.append(node('p', tr('memoryEmpty'), 'hint'));
  for (const memory of [...memories].sort((a,b) => b.updated - a.updated)) {
    const row = node('div', undefined, 'memory-item');
    const text = node('p', memory.text);
    const edit = node('button', tr('memoryEdit'), 'action subtle');
    edit.onclick = () => { $('memory-id').value = memory.id; $('memory-text').value = memory.text; $('memory-text').focus(); };
    const remove = node('button', tr('remove'), 'action subtle');
    remove.onclick = () => run(async () => { await db.remove('memory', memory.id); memories = memories.filter(item => item.id !== memory.id); renderMemory(); });
    row.append(text, edit, remove); box.append(row);
  }
}
async function saveOnRemote(item) {
  if (item.shards?.length) throw Error(tr('remoteSingleOnly'));
  setBusy(true); setStatus(tr('remoteDownloading'), false, true);
  const saved = await remoteDownload(remoteConfig, item);
  remoteEntries = await remoteModels(remoteConfig); models = await allModels();
  await chooseModel('remote:' + saved.id); setStatus(tr('ready')); render();
}
function renderSearch() {
  const box = $('hub-results'); box.replaceChildren();
  for (const item of hubResults) {
    const card = node('div', undefined, 'model-card');
    const info = node('div'); info.append(node('strong', item.name), node('small', `${modelSize(item.size)} · ${item.license}`));
    if (item.filename) info.append(node('small', item.filename));
    if (item.shards?.length) info.append(node('small', tr('splitParts').replace('{count}', item.shards.length), 'split-parts'));
    const memory = estimateMemory(item.size);
    info.append(node('small', tr('memoryEstimate').replace('{minimum}', memory.minimum).replace('{recommended}', memory.recommended)));
    if (item.shards?.length && item.size > WEB_FILE_LIMIT) info.append(node('small', tr(canSaveToFolder() ? 'largeModelFolder' : 'largeModelCache'), 'model-advice'));
    appendModelAdvice(info, item, browserHardware());
    const link = node('a', tr('source')); link.href = item.source; link.target = '_blank'; link.rel = 'noopener noreferrer'; info.append(link); card.append(info);
    const installed = models.some(model => model.id === item.id);
    if (item.tooLargeForWeb) {
      info.append(node('small', tr('downloadThenSplit'), 'model-advice'));
      const download = node('a', tr('downloadForSplit'), 'action');
      download.href = item.url;
      download.target = '_blank'; download.rel = 'noopener noreferrer';
      card.append(download);
      if (remoteConfig) { const remoteButton = node('button', tr('saveRemote'), 'action subtle'); remoteButton.disabled = busy; remoteButton.onclick = () => run(() => saveOnRemote(item)); card.append(remoteButton); }
      box.append(card);
      continue;
    }
    const button = node('button', installed ? tr('load') : tr('download'), 'action');
    button.disabled = busy || (!installed && !navigator.onLine);
    button.onclick = () => run(async () => {
      if (!installed) {
        setBusy(true); setStatus(tr('downloading')); $('model-progress').classList.add('loading');
        await downloadVerified(item, ({loaded,total,part,parts}) => { $('model-progress').textContent = `${tr('downloading')} ${part ? `${part}/${parts} · ` : ''}${Math.round(loaded/total*100)}%`; });
        models = await allModels();
        $('model-progress').textContent = '';
      }
      await chooseModel(item.id);
    });
    card.append(button);
    if (remoteConfig) { const remoteButton = node('button', tr('saveRemote'), 'action subtle'); remoteButton.disabled = busy; remoteButton.onclick = () => run(() => saveOnRemote(item)); card.append(remoteButton); }
    box.append(card);
  }
  $('hub-more').hidden = hubNext == null || hubSearching;
  $('hub-more').disabled = busy;
}
async function searchHub(skip = 0) {
  if (hubSearching) return;
  const query = $('hub-query').value.trim();
  hubSearching = true; $('hub-status').textContent = tr('searching');
  if (skip === 0) { hubResults = []; hubNext = null; renderSearch(); }
  try {
    const result = await searchModels(query, skip);
    hubResults.push(...result.models.filter(model => !hubResults.some(existing => existing.name.toLowerCase() === model.name.toLowerCase()))); hubNext = result.nextSkip;
    $('hub-status').textContent = hubResults.length ? '' : result.oversizedCount ? tr('noSplitRelease') : tr('noResults');
  } catch (error) { $('hub-status').textContent = `${tr('error')}: ${error.message}`; }
  finally { hubSearching = false; renderSearch(); }
}
function render() { translate(); document.querySelector('.local-pill').textContent = isRemote(selectedId) ? tr('remoteActive') : tr('private'); document.querySelector('.composer-note').textContent = isRemote(selectedId) ? tr('remoteDataNotice') : tr('localNote'); $('semantic-toggle').textContent = tr(semanticEnabled ? 'semanticOn' : 'semanticOff'); $('semantic-toggle').setAttribute('aria-pressed', String(semanticEnabled)); $('semantic-toggle').classList.toggle('on', semanticEnabled); $('thinking-toggle').textContent = tr(thinking ? 'thinkingOn' : 'thinkingOff'); $('thinking-toggle').setAttribute('aria-pressed', String(thinking)); $('thinking-toggle').classList.toggle('on', thinking); renderBrowserModelWarning(); renderChats(); renderMessages(); if ($('models-dialog').open) { renderModels(); renderSearch(); } if ($('docs-dialog').open) renderDocs(); if ($('memory-dialog').open) renderMemory(); $('model-trigger').textContent = `${models.find(model => model.id === selectedId)?.name || tr('chooseModel')} ⌄`; $('send').disabled = busy; $('stop').hidden = !controller; $('attach-files').ariaLabel = tr('attachFiles'); $('attach-files').title = tr('attachFiles'); renderAttachments(); const backend = !isRemote(selectedId) && loadedModelId() === selectedId ? loadedBackend() : undefined; const backendLabel = backend?.kind === 'gpu' ? tr('backendGpu').replace('{layers}',backend.layers).replace('{total}',backend.total) : backend?.kind === 'cpu' ? tr('backendCpu') : tr('backendUnknown'); $('backend-indicator').hidden = !backend; $('backend-indicator').textContent = backend ? backendLabel : ''; $('capability').textContent = `${navigator.gpu ? tr('backendAvailable') : tr('backendUnavailable')} · ${backend ? backendLabel : tr('backendNotLoaded')}`; $('folder-hint').textContent = tr(canSaveToFolder() ? 'folderHint' : 'folderFallbackHint'); $('choose-folder').hidden = !canSaveToFolder(); $('first-model-choice').hidden = !pendingFirstPrompt; $('download-starter-model').disabled = busy || !navigator.onLine; $('split-start').disabled = !splitSourceFile || busy || !canSaveToFolder(); $('split-cancel').hidden = !splitController; if (!canSaveToFolder()) $('split-progress').textContent = tr('splitBrowserUnavailable'); }
function setBusy(value) {
  busy = value;
  $('send').disabled = value;
  $('unload-model').disabled = value || photoBusy;
  $('cpu-threads').disabled = value;
  $('windows-backend').disabled = value;
  $('semantic-toggle').disabled = value;
  $('stop').hidden = !controller;
  if ($('models-dialog').open) { renderModels(); renderSearch(); }
}
async function run(callback) { try { await callback(); } catch (error) { if (error.name === 'AbortError') { $('model-progress').classList.remove('loading'); $('model-progress').textContent = ''; setStatus(); return; } console.error(error); const message = error.message === 'GPU_OUT_OF_MEMORY' ? tr('gpuOutOfMemory') : error.message === 'EMBEDDING_WEBGPU_UNAVAILABLE' ? tr('semanticGpuUnavailable') : error.message === 'SEMANTIC_LOCAL_ONLY' ? tr('semanticOnlyLocal') : error.message === 'SMARTPHONE_DISABLED' ? tr('phoneUnavailable') : error.message === 'MODEL_FILE_PERMISSION' ? tr('folderPermission') : error.message === 'NO_GGUF_IN_FOLDER' ? tr('noModelsInFolder') : error.message === 'INCOMPLETE_SHARDS' ? tr('incompleteShards') : error.message === 'AUXILIARY_GGUF' ? tr('auxiliaryFile') : error.message === 'MODEL_NEEDS_SPLIT' ? tr('modelNeedsSplit') : error.message === 'MODEL_STORAGE_LOW' ? tr('modelStorageLow') : error.message === 'LOAD_TIMEOUT' ? tr('loadTimeout') : error.message === 'DOCUMENT_NO_TEXT' ? tr('documentNoText') : /QuotaExceeded|storage|no space/i.test(error.name + ' ' + error.message) ? tr('storageError') : error.message; setStatus(`${tr('error')}: ${message}`, true); $('model-progress').classList.remove('loading'); $('model-progress').textContent = `${tr('error')}: ${message}`; } finally { if (busy && !controller) setBusy(false); } }
async function chooseModel(id) {
  if (isRemote(id)) { if (!remoteEntries.some(item => item.id === id)) throw Error(tr('remoteUnavailable')); selectedId = id; await saveSettings(); setStatus(tr('ready')); if ($('models-dialog').open) $('models-dialog').close(); render(); if (pendingFirstPrompt) { pendingFirstPrompt = false; await send(); } return; }
  if (busy && controller) return;
  setBusy(true);
  setStatus(tr('loading'), false, true);
  const progress = $('model-progress');
  progress.classList.add('loading');
  progress.textContent = tr('loading');
  const started = Date.now();
  const elapsed = setInterval(() => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    progress.textContent = `${tr('loading')} ${seconds} s${seconds >= 60 ? ` · ${tr('loadSlow')}` : ''}`;
    setStatus(progress.textContent, false, true);
  }, 1000);
  let loaded = false;
  try {
    await loadModel(id, contextSize, cpuThreads, isWindows() ? windowsBackend : 'auto');
    selectedId = id;
    loaded = true;
    await saveSettings();
    setStatus(tr('ready'));
    progress.textContent = '';
    if ($('models-dialog').open) $('models-dialog').close();
  } finally {
    clearInterval(elapsed);
    progress.classList.remove('loading');
    setBusy(false);
    render();
  }
  if (loaded && pendingFirstPrompt) { pendingFirstPrompt = false; await send(); }
}
async function newChat() { const chat = { id: crypto.randomUUID(), title: tr('newChat').replace('＋ ',''), messages: [], updated: Date.now() }; chats.unshift(chat); activeId = chat.id; await db.put('chats', chat); await saveSettings(); render(); closeSidebar(); $('prompt').focus(); }
async function send(editedText, editIndex, editChatId) {
  const editing = Number.isInteger(editIndex);
  if (editing && (activeId !== editChatId || chats.find(item => item.id === activeId)?.messages[editIndex]?.role !== 'user')) return;
  const text = (editing ? editedText : $('prompt').value).trim();
  if (!text || busy) return;
  const command = editing ? null : memoryCommand(text);
  const note = editing ? null : command ?? rememberRequest(text);
  if (note !== null) {
    pendingMemoryPrompt = text;
    $('memory-id').value = '';
    $('memory-text').value = note;
    renderMemory();
    $('memory-dialog').showModal();
    $('memory-text').focus();
    return;
  }
  const directNotes = documentsForChat(documents, activeId).length ? [] : identityMemoryNotes(text, memories);
  if (directNotes.length) {
    let chat = chats.find(item => item.id === activeId);
    if (!chat) { await newChat(); chat = chats.find(item => item.id === activeId); }
    const reply = `${tr('memoryRecallIntro')}\n${directNotes.map(item => `- ${item.text}`).join('\n')}\n${tr('memoryRecallLimit')}`;
    if (editing) chat.messages.splice(editIndex);
    chat.messages.push({ role:'user', text }, { role:'assistant', text:reply });
    if (!chat.titleCustom) chat.title = chat.messages.find(message => message.role === 'user')?.text.slice(0,55) || chat.title;
    chat.updated = Date.now();
    await db.put('chats', chat);
    if (!editing) $('prompt').value = '';
    setStatus(tr('ready'));
    render();
    return;
  }
  if (!selectedId) {
    const starter = models.find(isStarterModel);
    if (starter) {
      await chooseModel(starter.id);
    } else {
      pendingFirstPrompt = true;
      await downloadStarterForFirstPrompt();
      return;
    }
  }
  let chat = chats.find(item => item.id === activeId);
  if (!chat) { await newChat(); chat = chats.find(item => item.id === activeId); }
  const chatDocuments = documentsForChat(documents, chat.id);
  if (semanticEnabled && chatDocuments.length && isRemote(selectedId)) throw Error('SEMANTIC_LOCAL_ONLY');
  const fullDocument = !isRemote(selectedId) && !usesSafariCpu() && !iosDiagnosticsEnabled() ? completeDocumentForSummary(text, chatDocuments, contextSize, outputLimit) : null;
  let sources = fullDocument || (chatDocuments.length ? retrieve(text, chatDocuments, 3) : []);
  if (!fullDocument && semanticEnabled && chatDocuments.length && !isRemote(selectedId)) {
    setBusy(true); setStatus(tr('semanticPreparing'), false, true);
    try {
      const index = await ensureSemanticIndex(chatDocuments, embedText, doc => db.put('documents', doc), {
        modelId:EMBEDDING_MODEL_ID,
        onProgress:(done,total) => setStatus(tr('semanticIndexing').replace('{done}',done).replace('{total}',total),false,true)
      });
      const queryVector = await embedText(embeddingQuery(text));
      sources = semanticResults(queryVector, index, 3);
    } finally { setBusy(false); }
  }
  const hasNewDocument = chatDocuments.some(doc => (doc.updated || 0) >= (chat.updated || 0));
  const contexts = ragContexts(hasNewDocument ? [] : editing ? chat.messages.slice(0, editIndex) : chat.messages, text, sources, !!fullDocument);
  for (const context of contexts) context.unshift({ role:'system', content: thinking ? 'If the model supports reasoning, put intermediate thinking in <think>...</think> and then give a clear final answer.' : 'Answer directly. Do not show intermediate reasoning or <think> content.' });
  const pageFacts = documentPageFacts(chatDocuments);
  if (pageFacts) for (const context of contexts) context.unshift({role:'system',content:pageFacts});
  const remembered = memoryContext(text, memories, memoryLimit);
  if (remembered) for (const context of contexts) context.unshift({ role:'system', content:remembered });
  const answer = { role:'assistant', text:'', sources: sources.map(({name,text}) => ({name,text})) };
  const previousMessages = editing ? chat.messages.slice() : null;
  const previousTitle = chat.title;
  if (editing) chat.messages.splice(editIndex);
  chat.messages.push({ role:'user', text }, answer);
  if (!chat.titleCustom) chat.title = chat.messages.find(message => message.role === 'user')?.text.slice(0,55) || chat.title;
  chat.updated = Date.now();
  if (!editing) $('prompt').value = '';
  controller = new AbortController();
  setBusy(true); setStatus(tr('generating'), false, true); renderMessages();
  const body = $('messages').lastElementChild?.querySelector('.message-body');
  const streamView = body && window.USB_AI_RESPONSE_VIEW.streamRenderer(body, answer, language, thinking, $('thread'));
  try {
    if (!isRemote(selectedId)) {
      setStatus(tr('loading'), false, true);
      await loadModel(selectedId, contextSize, cpuThreads, isWindows() ? windowsBackend : 'auto');
      setStatus(tr('generating'), false, true);
    }
    answer.usage = await completeWithRetry(contexts, (messages, onToken, signal) => isRemote(selectedId) ? remoteChat(remoteConfig, selectedId.slice(7), messages, onToken, signal, temperature) : streamChat(messages, onToken, signal, thinking, outputLimit, temperature), token => {
      answer.text += token;
      streamView?.update();
    }, controller.signal, () => {
      answer.text = '';
      setStatus(tr('retryingAnswer'));
    });
    setStatus(controller.signal.aborted ? tr('stopped') : tr('ready'));
  } catch (error) {
    if (!controller.signal.aborted) {
      const message = error.message === 'GPU_OUT_OF_MEMORY' ? `${tr('error')}: ${tr('gpuOutOfMemory')}` : error.message === 'EMPTY_MODEL_RESPONSE' ? tr('emptyResponse') : error.message === 'GENERATION_TIMEOUT' ? tr('safariGenerationTimeout') : error.message === 'CREATOR_PROMPT_TOO_LONG' ? tr('creatorPromptTooLong') : `${tr('error')}: ${error.message}`;
      if (editing && !answer.text) { chat.messages = previousMessages; chat.title = previousTitle; }
      else answer.text ||= message;
      setStatus(message, true);
    }
  } finally {
    streamView?.flush();
    controller = undefined;
    chat.updated = Date.now();
    await db.put('chats', chat);
    setBusy(false); render();
  }
}
async function init() { if (iosDiagnosticsEnabled()) { $('ios-diagnostic').hidden = false; iosDiagnostic('diagnostics', 'experimental iPhone mode · CPU · 1 thread · context 512'); } try { const settings = await db.get('settings','main'); language = settings?.language || preferredLanguage(); selectedId = settings?.selectedId; activeId = settings?.activeId; thinking = !!settings?.thinking; semanticEnabled = !!settings?.semanticEnabled; contextSize = [1024,2048,4096,8192,16384,32768,65536,131072,262144,524288,1048576].includes(Number(settings?.contextSize)) ? Number(settings.contextSize) : 0; outputLimit = [1024,3072,4096,8192,16384].includes(Number(settings?.outputLimit)) ? Number(settings.outputLimit) : 0; const webGpuAvailable = isWindows() && !['auto','cpu','gpu'].includes(settings?.windowsBackend) ? await hasUsableWebGpu() : false; ({cpuThreads, windowsBackend} = inferencePreferences(settings, isWindows(), webGpuAvailable)); $('windows-backend').value = windowsBackend; $('windows-backend-settings').hidden = !isWindows(); $('cpu-threads').value = cpuThreads; $('context-size').value = String(contextSize); temperature = Number.isFinite(settings?.temperature) && settings.temperature >= 0 && settings.temperature <= 2 ? settings.temperature : 0.7; $('generation-temperature').value = temperature.toFixed(1); $('output-limit').value = String(outputLimit); remoteConfig = settings?.remoteConfig; [chats, documents, models, memories] = await Promise.all([db.all('chats'), db.all('documents'), savedModels(), db.all('memory')]); if (remoteConfig) { try { remoteEntries = await remoteModels(remoteConfig); models.push(...remoteEntries); } catch (error) { setStatus(tr('error') + ': ' + error.message, true); } } if (isAuxiliaryGguf(models.find(model => model.id === selectedId)?.filename || models.find(model => model.id === selectedId)?.url || '')) { selectedId = undefined; await saveSettings(); } if (!chats.some(chat => chat.id === activeId)) activeId = chats[0]?.id; if (iosDiagnosticsEnabled() && models.some(model => model.id === selectedId && (model.id === 'llama-3.2-1b' || [model.filename,model.name,model.url].some(value => typeof value === 'string' && value.endsWith(STARTER_FILE))))) selectedId = models.find(isStarterModel)?.id; if (!models.some(model => model.id === selectedId) && !isRemote(selectedId)) selectedId = iosDiagnosticsEnabled() ? models.find(isStarterModel)?.id : usesSafariCpu() ? undefined : models.find(isStarterModel)?.id; render(); await importChatFromLink(); if (needsSafariFallback(models.find(model => model.id === selectedId))) setStatus(tr('safariLargeModelWarning')); else if (isStarterModel(models.find(model => model.id === selectedId))) await run(() => chooseModel(selectedId)); } catch (error) { setStatus(`${tr('error')}: ${error.message}`, true); } }
$('prompt-form').onsubmit = event => { event.preventDefault(); run(send); };
$('prompt').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('prompt-form').requestSubmit(); } };
$('stop').onclick = () => controller?.abort();
$('semantic-toggle').onclick = () => run(async () => {
  if (busy) return;
  if (!semanticEnabled && isRemote(selectedId)) throw Error('SEMANTIC_LOCAL_ONLY');
  if (semanticEnabled) { semanticEnabled = false; await unloadEmbeddingModel(); await saveSettings(); render(); return; }
  setBusy(true); setStatus(tr('semanticPreparing'), false, true);
  try {
    await loadEmbeddingModel(progress => {
      if (progress.stage === 'download') setStatus(tr('semanticDownloading').replace('{file}',progress.file),false,true);
      else if (progress.stage === 'loading') setStatus(tr('semanticPreparing'),false,true);
    });
    semanticEnabled = true; await saveSettings(); setStatus(tr('ready')); render();
  } finally { setBusy(false); }
});
$('windows-backend').onchange = () => { windowsBackend = $('windows-backend').value; saveSettings(); };
$('cpu-threads').onchange = () => { cpuThreads = $('cpu-threads').value; saveSettings(); };
$('generation-temperature').onchange = () => { temperature = Number($('generation-temperature').value); saveSettings(); };
$('context-size').onchange = () => { contextSize = Number($('context-size').value); saveSettings(); };
$('output-limit').onchange = () => { outputLimit = Number($('output-limit').value); saveSettings(); };
$('unload-model').onclick = () => run(async () => {
  if (busy || photoBusy) return;
  setBusy(true); $('unload-status').textContent = tr('releasingModel');
  try {
    await unload();
    await unloadEmbeddingModel();
    photoTerminate();
    $('unload-status').textContent = tr('modelMemoryReleased');
    render();
  } catch (error) {
    $('unload-status').textContent = `${tr('error')}: ${error.message}`;
    throw error;
  } finally { setBusy(false); }
});
$('thinking-toggle').onclick = () => { thinking = !thinking; saveSettings(); render(); };
$('new-chat').onclick = () => run(newChat);
$('menu').onclick = () => $('sidebar').classList.toggle('open');
for (const id of ['models-open','model-trigger']) $(id).onclick = () => { closeSidebar(); renderModels(); renderSearch(); $('models-dialog').showModal(); };
$('docs-open').onclick = () => { closeSidebar(); renderDocs(); $('docs-dialog').showModal(); };
$('photos-open').onclick = () => { closeSidebar(); $('photo-dialog').showModal(); };
$('photo-choose').onclick = () => $('photo-files').click();
let photoWorker, photoFiles = [], photoSelection = 0, photoUrls = [], photoBusy = false;
function photoSetBusy(value) {
  photoBusy = value;
  $('unload-model').disabled = value || busy;
  $('photo-submit').disabled = value;
  $('photo-files').disabled = value;
  $('photo-choose').disabled = value;
  $('photo-stop').hidden = !value;
}
function photoClearResults() {
  for (const url of photoUrls) URL.revokeObjectURL(url);
  photoUrls = [];
  $('photo-results').replaceChildren();
}
function photoTerminate() { photoWorker?.terminate(); photoWorker = undefined; photoSetBusy(false); }
$('photo-dialog').addEventListener('close', () => {
  photoTerminate(); photoClearResults(); photoFiles = []; photoSelection++;
  $('photo-files').value = ''; $('photo-query').value = ''; $('photo-count').textContent = ''; $('photo-status').textContent = '';
});
$('photo-files').onchange = event => {
  const files = [...event.target.files];
  if (!files.length) return;
  if (!validPhotoFiles(files)) {
    event.target.value = ''; photoFiles = []; photoTerminate(); photoClearResults(); $('photo-count').textContent = ''; $('photo-status').textContent = tr('photoSelectError'); return;
  }
  photoTerminate(); photoClearResults(); photoFiles = files; photoSelection++;
  $('photo-count').textContent = tr('photoCount').replace('{count}',files.length); $('photo-status').textContent = '';
};
$('photo-stop').onclick = () => { photoTerminate(); $('photo-status').textContent = tr('photoCancelled'); };
$('photo-form').onsubmit = event => {
  event.preventDefault();
  if (photoBusy) return;
  const query = $('photo-query').value.trim();
  if (!photoFiles.length) { $('photo-status').textContent = tr('photoNeedFiles'); return; }
  if (!query) return;
  if (!navigator.gpu) { $('photo-status').textContent = tr('photoGpuError'); return; }
  photoClearResults(); photoSetBusy(true); $('photo-status').textContent = tr('photoLoading');
  if (!photoWorker) {
    photoWorker = new Worker(new URL('./photo-worker.js', import.meta.url), {type:'module'});
    photoWorker.onerror = () => { photoTerminate(); $('photo-status').textContent = tr('photoError').replace('{error}',tr('error')); };
    photoWorker.onmessage = event => {
      const message = event.data;
      if (message.type === 'progress') {
        $('photo-status').textContent = message.stage === 'download' ? tr('photoDownloading').replace('{file}',message.file)
          : message.stage === 'index' ? tr('photoIndexing').replace('{done}',message.done+1).replace('{total}',message.total)
          : message.stage === 'query' ? tr('photoSearching') : tr('photoLoading');
      } else if (message.type === 'result') {
        for (const [rank, item] of message.results.entries()) {
          const file = photoFiles[item.index]; if (!file) continue;
          const url = URL.createObjectURL(file); photoUrls.push(url);
          const card = node('div',undefined,'photo-result'), img = node('img');
          img.src = url; img.alt = file.name; card.append(img,node('small',String(rank+1)),node('span',file.name)); $('photo-results').append(card);
        }
        photoSetBusy(false); $('photo-status').textContent = tr('photoDone');
      } else if (message.type === 'error') {
        photoTerminate(); $('photo-status').textContent = message.message === 'PHOTO_WEBGPU_UNAVAILABLE' ? tr('photoGpuError') : tr('photoError').replace('{error}',message.message);
      }
    };
  }
  photoWorker.postMessage({type:'search',files:photoFiles,query,selectionId:photoSelection});
};
$('memory-open').onclick = () => { pendingMemoryPrompt = null; closeSidebar(); renderMemory(); $('memory-dialog').showModal(); };
$('memory-dialog').addEventListener('close', () => { pendingMemoryPrompt = null; });
$('memory-form').onsubmit = event => run(async () => { event.preventDefault(); const text = $('memory-text').value.replace(/\s+/g, ' ').trim(); if (!text || text.length > memoryLimit) return; if (!$('memory-id').value && memories.length >= 100) throw Error(tr('memoryFull')); const id = $('memory-id').value || crypto.randomUUID(); const note = { id, text, updated:Date.now() }; await db.put('memory', note); memories = memories.filter(item => item.id !== id); memories.push(note); if (pendingMemoryPrompt === $('prompt').value.trim()) $('prompt').value = ''; pendingMemoryPrompt = null; $('memory-id').value = ''; $('memory-text').value = ''; renderMemory(); $('memory-dialog').close(); setStatus(tr('memorySaved')); });
$('memory-export').onclick = () => { const url = URL.createObjectURL(new Blob([memoryMarkdown(memories)], {type:'text/markdown'})); const link = node('a'); link.href = url; link.download = 'usb-ai-memory.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$('memory-import').onchange = event => run(async () => { const file = event.target.files?.[0]; event.target.value = ''; if (!file || file.size > (correctionPrefillEnabled ? 1_700_000 : 100_000)) return; for (const text of parseMemoryMarkdown(await file.text(), memoryLimit)) { if (memories.length >= 100) break; if (memories.some(note => note.text === text)) continue; const note = { id:crypto.randomUUID(), text, updated:Date.now() }; await db.put('memory', note); memories.push(note); } renderMemory(); });
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
async function importSharedChat(data) {
  if (!confirm(tr('shareImportConfirm').replace('{title}', data.title))) return;
  const chat = {id:crypto.randomUUID(), title:data.title, messages:data.messages, updated:Date.now()};
  await db.put('chats', chat); chats.unshift(chat); activeId = chat.id;
  await saveSettings(); render(); setStatus(tr('shareImported'));
}
async function importChatFromLink() {
  if (!location.hash.startsWith('#chat=')) return;
  const hash = location.hash;
  history.replaceState(history.state, '', location.pathname + location.search);
  try { await importSharedChat(await parseShareLink(hash)); }
  catch { setStatus(tr('shareInvalid'), true); }
}
let shareData, shareLink;
$('share-chat').onclick = () => openChatShare(chats.find(item => item.id === activeId));
async function openChatShare(chat) {
  if (!chat?.messages.length) { setStatus(tr('chatCopyEmpty')); return; }
  try { shareData = sharedChat(chat); }
  catch { setStatus(tr('shareTooLarge'), true); return; }
  shareLink = null; $('share-link').value = ''; $('share-link').hidden = true;
  $('share-copy').hidden = true; $('share-whatsapp').hidden = true;
  $('share-status').textContent = tr('sharePreparing'); $('share-dialog').showModal();
  try { shareLink = await createShareLink(shareData, location.href); } catch { /* File export remains available. */ }
  if (!$('share-dialog').open) return;
  $('share-link').value = shareLink || ''; $('share-link').hidden = !shareLink;
  $('share-copy').hidden = !shareLink; $('share-whatsapp').hidden = !shareLink;
  $('share-status').textContent = tr(shareLink ? 'shareLinkReady' : 'shareUseFile');
}
$('share-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(shareLink); $('share-status').textContent = tr('shareLinkCopied'); }
  catch { $('share-status').textContent = tr('chatCopyError'); }
};
$('share-whatsapp').onclick = () => { if (shareLink) window.open('https://wa.me/?text=' + encodeURIComponent(shareLink), '_blank', 'noopener,noreferrer'); };
$('share-file').onclick = () => {
  if (!shareData) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(shareData)], {type:'application/json'}));
  const link = node('a'); link.href = url; link.download = 'llamanest-chat.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('import-chat').onclick = () => $('import-chat-file').click();
$('import-chat-file').onchange = async event => {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file) return;
  try { if (file.size > MAX_CHAT_BYTES) throw Error('INVALID_CHAT'); await importSharedChat(parseSharedChat(await file.text())); }
  catch { setStatus(tr('shareInvalid'), true); }
};
$('copy-chat').onclick = async () => {
  const chat = chats.find(item => item.id === activeId);
  if (!chat?.messages.length) { setStatus(tr('chatCopyEmpty')); return; }
  const content = chat.messages.map(item => `${item.role === 'user' ? tr('you') : tr('assistant')}:\n${item.text}`).join('\n\n');
  try { await navigator.clipboard.writeText(content); setStatus(tr('chatCopied')); }
  catch { setStatus(tr('chatCopyError'), true); }
};
$('language').onchange = () => { language = $('language').value; saveSettings(); render(); };
$('attach-files').onclick = () => $('chat-files').click();
$('model-file').onchange = event => run(async () => { const files = [...event.target.files]; event.target.value = ''; const result = await addLocalModel(files); models = await allModels(); if (!result.persistent) models.push({ id:result.id, name:result.name, size:files.reduce((n,f) => n+f.size,0) }); renderModels(); setStatus(result.persistent ? tr('modelSaved') : tr('modelSession')); await chooseModel(result.id); });
$('split-file').onchange = event => { splitSourceFile = event.target.files?.[0]; event.target.value = ''; $('split-progress').textContent = splitSourceFile ? `${splitSourceFile.name} · ${modelSize(splitSourceFile.size)}` : ''; $('split-start').disabled = !splitSourceFile || busy || !canSaveToFolder(); };
$('split-cancel').onclick = () => splitController?.abort();
$('split-start').onclick = () => run(async () => {
  if (!splitSourceFile || !canSaveToFolder()) return;
  const directory = await window.showDirectoryPicker({ id:'usb-ai-split-output', mode:'readwrite', startIn:'downloads' });
  const file = splitSourceFile;
  splitController = new AbortController();
  setBusy(true); $('split-start').disabled = true; $('split-cancel').hidden = false;
  try {
    const result = await splitGgufFile(file, directory, { signal:splitController.signal, onProgress:({loaded,total,part,parts}) => {
      $('split-progress').textContent = `${tr('splitWriting')} ${part}/${parts} · ${Math.round(loaded / total * 100)}%`;
    } });
    const id = crypto.randomUUID();
    await db.put('models', { id, name:file.name, source:'directory', filename:result.names[0], size:result.size,
      fileHandle:result.handles[0], fileHandles:result.handles, folderHandle:directory, folderLabel:directory.name });
    models = await allModels(); renderModels();
    splitSourceFile = undefined; $('split-progress').textContent = tr('splitComplete').replace('{count}', result.names.length);
    setStatus(tr('splitComplete').replace('{count}', result.names.length));
  } catch (error) {
    if (error.name === 'AbortError') $('split-progress').textContent = tr('splitCancelled');
    else { $('split-progress').textContent = `${tr('error')}: ${tr(error.message)}`; throw error; }
  } finally { splitController = undefined; $('split-cancel').hidden = true; setBusy(false); $('split-start').disabled = !splitSourceFile; }
});
$('use-existing-model').onclick = () => { if (canSaveToFolder()) $('choose-folder').click(); else $('model-file').click(); };
$('choose-folder').onclick = () => run(async () => {
  const ids = await addModelsFromFolder();
  models = await allModels();
  renderModels();
  const selected = models.find(model => ids.includes(model.id) && isStarterModel(model)) || (ids.length === 1 ? models.find(model => model.id === ids[0]) : null);
  if (selected) await chooseModel(selected.id);
  else { const message = tr('folderModelsFound').replace('{count}', ids.length); setStatus(message); $('model-progress').textContent = message; }
});
async function downloadStarterForFirstPrompt() {
  const id = starterModel().id;
  setBusy(true); setStatus(tr('starterDownloading'), false, true);
  $('model-progress').classList.add('loading');
  await downloadCurated(id, ({loaded,total}) => {
    const progress = `${tr('starterDownloading')} ${Math.floor(loaded / total * 100)}%`;
    $('model-progress').textContent = progress;
    setStatus(progress, false, true);
  });
  models = await allModels();
  await chooseModel(id);
}
$('download-starter-model').onclick = () => run(downloadStarterForFirstPrompt);
$('hub-search-form').onsubmit = event => { event.preventDefault(); searchHub(); };
$('hub-more').onclick = () => searchHub(hubNext);
async function uploadFiles(event) {
  const files = [...event.target.files];
  event.target.value = '';
  if (!files.length) return;
  await run(async () => {
    if (!activeId) await newChat();
    $('doc-status').textContent = tr('readingDocument');
    setStatus(tr('readingDocument'), false, true);
    try {
      for (const file of files) {
        const {text, pageCount} = await readDocument(file);
        const parts = chunks(text);
        const doc = { id:crypto.randomUUID(), chatId:activeId, name:file.name, chunks:parts, pageCount, updated:Date.now() };
        await db.put('documents', doc);
        documents.push(doc);
      }
      render();
      const message = tr('documentReady').replace('{count}', files.length);
      $('doc-status').textContent = message;
      setStatus(message);
      $('prompt').focus();
    } catch (error) {
      render();
      $('doc-status').textContent = error.message === 'DOCUMENT_NO_TEXT' ? tr('documentNoText') : `${tr('error')}: ${error.message}`;
      throw error;
    }
  });
}
$('doc-file').onchange = uploadFiles;
$('chat-files').onchange = uploadFiles;
$('delete-chat').onclick = () => run(() => deleteChats(activeId ? [activeId] : [],tr('deleteConfirm')));
$('clear-chats').onclick = () => run(() => deleteChats(chats.map(chat=>chat.id),tr('clearChatsConfirm')));
$('export-chat').onclick = () => { const chat = chats.find(item => item.id === activeId); if (!chat) return; const content = chat.messages.map(item => `## ${item.role === 'user' ? tr('you') : tr('assistant')}\n\n${item.text}`).join('\n\n'); const url = URL.createObjectURL(new Blob([content], {type:'text/markdown'})); const link = node('a'); link.href = url; link.download = 'usb-ai-chat.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installing = event; });
$('install').onclick = async () => { if (installing) { installing.prompt(); await installing.userChoice; installing = undefined; $('install').hidden = true; } else setStatus(tr('installUnavailable')); };
window.addEventListener('online', render); window.addEventListener('offline', render);
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.warn);
function setupRemoteUi() {
  const toggle = node('button', undefined, 'action subtle');
  toggle.id = 'remote-toggle'; toggle.type = 'button'; toggle.setAttribute('aria-controls', 'remote-section');
  toggle.onclick = () => {
    remotePanelOpen = !remotePanelOpen;
    try { localStorage.setItem('llamanest-remote-panel-open', remotePanelOpen ? '1' : '0'); } catch { /* Keep the current choice for this session. */ }
    renderRemotePanel();
  };
  const section = node('section', undefined, 'split-tool');
  section.id = 'remote-section';
  const title = node('h3'); title.id = 'remote-title';
  const description = node('p', undefined, 'hint'); description.id = 'remote-description';
  const form = node('form', undefined, 'search-form'); form.id = 'remote-form';
  const url = node('input'); url.id = 'remote-url'; url.type = 'url'; url.required = true; url.placeholder = 'https://dtiwinai.insel.ch:8081'; url.autocomplete = 'url';
  const key = node('input'); key.id = 'remote-token'; key.type = 'password'; key.required = true; key.minLength = 32; key.autocomplete = 'off';
  const connect = node('button', undefined, 'action'); connect.id = 'remote-connect'; connect.type = 'submit';
  const status = node('p', undefined, 'hint'); status.id = 'remote-status'; status.setAttribute('role', 'status');
  const list = node('div', undefined, 'cards'); list.id = 'remote-list';
  form.append(url, key, connect); section.append(title, description, form, status, list);
  $('hardware-advice').before(toggle, section);
  form.onsubmit = event => { event.preventDefault(); run(async () => {
    setBusy(true); status.textContent = tr('remoteConnecting');
    const next = { url: url.value.trim(), token: key.value.trim() };
    const entries = await remoteModels(next);
    remoteConfig = next; remoteEntries = entries; models = await allModels();
    await saveSettings(); status.textContent = tr('remoteConnected'); render();
  }); };
}
function renderRemotePanel() {
  if (!$('remote-title')) return;
  $('remote-section').hidden = !remotePanelOpen;
  $('remote-toggle').setAttribute('aria-expanded', String(remotePanelOpen));
  $('remote-toggle').textContent = `${remotePanelOpen ? '▾' : '▸'} ${tr(remotePanelOpen ? 'remoteHide' : 'remoteShow')}`;
  $('remote-title').textContent = tr('remoteTitle');
  $('remote-description').textContent = tr('remoteDescription');
  $('remote-connect').textContent = tr('remoteConnect');
  $('remote-token').placeholder = tr('remoteToken');
  if (remoteConfig && !$('remote-url').value) $('remote-url').value = remoteConfig.url;
  if (remoteConfig && !$('remote-token').value) $('remote-token').value = remoteConfig.token;
  const list = $('remote-list'); list.replaceChildren();
  for (const model of remoteEntries) {
    const card = node('div', undefined, 'model-card');
    const info = node('div'); info.append(node('strong', model.name), node('small', modelSize(model.size) + ' · dtiwinai'));
    const button = node('button', selectedId === model.id ? tr('loaded') : tr('load'), 'action');
    button.disabled = busy || selectedId === model.id; button.onclick = () => run(() => chooseModel(model.id));
    card.append(info, button); list.append(card);
  }
}
setupRemoteUi();
init();
