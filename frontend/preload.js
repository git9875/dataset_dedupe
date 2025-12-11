const { contextBridge, ipcRenderer } = require('electron');

// // requires context isolation, booooo!
// contextBridge.exposeInMainWorld('electronAPI', {
//   onCommandLineArgs: (callback) => ipcRenderer.on('command-line-args', (event, args) => callback(args)),
// });

window.MY_API = {
    onConfigured: (callback) => ipcRenderer.on('configuration', (event, configuration) => callback(configuration)),
    onMenuClicked: (callback) => ipcRenderer.on('menu-clicked', (event, menuItemClicked) => callback(menuItemClicked))
};
