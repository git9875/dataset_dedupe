const path = require('path');
const store = require('./store');
const fileOps = require('./fileops');
const configManager = require('./config_manager');
const aiCaption = require('./ai_caption');
const { get } = require('http');

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

  if (leftDirectory) {
    getElId('left-directory').value = leftDirectory;
  }
  if (rightDirectory) {
    getElId('right-directory').value = rightDirectory;
  }

  aiCaption.fillInAIModelsAndPrompts(config.captionAiEnabled, config.captionAiUrl)
});

// show the preferences editor
window.MY_API.onMenuClicked((menuItemClicked) => {
  const promiseArray = [];

  if (menuItemClicked == 'preferences') {
    getElId('preferences-modal-control').checked = true;
  }
  else if (menuItemClicked == 'undo-automated') {
    const captionTextAreaIds = getAllCaptionTextIds();
    for (const captionTextAreaId of captionTextAreaIds) {
      promiseArray.push(undoLastAutomatedAction(captionTextAreaId));
    }
    
    Promise.all(promiseArray).then(() => {
      checkAllCaptionsUpdateDirtyState();
    });

    lastAutomatedCaptionTextChanges = {};
  }
  else if (menuItemClicked == 'all-lowercase') {
    lastAutomatedCaptionTextChanges = {};

    const captionTextAreaIds = getAllCaptionTextIds();
    for (const captionTextAreaId of captionTextAreaIds) {
      promiseArray.push(makeAllLowercase(captionTextAreaId));
    }
    
    Promise.all(promiseArray).then(() => {
      checkAllCaptionsUpdateDirtyState();
    });
  }
  else if (menuItemClicked == 'remove-duplicate-tags') {
    lastAutomatedCaptionTextChanges = {};

    const captionTextAreaIds = getAllCaptionTextIds();
    for (const captionTextAreaId of captionTextAreaIds) {
      promiseArray.push(removeDuplicateTags(captionTextAreaId));
    }
    
    Promise.all(promiseArray).then(() => {
      checkAllCaptionsUpdateDirtyState();
    });
  }
  else if (menuItemClicked == 'search-and-replace') {
    getElId('search-replace-modal-control').checked = true;
  }
});


document.addEventListener('DOMContentLoaded', () => {
  getElId('start-button').addEventListener('click', async () => {
    leftDirectory = getElId('left-directory').value;
    rightDirectory = getElId('right-directory').value;

    // hide the right column if right directory is not provided. The media table will be styled to single-directory mode in that case.
    if (!rightDirectory && !getElId('mediaTable').classList.contains('single-directory')) {
      getElId('mediaTable').classList.add('single-directory');
      const rightColumn = getElId('right-column');
      if (rightColumn) {
        rightColumn.classList.add('hidden');
      }
    }

    if (leftDirectory) {
      renderMediaTable();
    } else {
      alert('Please enter directory path(s)');
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
  makeClickEvent(getElId('test-search-replace-button'), () => testSearchReplace());
  makeClickEvent(getElId('replace-all-button'), () => replaceAll());

  configManager.setPreferenceFormEventHanders();
  enableDraggableSearchReplaceModal();

  getElId('caption-filter-box').addEventListener('input', function() {
    const filterText = this.value.toLowerCase();
    const captionTextAreaIds = getAllCaptionTextIds();

    for (const captionTextAreaId of captionTextAreaIds) {
      const captionTextArea = getElId(captionTextAreaId);
      const captionText = captionTextArea.value.toLowerCase();

      // Hide the tr element that contains this caption textarea if the caption text doesn't include the filter text, otherwise show it. This allows users to quickly filter and find media files based on their captions.
      if (captionText.includes(filterText)) {
        captionTextArea.closest('tr').style.display = '';
      } else {
        captionTextArea.closest('tr').style.display = 'none';
      }
    }
  });

}); // end of DOMContentLoaded event listener



function createMediaComponent(fileContainer, side, rowIndex) {
  const mediaFile = fileContainer[side+'media'];
  const fileBaseName = fileContainer['fileBaseName'];
  const fileHash = fileContainer['fileHash'];
  const idPrefix = `${fileHash}-${side}-`;

  const container = document.createElement('td');
  container.className = 'media-file';
  container.id = idPrefix + 'cell';

  const mediaInfoContainer = document.createElement('div');
  mediaInfoContainer.className = 'flex two';

  const previewContainer = document.createElement('div');
  previewContainer.className = 'half';

  const deleteBtn = document.createElement('button');
  deleteBtn.innerHTML = 'Delete <img src="icons/trash.svg" alt="trash can icon" class="svgrepro-icon"/>';
  deleteBtn.setAttribute('aria-label', "Delete this media file and caption");
  deleteBtn.setAttribute('data-tooltip', "Delete this media file and caption");
  deleteBtn.id = idPrefix + 'delete';
  deleteBtn.classList.add("error", "bordered");
  makeClickEvent(deleteBtn, deleteBtnFunction);

  const mediaBtnContainer = document.createElement('div');
  mediaBtnContainer.className = `half media-btn-container`;
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
  captionBox.dataset.rowIndex = rowIndex;
  captionBox.addEventListener('change', captionBoxChangeEventHandler);

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

  mediaInfoContainer.appendChild(previewContainer);
  mediaInfoContainer.appendChild(mediaBtnContainer);

  mediaBtnContainer.appendChild(captionBox);
  mediaBtnContainer.appendChild(buttons);

  return container;
}



async function renderMediaTable() {
  mediaTableBody.innerHTML = '';
  lastAutomatedCaptionTextChanges = {};

  // Fetch files from directories
  const twoDirs = await fileOps.readDirectories(leftDirectory, rightDirectory);
  const searchFilter = searchBox.value.toLowerCase();
  const newMatchedFiles = fileOps.matchLeftRightDirs(twoDirs, searchFilter)
  store.replaceMatchedFiles( newMatchedFiles );
  const matchedFiles = store.getMatchedFiles();
  const fileHashes = {};
  let rowIndex = 0;

  for (const fileBaseName in matchedFiles) {
    const row = document.createElement('tr');
    const fileHash = matchedFiles[fileBaseName]['fileHash'];
    fileHashes[fileHash] = fileBaseName;

    const rowNumberCell = document.createElement('td');
    rowNumberCell.textContent = rowIndex;
    row.appendChild(rowNumberCell);

    if ('leftmedia' in matchedFiles[fileBaseName]) {
      const side = 'left';
      const tdChild = createMediaComponent(matchedFiles[fileBaseName], side, rowIndex);
      const hasCompanion = ('rightmedia' in matchedFiles[fileBaseName]);

      if (!hasCompanion && rightDirectory) {
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
      const tdChild = createMediaComponent(matchedFiles[fileBaseName], side, rowIndex);
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
    rowIndex++;
  }

  store.replaceFileHashes(fileHashes)
}

function captionBoxChangeEventHandler(event) {
  const [textFileHash, textSide, textIdSuffix] = getIdHashParts(event.target.id);
  const textFile = getFileFromHashSide(textFileHash, textSide, true);
  const captionBox = event.target;
  
  if (captionBox.value !== textFile.caption) {
    if (! captionBox.classList.contains('dirty-caption')) {
      captionBox.classList.add('dirty-caption');
    }
  } else {
    captionBox.classList.remove('dirty-caption');
  }
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

  const matchedFiles = store.getMatchedFiles();
  const fileHashes = store.getFileHashes();

  for (const captionBox of dirtyCaptionBoxes) {
    const captionId = captionBox.id;
    const [fileHash, side, idSuffix] = getIdHashParts(captionId);
    // this matches the textbox file info much more efficiently than getFileFromHashSide()
  	const secondKey = side+'text';
    const fileBaseName = fileHashes[fileHash];

    if (!(secondKey in matchedFiles[fileBaseName])) {
      continue;
    }

    const textFile = matchedFiles[fileBaseName][secondKey];
    const textFilePath = textFile['path'];
    const captionText = captionBox.value;

    fileOps.writeTextFileContents(textFilePath, captionText, function() {
      captionBox.classList.remove('dirty-caption');
      textFile['caption'] = captionText;
    });
  }

  lastAutomatedCaptionTextChanges = {};
}

async function checkAllCaptionsUpdateDirtyState() {
  const captionBoxes = queryClass('caption-text');
  const matchedFiles = store.getMatchedFiles();
  const fileHashes = store.getFileHashes();
  let countOfDirtyCaptions = 0;

  for (const captionBox of captionBoxes) {
    const captionId = captionBox.id;
    const [fileHash, side, idSuffix] = getIdHashParts(captionId);
    // this matches the textbox file info much more efficiently than getFileFromHashSide()
  	const secondKey = side+'text';
    const fileBaseName = fileHashes[fileHash];

    if (!(secondKey in matchedFiles[fileBaseName])) {
      continue;
    }

    const textFile = matchedFiles[fileBaseName][secondKey];
    const captionText = captionBox.value;

    if (captionText !== textFile.caption) {
      if (! captionBox.classList.contains('dirty-caption')) {
        captionBox.classList.add('dirty-caption');
        countOfDirtyCaptions++;
      }
    } else {
      captionBox.classList.remove('dirty-caption');
    }
  }

  getElId('unsaved-message').textContent = countOfDirtyCaptions ? `Unsaved Captions: ${countOfDirtyCaptions}` : '';
}



let isDraggingSearchReplaceModal = false;
let offsetXSearchReplaceModal = 0, offsetYSearchReplaceModal = 0;


async function enableDraggableSearchReplaceModal() {
  const dialog = getElId('search-replace-modal-display');
  const header = getElId('search-replace-modal-header-wrapper');

  header.addEventListener('mousedown', (e) => {
      isDraggingSearchReplaceModal = true;
      // Calculate the offset from the mouse position to the dialog's top-left corner
      offsetXSearchReplaceModal = e.clientX - dialog.getBoundingClientRect().left;
      offsetYSearchReplaceModal = e.clientY - dialog.getBoundingClientRect().top;
      // Optional: Add a class for styling while dragging
      dialog.classList.add('dragging');
  });

  document.addEventListener('mousemove', (e) => {
      if (!isDraggingSearchReplaceModal) return;

      // Prevent default browser behavior (e.g., text selection)
      e.preventDefault();

      // Calculate new position relative to the viewport
      const newX = e.clientX - offsetXSearchReplaceModal;
      const newY = e.clientY - offsetYSearchReplaceModal;

      // Update the dialog's position
      dialog.style.left = `${newX}px`;
      dialog.style.top = `${newY}px`;
      
      // Remove the initial center transform to avoid conflict with top/left positioning
      dialog.style.transform = 'none'; 
  });

  document.addEventListener('mouseup', () => {
      isDraggingSearchReplaceModal = false;
      dialog.classList.remove('dragging');
  });
}


let lastAutomatedCaptionTextChanges = {}; // captionTextId: { previousCaption: '', newCaption: '' }
async function saveAutomatedCaptionChange(captionTextId, previousCaption, newCaption) {
  lastAutomatedCaptionTextChanges[captionTextId] = { previousCaption, newCaption };
}

// In this renderer script, we need to keep a short/last history of the last automated text caption changes, so that we can undo them when user click the menu. This is because the undo of automated actions is more likely to be used immediately after the action, and we want it to be fast. If we want to keep a long history of changes, then we can revert all of the caption text boxes back to the previous state.
// This function performs the undo of last automated action, which could be either AI captioning or bulk search and replace. When user click undo, the caption text boxes will be reverted to the previous state before the automated action, and the text files will NOT be updated.
async function undoLastAutomatedAction(captionTextId) {
  const lastAction = lastAutomatedCaptionTextChanges[captionTextId];
  if (!lastAction) return;

  const captionBox = getElId(captionTextId);
  if (!captionBox) return;

  captionBox.value = lastAction.previousCaption;
  delete lastAutomatedCaptionTextChanges[captionTextId];
}

async function makeAllLowercase(captionTextId) {
  const captionBox = getElId(captionTextId);
  if (!captionBox) return;

  const previousCaption = captionBox.value;
  const newCaption = previousCaption.toLowerCase();

  if (previousCaption === newCaption) {
    return; // no change, no need to save or mark as dirty
  }

  await saveAutomatedCaptionChange(captionTextId, previousCaption, newCaption);

  captionBox.value = newCaption;
}

async function removeDuplicateTags(captionTextId) {
  const captionBox = getElId(captionTextId);
  if (!captionBox) return;

  const previousCaption = captionBox.value;
  const words = previousCaption.split(/,\s*/);
  const uniqueWords = [...new Set(words)];
  const newCaption = uniqueWords.join(', ');

  if (previousCaption == newCaption) {
    return; // no change, no need to save or mark as dirty
  }

  await saveAutomatedCaptionChange(captionTextId, previousCaption, newCaption);

  captionBox.value = newCaption;
}

async function searchAndReplace(captionTextId, searchText, replaceText, isRegex=false, caseInsensitive=false) {
  const captionBox = getElId(captionTextId);
  if (!captionBox) return;

  const previousCaption = captionBox.value;
  let newText = previousCaption;

  if (isRegex) {
    const flags = caseInsensitive ? 'gi' : 'g';
    newText = newText.replace(new RegExp(searchText, flags), replaceText);
  } else {
    const searchFlags = caseInsensitive ? 'gi' : 'g';
    newText = newText.replace(new RegExp(escapeRegExp(searchText), searchFlags), replaceText);
  }

  const newCaption = newText;

  if (previousCaption === newCaption) {
    return; // no change, no need to save or mark as dirty
  }

  captionBox.value = newCaption;

  if (captionTextId !== 'test-search-replace-text') {
    await saveAutomatedCaptionChange(captionTextId, previousCaption, newCaption);
    captionBox.classList.add('dirty-caption');
  }
}

function escapeRegExp(string) {
  // $& means the whole matched string
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
}

function getAllCaptionTextIds() {
  const captionTextAreas = document.querySelectorAll('.caption-text');
  const captionTextIds = Array.from(captionTextAreas).map(textArea => textArea.id);
  return captionTextIds;
}

async function testSearchReplace() {
  const searchText = getElId('find-text').value;
  const replaceText = getElId('replace-text').value;
  const caseInsensitive = getElId('search-replace-case-insensitive').checked;
  const isRegex = getElId('search-replace-is-regex').checked;
  searchAndReplace('test-search-replace-text', searchText, replaceText, isRegex, caseInsensitive);
}

async function replaceAll() {
  lastAutomatedCaptionTextChanges = {};

  const searchText = getElId('find-text').value;
  const replaceText = getElId('replace-text').value;
  const caseInsensitive = getElId('search-replace-case-insensitive').checked;
  const isRegex = getElId('search-replace-is-regex').checked;
  const captionTextIds = getAllCaptionTextIds();
  const startRow = getElId('search-replace-start-row').value;
  const endRow = getElId('search-replace-end-row').value;
  const searchAndReplacePromises = [];

  if (!captionTextIds || captionTextIds.length === 0) return;

  for (const captionTextId of captionTextIds) {
    const captionBox = getElId(captionTextId);

    // checkVisibility is needed because some caption text areas might be hidden due to filtering, and we don't want to perform search and replace on those hidden ones. Also skip the test-search-replace-text which is used for testing and previewing the search and replace results.
    if (!captionBox || captionBox.id === 'test-search-replace-text' || !captionBox.checkVisibility()) {
      continue;
    }

    const rowIndex = parseInt(captionBox.dataset.rowIndex);
    if ((startRow && rowIndex < startRow) || (endRow && rowIndex > endRow)) {
      continue; // skip rows outside of the specified range
    }

    try {
      let searchPromise = searchAndReplace(captionTextId, searchText, replaceText, isRegex, caseInsensitive);
      searchAndReplacePromises.push(searchPromise);
    }
    catch (error) {
      console.error(`Error processing caption ${captionTextId}:`, error);
    }
  }

  await Promise.all(searchAndReplacePromises);
  checkAllCaptionsUpdateDirtyState();
}
