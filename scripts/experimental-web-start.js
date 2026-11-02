// This startup path is added only to the isolated experimental web build.
let firstWelcomeSeen = false;
let starterPromise;
function starterProgress(stage, value) {
  const card = $('starter-card');
  if (stage === 'done') { card.hidden = true; return; }
  const keys = {download:['starterDownloadTitle','starterDownloadInfo'], verify:['starterVerifyTitle','starterVerifyInfo'], load:['starterLoadTitle','starterLoadInfo'], restore:['starterRestoreTitle','starterRestoreInfo']};
  const keysForStage = keys[stage];
  if (!keysForStage) return;
  const percentage = stage === 'download' && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.floor(value))) : null;
  card.hidden = false;
  $('starter-title').textContent = tr(keysForStage[0]);
  $('starter-info').textContent = tr(keysForStage[1]);
  $('starter-percent').textContent = percentage === null ? '' : `${percentage}%`;
  const meter = $('starter-meter');
  meter.hidden = percentage === null;
  if (percentage !== null) { meter.setAttribute('aria-valuenow', String(percentage)); $('starter-fill').style.width = `${percentage}%`; }
}
async function restoreExperimentalModel(id) {
  starterProgress('restore');
  try { await chooseModel(id); }
  finally { starterProgress('done'); }
}
async function startExperimentalModel() {
  if (selectedId || iosDiagnosticsEnabled()) return;
  try {
    if (!models.some(isStarterModel)) {
      starterProgress('download', 0);
      setStatus(tr('starterDownloading'), false, true);
      await downloadVerified(CATALOG[0], ({loaded,total}) => {
        const percentage = total > 0 ? loaded / total * 100 : 0;
        if (!busy && !selectedId) {
          starterProgress(percentage >= 100 ? 'verify' : 'download', percentage);
          setStatus(percentage >= 100 ? tr('starterVerifyTitle') : `${tr('starterDownloading')} ${Math.max(0, Math.floor(percentage))}%`, false, true);
        }
      }, {preferCache:true});
      models = await allModels();
    }
    if (!selectedId && !busy) { starterProgress('load'); await chooseModel(models.find(isStarterModel).id); }
  } catch (error) {
    console.error(error);
    setStatus(`${tr('error')}: ${error.message}`, true);
  } finally { starterProgress('done'); }
}
