// to create IDs for quick DOM references
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  hash = Math.abs(hash).toString();
  return hash;
}

function makeFileUrl(filePath) {
    return 'file:///' + filePath.replace('\\', '/');
}

function toggleClassVisibility(className, visible, displayStyle='initial') {
  const elements = document.getElementsByClassName(className);

  for (let i = 0; i < elements.length; i++) {
      elements[i].style.display = visible ? displayStyle : 'none';
  }
}

module.exports = {
    simpleHash: simpleHash,
    makeFileUrl: makeFileUrl,
    toggleClassVisibility: toggleClassVisibility
}
