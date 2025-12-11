const path = require('path');
const store = require('./store');
const fileOps = require('./fileops');
const configManager = require('./config_manager');
const aiCaption = require('./ai_caption');

// (personal preference) I like to shorten common HTML DOM function calls to make it easier to skim and require fewer key strokes. (simpler and more concise)
const getElId = document.getElementById.bind(document);
const queryClass = document.getElementsByClassName.bind(document);
const makeClickEvent = function(el, fn) { el.addEventListener('click', fn); }

// global data and source of truth
let copyFromCellId = '';
let leftDirectory = '';
let rightDirectory = '';


// this configuration-loaded event occurs after DOMContentLoaded
window.MY_API.onConfigured((configuration) => {
  store.replaceAllConfigurations(configuration);
  configManager.fillInConfigForm();
  const config = store.getConfigurations();
  
  if ('leftDirectory' in config && 'rightDirectory' in config) {
    leftDirectory = config.leftDirectory;
    rightDirectory = config.rightDirectory;
  }

  if (leftDirectory && rightDirectory) {
    getElId('left-directory').value = leftDirectory;
    getElId('right-directory').value = rightDirectory;
  }

  aiCaption.fillInAIModelsAndPrompts(config.captionAiEnabled, config.captionAiUrl)
});

// show the preferences editor
window.MY_API.onMenuClicked((menuItemClicked) => {
  if (menuItemClicked == 'preferences') {
    getElId('preferences-modal-control').checked = true;
  }
});


document.addEventListener('DOMContentLoaded', () => {
  getElId('start-button').addEventListener('click', async () => {
    leftDirectory = getElId('left-directory').value;
    rightDirectory = getElId('right-directory').value;
    if (leftDirectory && rightDirectory) {
      renderMediaTable();
    } else {
      alert('Please enter both directory paths');
    }
  });

  makeClickEvent(getElId('preferences-save'), async function() {
    const saved = await configManager.saveConfig();
    if (!saved) {
      return
    }

    aiCaption.fillInAIModelsAndPrompts(saved.captionAiEnabled, saved.captionAiUrl)
    getElId('preferences-modal-control').checked = false;
  });

  makeClickEvent(getElId('update-captions'), updateDirtyCaptions);
  makeClickEvent(getElId('load-ai-model'), aiCaption.loadAIModel);
  makeClickEvent(getElId('auto-captions-left'), () => aiCaption.startDiretoryAiCaption('left'));
  makeClickEvent(getElId('auto-captions-right'), () => aiCaption.startDiretoryAiCaption('right'));

  configManager.setPreferenceFormEventHanders();
});



function createMediaComponent(fileContainer, side) {
  const mediaFile = fileContainer[side+'media'];
  const fileBaseName = fileContainer['fileBaseName'];
  const fileHash = fileContainer['fileHash'];
  const idPrefix = `${fileHash}-${side}-`;

  const container = document.createElement('td');
  container.className = 'media-file';
  container.id = idPrefix + 'cell';

  const mediaInfoContainer = document.createElement('div');
  mediaInfoContainer.className = 'flex five';

  const previewContainer = document.createElement('div');
  previewContainer.className = 'four-fifth';

  const deleteBtn = document.createElement('button');
  deleteBtn.innerHTML = 'Delete <img src="icons/trash.svg" alt="trash can icon" class="svgrepro-icon"/>';
  deleteBtn.setAttribute('aria-label', "Delete this media file and caption");
  deleteBtn.setAttribute('data-tooltip', "Delete this media file and caption");
  deleteBtn.id = idPrefix + 'delete';
  deleteBtn.classList.add("error", "bordered");
  makeClickEvent(deleteBtn, deleteBtnFunction);

  const mediaBtnContainer = document.createElement('div');
  mediaBtnContainer.className = `fifth media-btn-container`;
  mediaBtnContainer.appendChild(deleteBtn);

  const preview = document.createElement('img');
  preview.className = 'media-preview';
  preview.src = mediaFile.path;
  preview.alt = mediaFile.name;

  const info = document.createElement('div');
  info.className = 'media-info';
  info.innerHTML = `Name: ${mediaFile.name}\n&nbsp; &nbsp;Size: ${mediaFile.size}`;
  info.id = idPrefix+'namelabel';
  info.addEventListener('dblclick', function(event) {
    showNameEditFunction(event);
  });

  const nameEdit = document.createElement('input');
  nameEdit.type = 'text';
  nameEdit.className = 'name-text';
  nameEdit.value = fileBaseName;
  nameEdit.id = idPrefix+'nametxtedit';
  nameEdit.setAttribute('placeholder', 'file base name only');
  nameEdit.addEventListener('keyup', function(event) {
    event.preventDefault();
    if (event.key !== 'Enter') {
      return;
    }

    renameFileFunction(event);
  });

  const captionBox = document.createElement('textarea');
  captionBox.className = 'caption-text';
  captionBox.id = idPrefix + 'caption';
  captionBox.setAttribute("placeholder", "Enter caption or labels here.");
  captionBox.setAttribute("aria-label", "Enter caption or labels here.");
  captionBox.addEventListener('change', (event) => {
    const [textFileHash, textSide, textIdSuffix] = getIdHashParts(event.target.id);
    const textFile = getFileFromHashSide(textFileHash, textSide, true);
    
    if (captionBox.value !== textFile.caption) {
      if (! captionBox.classList.contains('dirty-caption')) {
        captionBox.classList.add('dirty-caption');
      }
    } else {
      captionBox.classList.remove('dirty-caption');
    }
  });

  const buttons = document.createElement('div');
  buttons.className = 'media-buttons flex three';

  const copyCaptionFromBtn = document.createElement('button');
  copyCaptionFromBtn.innerHTML = 'Copy <img src="icons/copy1.svg" alt="copy icon" class="svgrepro-icon"/>';
  copyCaptionFromBtn.setAttribute('aria-label', "Copy Caption From Here");
  copyCaptionFromBtn.setAttribute('data-tooltip', "Copy Caption From Here");
  copyCaptionFromBtn.id = idPrefix + 'copytextfrom';
  copyCaptionFromBtn.classList.add("bordered");
  makeClickEvent(copyCaptionFromBtn, copyCaptionFromBtnFunction);

  const pasteCaptionToBtn = document.createElement('button');
  pasteCaptionToBtn.innerHTML = 'Paste <img src="icons/paste.svg" alt="paste icon" class="svgrepro-icon bigger"/>';
  pasteCaptionToBtn.setAttribute('aria-label', "Paste Caption Here");
  pasteCaptionToBtn.setAttribute('data-tooltip', "Paste Caption Here");
  pasteCaptionToBtn.id = idPrefix + 'pastetexthere';
  pasteCaptionToBtn.classList.add("bordered");
  makeClickEvent(pasteCaptionToBtn, pasteCaptionToBtnFunction);

  const updateBtn = document.createElement('button');
  updateBtn.innerHTML = 'Update <img src="icons/save.svg" alt="save icon" class="svgrepro-icon"/>';
  updateBtn.setAttribute('aria-label', "Save caption file");
  updateBtn.setAttribute('data-tooltip', "Save caption file");
  updateBtn.id = idPrefix + 'update';
  updateBtn.classList.add("success", "bordered");
  makeClickEvent(updateBtn, updateBtnFunction);

  buttons.appendChild(updateBtn);
  buttons.appendChild(copyCaptionFromBtn);
  buttons.appendChild(pasteCaptionToBtn);

  previewContainer.appendChild(preview);
  previewContainer.appendChild(info);
  previewContainer.appendChild(nameEdit);

  container.appendChild(mediaInfoContainer);

  if (side === 'left') {
    mediaInfoContainer.appendChild(previewContainer);
    mediaInfoContainer.appendChild(mediaBtnContainer);
  }
  else { // in the right td cell, the send media icon should be on the left
    mediaInfoContainer.appendChild(mediaBtnContainer);
    mediaInfoContainer.appendChild(previewContainer);
  }

  container.appendChild(captionBox);
  container.appendChild(buttons);

  return container;
}



async function renderMediaTable() {
  mediaTableBody.innerHTML = '';

  // Fetch files from directories
  const twoDirs = await fileOps.readDirectories(leftDirectory, rightDirectory);
  const searchFilter = searchBox.value.toLowerCase();
  const newMatchedFiles = fileOps.matchLeftRightDirs(twoDirs, searchFilter)
  store.replaceMatchedFiles( newMatchedFiles );
  const matchedFiles = store.getMatchedFiles();
  const fileHashes = {};

  for (const fileBaseName in matchedFiles) {
    const row = document.createElement('tr');
    const fileHash = matchedFiles[fileBaseName]['fileHash'];
    fileHashes[fileHash] = fileBaseName;

    if ('leftmedia' in matchedFiles[fileBaseName]) {
      const side = 'left';
      const tdChild = createMediaComponent(matchedFiles[fileBaseName], side);
      const hasCompanion = ('rightmedia' in matchedFiles[fileBaseName]);

      if (!hasCompanion) {
        const copyCellBtn = document.createElement('button');
        copyCellBtn.innerHTML = 'Copy <img src="icons/copy1.svg" alt="copy icon" class="svgrepro-icon"/><img src="icons/send_line.svg" alt="send line icon" class="svgrepro-icon"/>';
        copyCellBtn.setAttribute('aria-label', "Copy this media file and caption to the other side");
        copyCellBtn.setAttribute('data-tooltip', "Copy this media file and caption to the other side");
        copyCellBtn.id = `${fileHash}-${side}-copycell`;
        copyCellBtn.classList.add("tertiary", "small");
        makeClickEvent(copyCellBtn, copyCellToOtherSide);

        const mediaBtnContainer = tdChild.querySelector('.media-btn-container');
        mediaBtnContainer.appendChild(copyCellBtn);
      }
      row.appendChild(tdChild);

      if (side+'text' in matchedFiles[fileBaseName]) {
        copyTextFromFileIntoTextArea(fileHash, side, matchedFiles[fileBaseName][side+'text']['path']);
      }
    } else {
      const blankCell = document.createElement('td');
      blankCell.id = `${fileHash}-left-cell`;
      row.appendChild(blankCell);
    }

    if ('rightmedia' in matchedFiles[fileBaseName]) {
      const side = 'right';
      const tdChild = createMediaComponent(matchedFiles[fileBaseName], side);
      const hasCompanion = ('leftmedia' in matchedFiles[fileBaseName]);

      if (!hasCompanion) {
        const copyCellBtn = document.createElement('button');
        copyCellBtn.innerHTML = '<img src="icons/send_line.svg" alt="send line icon" class="svgrepro-icon change-direction"/><img src="icons/copy1.svg" alt="copy icon" class="svgrepro-icon"/> Copy';
        copyCellBtn.setAttribute('aria-label', "Copy this media file and caption to the other side");
        copyCellBtn.setAttribute('data-tooltip', "Copy this media file and caption to the other side");
        copyCellBtn.id = `${fileHash}-${side}-copycell`;
        copyCellBtn.classList.add("tertiary", "small");
        makeClickEvent(copyCellBtn, copyCellToOtherSide);

        const mediaBtnContainer = tdChild.querySelector('.media-btn-container');
        mediaBtnContainer.appendChild(copyCellBtn);
      }
      row.appendChild(tdChild);

      if (side+'text' in matchedFiles[fileBaseName]) {
        copyTextFromFileIntoTextArea(fileHash, side, matchedFiles[fileBaseName][side+'text']['path']);
      }
    } else {
      const blankCell = document.createElement('td');
      blankCell.id = `${fileHash}-right-cell`;
      row.appendChild(blankCell);
    }

    mediaTableBody.appendChild(row);
  }

  store.replaceFileHashes(fileHashes)
}


function copyTextFromFileIntoTextArea(fileHash, side, textFilePath) {
  const idPrefix = `${fileHash}-${side}-`;
  const captionId = idPrefix + 'caption';

  // read from text file and put text in textarea
  fileOps.getTextFileContents(textFilePath, captionId, function(content) {
    const captionBox = getElId(captionId);
    captionBox.value = content;
    captionBox.classList.remove('dirty-caption');
    const textFile = getFileFromHashSide(fileHash, side, true);
    textFile['caption'] = content;
  });
}

const updateBtnFunction = function(event) {
  const [fileHash, side, idSuffix] = getIdHashParts(event.target.id);
  const textFile = getFileFromHashSide(fileHash, side, true);
  const textFilePath = textFile['path'];
  const sourceCaptionId = event.target.id.replace('update', 'caption');
  const captionBox = getElId(sourceCaptionId);
  const captionText = captionBox.value;

  fileOps.writeTextFileContents(textFilePath, captionText, function() {
    captionBox.classList.remove('dirty-caption');
    textFile['caption'] = captionText;
  });
}

const deleteBtnFunction = async function(event) {
  const [fileHash, side, idSuffix] = getIdHashParts(event.target.id);
  const mediaFile = getFileFromHashSide(fileHash, side);
  const filePath = mediaFile['path'];

  fileOps.deleteFile(filePath, function() {
    containerId = event.target.id.replace('delete', 'cell');
    getElId(containerId).innerHTML = '';

    // don't forget to delete the matching text file too
    const textFile = getFileFromHashSide(fileHash, side, true);
    if (textFile) {
	    const textFilePath = textFile['path'];
	    fileOps.deleteFile(textFilePath, function(){});
	}
  });
};

const copyCaptionFromBtnFunction = function(event) {
  // remove previous copy from
  if (copyFromCellId) {
    getElId(copyFromCellId).classList.remove('copying-text-from');
  }

  const copyFromId = event.target.id;
  copyFromCellId = copyFromId.replace('copytextfrom', 'cell');
  getElId(copyFromCellId).classList.add('copying-text-from');
};

const pasteCaptionToBtnFunction = function(event) {
  const copyHereId = event.target.id;
  const copyHereTextId = copyHereId.replace('pastetexthere', 'caption');
  const copyFromTextId = copyFromCellId.replace('cell', 'caption');
  const receiverCaptionBox = getElId(copyHereTextId);
  receiverCaptionBox.value = getElId(copyFromTextId).value;

  if (! receiverCaptionBox.classList.contains('dirty-caption')) {
    receiverCaptionBox.classList.add('dirty-caption');
  }
};

const showNameEditFunction = function(event) {
  event.preventDefault();
  event.target.style.display = 'none';
  const nameEditId = event.target.id.replace('namelabel', 'nametxtedit');
  getElId(nameEditId).style.display = 'block';
};

const renameFileFunction = function(event) {
  const matchedFiles = store.getMatchedFiles();
  const fileHashes = store.getFileHashes();
  const [fileHash, side, idSuffix] = getIdHashParts(event.target.id);
  const mediaFile = getFileFromHashSide(fileHash, side);
  const fileBaseName = fileHashes[fileHash];
  const mediaFilePath = mediaFile['path'];
  const mediaFileOldName = mediaFile['name'];
  const newFileBaseName = event.target.value;
  const mediaFileNewName = mediaFileNewName + mediaFileOldName.substring(mediaFileOldName.lastIndexOf('.')); // event.target.value;
  const nameLabelId = event.target.id.replace('nametxtedit', 'namelabel');
  const nameLabel = getElId(nameLabelId);
  const directory = path.dirname(mediaFilePath);

  if (mediaFileOldName == mediaFileNewName) {
    event.target.style.display = 'none';
    nameLabel.style.display = 'block';
    return;
  }

  fileOps.renameFile(mediaFilePath, mediaFileNewName, function(){
    event.target.style.display = 'none';
    nameLabel.textContent = nameLabel.textContent.replace(mediaFileOldName, mediaFileNewName);
    nameLabel.style.display = 'block';

    const oldMedia = matchedFiles[fileBaseName][side+'media'];
    matchedFiles[newFileBaseName] = { 'fileBaseName':newFileBaseName, 'fileHash': fileHash};
    matchedFiles[newFileBaseName][side+'media'] = {'name':mediaFileNewName, 'path':directory+mediaFileNewName, 'size':oldMedia['size'], 'modified':oldMedia['modified']};

    // rename the matching text file too
    if (side+'text' in matchedFiles[fileBaseName]) {
      const textFileName = fileBaseName + '.txt';
      const newTextFileName = newFileBaseName + '.txt';
      fileOps.renameFile(directory+textFileName, newTextFileName, function(){});
      const oldText = matchedFiles[fileBaseName][side+'text'];
      matchedFiles[newFileBaseName][side+'text'] = {'name':newTextFileName, 'path':directory+newTextFileName, 'size':oldText['size'], 'modified':oldText['modified']};
    }
    
    fileHashes[fileHash] = newFileBaseName;

    const destIdPrefix = `${fileHash}-${side}-`;
    const deleteBtn = getElId(destIdPrefix+'delete');

    event.target.dataset.filepath = directory+mediaFileNewName;
  });
}

function copyCellToOtherSide(event) {
  const matchedFiles = store.getMatchedFiles();
  const fileHashes = store.getFileHashes();
  const copyCellBtnId = event.target.id;
  const [fileHash, side, copyBtnSuffix] = getIdHashParts(copyCellBtnId);
  const fileBaseName = fileHashes[fileHash];
  const otherSide = (side === 'right') ? 'left' : 'right';
  const cellId = `${fileHash}-${side}-cell`;
  const sourceIdPrefix = `${fileHash}-${side}-`;
  const destIdPrefix = `${fileHash}-${otherSide}-`;
  const destDirectory = (side === 'right') ? leftDirectory : rightDirectory;

  // if other side has contents, don't try to copy into it
  const otherCellCaption = getElId( cellId.replace(side, otherSide).replace('cell', 'caption') );
  if (otherCellCaption) {
    alert("Other side already exists or copied already.");
    return;
  }

  const otherCell = getElId(cellId.replace(side, otherSide));
  const copyCellBtn = getElId(copyCellBtnId);
  copyCellBtn.remove(); // before the copy, the copy button should be removed
  const originalCell = getElId(cellId);
  const clonedCell = originalCell.cloneNode(true);
  changeAllIdSides(clonedCell, side, otherSide); // exchange left & right
  originalCell.parentElement.replaceChild(clonedCell, otherCell);

  // copy the media file
  const sourceMedia = getFileFromHashSide(fileHash, side);
  const sourceMediaPath = sourceMedia.path;
  const destMediaPath = path.join(destDirectory, sourceMedia.name);
  fileOps.copyFile(sourceMediaPath, destMediaPath, function(newFile) {
    matchedFiles[fileBaseName][otherSide+'media'] = newFile;
  });

  // copy text from textarea and create a new file
  const sourceCaptionId = sourceIdPrefix + 'caption';
  const captionText = getElId(sourceCaptionId).value;
  const destTextPath = path.join(destDirectory, fileBaseName+'.txt');
  fileOps.writeTextFileContents(destTextPath, captionText, function(newFile) {
    matchedFiles[fileBaseName][otherSide+'text'] = newFile;
  });

  // add event listeners
  const updateBtn = getElId(destIdPrefix+'update');
  const deleteBtn = getElId(destIdPrefix+'delete');
  const copyCaptionFromBtn = getElId(destIdPrefix+'caption');
  const pasteCaptionToBtn = getElId(destIdPrefix+'pastetexthere');
  const info = getElId(destIdPrefix+'namelabel');
  const nameEdit = getElId(destIdPrefix+'nametxtedit');
  makeClickEvent(updateBtn, updateBtnFunction);
  makeClickEvent(deleteBtn, deleteBtnFunction);
  makeClickEvent(copyCaptionFromBtn, copyCaptionFromBtnFunction);
  makeClickEvent(pasteCaptionToBtn, pasteCaptionToBtnFunction);

  info.addEventListener('dblclick', function(event) {
    showNameEditFunction(event);
  });
  nameEdit.addEventListener('keyup', function(event) {
    event.preventDefault();
    if (event.key !== 'Enter') {
      return;
    }
    renameFileFunction(event);
  });

}

function changeAllIdSides(node, side, otherSide) {
  if (node.id) {
    node.id = node.id.replace(side, otherSide);
  }

  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
      changeAllIdSides(children[i], side, otherSide);
  }
}


function getIdHashParts(idHash) {
	const tokens = idHash.split('-', 3);
	return [ tokens[0], tokens[1], tokens[2] ];
}

function getFileFromHashSide(fileHash, side, isText) {
  const matchedFiles = store.getMatchedFiles();
  const fileHashes = store.getFileHashes();
	const secondKey = isText ? side+'text' : side+'media';
  const fileBaseName = fileHashes[fileHash];

	if (!(secondKey in matchedFiles[fileBaseName])) {
		return null;
	}

	return matchedFiles[fileBaseName][secondKey];
}

async function updateDirtyCaptions() {
  const dirtyCaptionBoxes = queryClass('dirty-caption');
  if (dirtyCaptionBoxes.length == 0) {
    alert('No edited captions to update.');
    return;
  }

  for (const captionBox of dirtyCaptionBoxes) {
    const captionId = captionBox.id;
    const [fileHash, side, idSuffix] = getIdHashParts(captionId);
    const textFile = getFileFromHashSide(fileHash, side, true);
    const textFilePath = textFile['path'];
    const captionText = captionBox.value;

    fileOps.writeTextFileContents(textFilePath, captionText, function() {
      captionBox.classList.remove('dirty-caption');
      textFile['caption'] = captionText;
    });
  }
}
