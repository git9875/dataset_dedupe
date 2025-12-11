const store = require('./store');
const aiCaption = require('./ai_caption');
const utils = require('./utils');

const getElId = document.getElementById.bind(document);

function fillInConfigForm() {
  const config = store.getConfigurations();

  getElId('preferences-left-directory').value = config.leftDirectory;
  getElId('preferences-right-directory').value = config.rightDirectory;

  if (config.delete == 'trash') {
    getElId('preferences-delete-trash').checked = true;
  }
  else {
    getElId('preferences-delete-delete').checked = true;
  }

  getElId('preferences-url-local-caption-server').value = config.captionAiUrl;
  getElId('preferences-check-local-caption-server').checked = config.captionAiEnabled;
  getElId('preferences-check-caption-preview-only').checked = config.previewOnlyAiCaptions;

  if (config.captionAiEnabled && config.captionAiUrl) {
    aiCaption.fillInAIModelsAndPrompts(config.captionAiEnabled, config.captionAiUrl);
  }

  utils.toggleClassVisibility('ai-enabled-dependent', config.captionAiEnabled);
  utils.toggleClassVisibility('ai-preview-dependent', config.previewOnlyAiCaptions, 'flex');
  getElId('preferences-ai-captionbox-update-method').value = config.captionBoxAiUpdateMethod || 'replace';
  getElId('preferences-ai-captionbox-separator-select').value = config.captionBoxSeparator || 'space';
  getElId('preferences-ai-captionbox-separator').style.display = (config.captionBoxAiUpdateMethod != 'replace') ? 'initial' : 'none';
}


async function saveConfig() {
  const deleteValue = getElId('preferences-delete-trash').checked ? 'trash' : 'delete';

  const configuration = {
    leftDirectory: getElId('preferences-left-directory').value,
    rightDirectory: getElId('preferences-right-directory').value,
    delete: deleteValue,
    captionAiUrl: getElId('preferences-url-local-caption-server').value,
    captionAiEnabled: getElId('preferences-check-local-caption-server').checked,
    previewOnlyAiCaptions: getElId('preferences-check-caption-preview-only').checked,
    captionBoxAiUpdateMethod: getElId('preferences-ai-captionbox-update-method').value,
    captionBoxSeparator: getElId('preferences-ai-captionbox-separator-select').value
  };

  if (configuration.captionAiEnabled) {
    const modelList = await aiCaption.getModelsListFromAiCaptionServer(configuration.captionAiEnabled, configuration.captionAiUrl);
    console.log('saveConfig Model list from AI Caption Server:', modelList);
    if (modelList.length == 0) {
      alert('Warning: Unable to connect to AI Caption Server at the provided URL.');
      return null;
    }
  }

  const appConfigPath = path.join(path.dirname(__dirname), 'app_config.json');
  console.log( 'Saving configuration to', appConfigPath, configuration );
  const configContents = JSON.stringify(configuration, null, 4);
  fileOps.writeTextFileContents(appConfigPath, configContents, function(){});
  store.replaceAllConfigurations(configuration);
  return configuration;
}


function setPreferenceFormEventHanders() {
  const aiEnabledCheckbox = getElId('preferences-check-local-caption-server');
  aiEnabledCheckbox.addEventListener('change', (event) => {
    utils.toggleClassVisibility('ai-enabled-dependent', event.target.checked);
  });

  const previewCheckbox = getElId('preferences-check-caption-preview-only');
  previewCheckbox.addEventListener('change', (event) => {
    utils.toggleClassVisibility('ai-preview-dependent', event.target.checked);
  });
  
  const updateMethodCheckbox = getElId('preferences-ai-captionbox-update-method');
  updateMethodCheckbox.addEventListener('change', (event) => {
    const updateMethod = event.target.value;
    const separatorListVisible = (updateMethod != 'replace');
    getElId('preferences-ai-captionbox-separator').style.display = separatorListVisible ? 'flex' : 'none';
  });
}


module.exports = {
    fillInConfigForm: fillInConfigForm,
    saveConfig: saveConfig,
    setPreferenceFormEventHanders: setPreferenceFormEventHanders
};