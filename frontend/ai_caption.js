const store = require('./store');

const getElId = document.getElementById.bind(document);


async function getModelsListFromAiCaptionServer(captionAiEnabled, captionAiUrl) {
  if (! captionAiEnabled || ! captionAiUrl) {
    return [];
  }
  try {
    const url = joinUrlPath(captionAiUrl, 'available_models');
    const response = await fetch(url);
    if (!response.ok) {
      // throw new Error(`HTTP error! status: ${response.status}`);
      return [];
    }
    const models = await response.json();
    return models.available_models;
  } catch (error) {
    console.error('Error fetching models list:', error);
    return [];
  }
}

async function getPromptsListFromAiCaptionServer(captionAiEnabled, captionAiUrl) {
  if (! captionAiEnabled || ! captionAiUrl) {
    return [];
  }
  try {
    const url = joinUrlPath(captionAiUrl, 'available_prompts');
    const response = await fetch(url);
    if (!response.ok) {
      // throw new Error(`HTTP error! status: ${response.status}`);
      return [];
    }
    const prompts = await response.json();
    return prompts.available_prompts;
  } catch (error) {
    console.error('Error fetching prompts list:', error);
    return [];
  }
}

async function fillInAIModelsAndPrompts(captionAiEnabled, captionAiUrl) {
  const modelDict = await getModelsListFromAiCaptionServer(captionAiEnabled, captionAiUrl);
  const promptsDict = await getPromptsListFromAiCaptionServer(captionAiEnabled, captionAiUrl);

  const modelSelect = getElId('ai-model-select');
  const promptSelect = getElId('ai-prompt-select');

  if (modelSelect && promptSelect && modelDict && promptsDict) {
    modelSelect.innerHTML = '';
    promptSelect.innerHTML = '';

    for (const model in modelDict) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    }
    for (const prompt in promptsDict) {
      const option = document.createElement('option');
      option.value = prompt;
      option.textContent = prompt;
      promptSelect.appendChild(option);
    }

    getElId('ai-caption-row').style.display = 'block';
  }
}


let captionAiModelLoaded = false;
let aiCaptionTimerId = null;
let aiCaptioningSide = null;

async function loadAIModel() {
  const modelName = getElId('ai-model-select').value;
  const config = store.getConfigurations();

  if (!modelName) {
    alert('Please select a model first.');
    return false;
  }

  try {
    const url = joinUrlPath(config.captionAiUrl, 'load_model_service');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ service_model: modelName }),
    });

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return false;
    }

    const result = await response.json();
    console.log('AI model loaded:', modelName, result);
    getElId('load-ai-model-message').textContent = modelName + ' model loaded successfully';
    captionAiModelLoaded = true;
    return true;
  } catch (error) {
    console.error('Error loading AI model:', error);
    return false;
  }
}

async function startDiretoryAiCaption(columnSide) {
  const config = store.getConfigurations();

  if (
      (!('captionAiEnabled' in config) || !config['captionAiEnabled']) ||
      (!('captionAiUrl' in config) || !config['captionAiUrl'])
    ) {
    alert('AI image caption generator URL not configured.');
    return;
  }
  if (aiCaptionTimerId) {
    alert('AI captioning job already in progress.');
    return;
  }
  if (!captionAiModelLoaded) {
    const loaded = await loadAIModel();
    if (!loaded) {
      return;
    }
  }

  const promptName = getElId('ai-prompt-select').value;

  if (!promptName) {
    alert('Please select a prompt first.');
    return;
  }

  const directoryInput = getElId(`${columnSide}-directory`);
  const directoryPath = directoryInput.value;

  if (!directoryPath) {
    alert(`Please enter a directory path for the ${columnSide} side.`);
    return;
  }

  const progressContainer = getElId('progress-container');
  progressContainer.style.display = 'block';

  aiCaptioningSide = columnSide;
  const progressBar = getElId(`progress-bar-${aiCaptioningSide}`);
  const progressText = getElId(`progress-text-${aiCaptioningSide}`);
  const progressExtra = getElId(`progress-extra-${aiCaptioningSide}`);
  const previewOnlyAiCaptions = config['previewOnlyAiCaptions'] || false;

  try {
    const url = joinUrlPath(config['captionAiUrl'], 'caption_directory');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        directory: directoryPath,
        prompt: promptName,
        previewDoNotUpdate: previewOnlyAiCaptions
      }),
    });

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return;
    }

    const data = await response.json();
    progressBar.value = 0;
    progressBar.text = '0%';
    progressText.textContent = `starting; 0 of 0 files processed`;
    progressExtra.textContent = `0 captioned, 0 errors; ` + data.message;

    aiCaptionTimerId = setInterval(pollJobStatus, 10000);

  } catch (error) {
    console.error('Error generating AI captions:', error);
  }
}


async function pollJobStatus() {
    const config = store.getConfigurations();
    const matchedFiles = store.getMatchedFiles();
    const url = joinUrlPath(config.captionAiUrl, 'caption_directory_status');
    const response = await fetch(url);

    if (!response.ok) {
        clearInterval(aiCaptionTimerId);
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch job status');
    }

    const data = await response.json();

    if (data.processed_files >= data.total_files) {
        clearInterval(aiCaptionTimerId);
    }

    const previewOnlyAiCaptions = config['previewOnlyAiCaptions'] || false;

    const progressBar = getElId(`progress-bar-${aiCaptioningSide}`);
    const progressText = getElId(`progress-text-${aiCaptioningSide}`);
    const progressExtra = getElId(`progress-extra-${aiCaptioningSide}`);
    const progress = (data.processed_files / data.total_files) * 100;
    progressBar.value = progress;
    progressBar.text = `${progress}%`;
    progressText.textContent = `${data.processed_files} of ${data.total_files} files processed`;
    progressExtra.textContent = `${data.captioned_files} captioned, ${data.error_count} errors`;

    for (const [file, status] of Object.entries(data.file_statuses)) {
      const fileBaseName = fileOps.getBaseName(file);
      const fileHash = matchedFiles[fileBaseName]['fileHash'];
      const captionId = `${fileHash}-${aiCaptioningSide}-caption`;
      const captionBox = getElId(captionId);
      captionBox.value = status.message;

      if (previewOnlyAiCaptions) {
        if (!captionBox.classList.contains('dirty-caption')) {
          captionBox.classList.add('dirty-caption');
        }
      }
      else {
        const textFile = getFileFromHashSide(fileHash, aiCaptioningSide, true);
        textFile['caption'] = status.message;

        if (captionBox.classList.contains('dirty-caption')) {
          captionBox.classList.remove('dirty-caption');
        }
      }
    }
}

function joinUrlPath(baseUrl, relativePath) {
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }
    if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
    }

    return baseUrl + relativePath;
}

module.exports = {
    getModelsListFromAiCaptionServer: getModelsListFromAiCaptionServer,
    fillInAIModelsAndPrompts: fillInAIModelsAndPrompts,
    loadAIModel: loadAIModel,
    startDiretoryAiCaption: startDiretoryAiCaption
};