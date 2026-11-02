// This startup path is added only to the isolated experimental web build.
let firstWelcomeSeen = false;
let starterPromise;
async function startExperimentalModel() {
  if (selectedId || iosDiagnosticsEnabled()) return;
  try {
    if (!models.some(isStarterModel)) {
      setStatus(tr('starterDownloading'), false, true);
      await downloadVerified(CATALOG[0], ({loaded,total}) => {
        if (!busy && !selectedId) setStatus(`${tr('starterDownloading')} ${Math.floor(loaded / total * 100)}%`, false, true);
      }, {preferCache:true});
      models = await allModels();
    }
    if (!selectedId && !busy) await chooseModel(models.find(isStarterModel).id);
  } catch (error) {
    console.error(error);
    setStatus(`${tr('error')}: ${error.message}`, true);
  }
}
