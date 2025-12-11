const configurations = {};
const matchedFiles = {};
const fileHashes = {};

function replaceAllConfigurations(newConfigurations) {
    for (const key of Object.keys(configurations)) {
        delete configurations[key];
    }
    for (const [key, value] of Object.entries(newConfigurations)) {
        configurations[key] = value;
    }
}

function replaceMatchedFiles(newMatchedFiles) {
    for (const key of Object.keys(matchedFiles)) {
        delete matchedFiles[key];
    }
    for (const [key, value] of Object.entries(newMatchedFiles)) {
        matchedFiles[key] = value;
    }
}

function replaceFileHashes(newFileHashes) {
    for (const key of Object.keys(fileHashes)) {
        delete fileHashes[key];
    }
    for (const [key, value] of Object.entries(newFileHashes)) {
        fileHashes[key] = value;
    }
}

function getConfigurations() {
    return configurations;
}

function getMatchedFiles() {
    return matchedFiles;
}

function getFileHashes() {
    return fileHashes;
}


module.exports = {
    replaceAllConfigurations: replaceAllConfigurations,
    getConfigurations: getConfigurations,
    replaceMatchedFiles: replaceMatchedFiles,
    getMatchedFiles: getMatchedFiles,
    replaceFileHashes: replaceFileHashes,
    getFileHashes: getFileHashes
};
