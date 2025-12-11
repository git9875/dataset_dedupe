const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { platform } = require('node:process');
const utils = require('./utils');




async function readDirectories(leftDir, rightDir) {
    // Fetch files from directories
    const twoDirectories = await new Promise((resolve) => {
        ipcRenderer.send('read-directories', { leftDir, rightDir });
        ipcRenderer.once('directories-read', (event, { leftFiles, rightFiles }) => {
        resolve([leftFiles, rightFiles]);
        });
    });
    return twoDirectories;
}

function getTextFileContents(filePath, captionId, cb) {
    ipcRenderer.send('read-text-file-request', filePath, captionId);
    ipcRenderer.once('read-text-file-response '+captionId, (event, response) => {
        if (response.error) {
            document.getElementById('fileContent').innerText = `Error: ${response.error}`;
        } else {
            cb(response.content);
        }
    });
}

async function writeTextFileContents(filePath, content, cb) {
    const result = await ipcRenderer.invoke('save-text-file', { filePath, content });
    if (result.success) {
        console.log(result.message);
        cb(result.newFile);
    } else {
        console.error(result.message);
    }
}

async function copyFile(sourceFile, destinationFile, cb) {
    const channelId = utils.simpleHash(destinationFile);
    ipcRenderer.send('copy-file', { sourceFile, destinationFile, channelId });
    ipcRenderer.once('copy-file-response ' + channelId, (event, response) => {
        if (response.success) {
            console.log(response.message);
            cb(response.newFile);
        } else {
            console.error(response.message);
        }
    });
}

async function deleteFile(filePath, cb) {
    const result = await ipcRenderer.invoke('delete-file', { filePath });
    if (result.success) {
        console.log(result.message);
        cb(result);
    } else {
        console.error(result.message);
    }
}

async function renameFile(filePath, newFileName, cb) {
    const result = await ipcRenderer.invoke('rename-file', { filePath, newFileName });
    if (result.success) {
        console.log(result.message);
        cb(result);
    } else {
        console.error(result.message);
    }
}




function getBaseName(filePath) {
    let baseName = path.basename(filePath);
    return baseName.substring(0, baseName.lastIndexOf('.'));
}

function getExtension(filePath) {
    return path.extname(filePath).replace('.', '');
}

function matchLeftRightDirs(twoDirs, searchBoxStr) {
    const leftFiles = twoDirs[0];
    const rightFiles = twoDirs[1];
    const matchedFiles = {};
    const leftFilesFilter = {};
    const rightFilesFilter = {};

    // filter on media base files, not txt
    for (const f of leftFiles) {
        const fileBaseName = getBaseName(f.name);
        const ext = getExtension(f.name).toLowerCase();

        if (!passesMediaFileNameFilter(fileBaseName, ext, searchBoxStr)) { continue; }
        leftFilesFilter[fileBaseName] = true;
    }
    for (const f of rightFiles) {
        const fileBaseName = getBaseName(f.name);
        const ext = getExtension(f.name).toLowerCase();

        if (!passesMediaFileNameFilter(fileBaseName, ext, searchBoxStr)) { continue; }
        rightFilesFilter[fileBaseName] = true;
    }


    for (const f of leftFiles) {
        const fileBaseName = getBaseName(f.name);
        const ext = getExtension(f.name).toLowerCase();
        // file has attributes:  modified (date object), name (base name), path, size

        if (!(fileBaseName in leftFilesFilter)) { continue; }

        if (! (fileBaseName in matchedFiles)) {
            matchedFiles[fileBaseName] = { 'fileBaseName':fileBaseName, 'fileHash': utils.simpleHash(fileBaseName) };
        }

        if (ext == 'txt') {
            matchedFiles[fileBaseName]['lefttext'] = f;
        }
        else if (ext == 'png' || ext == 'jpg' || ext == 'gif' || ext == 'mp4' || ext == 'mov') {
            matchedFiles[fileBaseName]['leftmedia'] = f;
        }
    }

    for (const f of rightFiles) {
        const fileBaseName = getBaseName(f.name);
        const ext = getExtension(f.name).toLowerCase();
        // file has attributes:  modified (date object), name (base name), path, size

        if (!(fileBaseName in rightFilesFilter)) { continue; }

        if (! (fileBaseName in matchedFiles)) {
            matchedFiles[fileBaseName] = { 'fileBaseName':fileBaseName, 'fileHash': utils.simpleHash(fileBaseName) };
        }

        if (ext == 'txt') {
            matchedFiles[fileBaseName]['righttext'] = f;
        }
        else if (ext == 'png' || ext == 'jpg' || ext == 'gif' || ext == 'mp4' || ext == 'mov') {
            matchedFiles[fileBaseName]['rightmedia'] = f;
        }
    }

    return matchedFiles;
}


function passesMediaFileNameFilter(fileBaseName, ext, searchBoxStr) {
    searchBoxStr = searchBoxStr.toLowerCase();
    fileBaseName = fileBaseName.toLowerCase();

    // specified an extension with .
    if (searchBoxStr.includes('.')) {
        const searchBoxTokens = searchBoxStr.split('.');
        searchBoxStr = searchBoxTokens[0];
        const extFilterStr = searchBoxTokens[1].replace('*', '');

        if (! ext.includes(extFilterStr)) { return false; }
    }
    else { // no extension specified, so filter on these media extension types
        const allowedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'mp4', 'mpg', 'mov'];
        if (! allowedExtensions.includes(ext)) { return false; }
    }

    if (searchBoxStr.includes('*')) {
        if (searchBoxStr.beginsWith('*') && searchBoxStr.endsWith('*')) {
            if (!fileBaseName.includes(searchBoxStr.replace('*', ''))) { return false; }
        }
        else if (searchBoxStr.beginsWith('*')) {
            if (!fileBaseName.endsWith(searchBoxStr.replace('*', ''))) { return false; }
        }
        else if (searchBoxStr.endsWith('*')) {
            if (!fileBaseName.beginsWith(searchBoxStr.replace('*', ''))) { return false; }
        }
    }
    else if (!fileBaseName.includes(searchBoxStr)) { return false; }

    return true;
}


module.exports = {
    readDirectories: readDirectories,
    getTextFileContents: getTextFileContents,
    writeTextFileContents: writeTextFileContents,
    copyFile: copyFile,
    deleteFile: deleteFile,
    renameFile: renameFile,
    getBaseName: getBaseName,
    getExtension: getExtension,
    matchLeftRightDirs: matchLeftRightDirs
};