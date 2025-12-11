const { contextBridge, ipcRenderer } = require('electron');

window.MY_API = {
    onConfigured: (callback) => ipcRenderer.on('configuration', (event, configuration) => callback(configuration)),
    onMenuClicked: (callback) => ipcRenderer.on('menu-clicked', (event, menuItemClicked) => callback(menuItemClicked))
};
