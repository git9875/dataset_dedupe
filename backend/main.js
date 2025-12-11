const { ipcMain, app, BrowserWindow, Menu } = require('electron');
const fs = require('fs');
const { copyFile, readFileSync } = require('fs');
const path = require('path');
const { platform } = require('node:process');
const nodeConsole = require('console');
const myConsole = new nodeConsole.Console(process.stdout, process.stderr);
let configuration = {};

ipcMain.on('read-directories', (event, { leftDir, rightDir }) => {
  const getFiles = (dir) => {
    return fs.readdirSync(dir).map(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        size: stats.size,
        modified: stats.mtime
      };
    });
  };

  const leftFiles = getFiles(leftDir);
  const rightFiles = getFiles(rightDir);
  
  event.reply('directories-read', { leftFiles, rightFiles });
});

ipcMain.on('read-text-file-request', (event, filePath, captionId) => {
  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      myConsole.error("Error reading file:", err);
      event.reply('read-text-file-response '+captionId, { error: err.message });
      return;
    }
    event.reply('read-text-file-response '+captionId, { content: data });
  });
});

ipcMain.handle('save-text-file', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    const fStats = fs.statSync(filePath);

    const fileInfo = {
      name: path.basename(filePath),
      path: filePath,
      size: fStats.size,
      modified: fStats.mtime
    };
          
    return { success: true, message: 'File saved successfully!', newFile:fileInfo };
  } catch (error) {
    myConsole.error('Error saving file:', error);
    return { success: false, message: `Error saving file: ${error.message}` };
  }
});

ipcMain.on('copy-file', async (event, { sourceFile, destinationFile, channelId }) => {
  copyFile(sourceFile, destinationFile, (err) => {
      if (err) {
          myConsole.error('Error copying file asynchronously:', destinationFile, err);
          event.reply('copy-file-response '+channelId, { success: false, message: err.message });
      } else {
          myConsole.log('File copied asynchronously!', destinationFile);
          const fStats = fs.statSync(destinationFile);

          const fileInfo = {
            name: path.basename(destinationFile),
            path: destinationFile,
            size: fStats.size,
            modified: fStats.mtime
          };
          
          event.reply('copy-file-response '+channelId, { success: true, message: 'copied file: ' + sourceFile, newFile:fileInfo });
      }
  });
});

ipcMain.handle('delete-file', async (event, { filePath }) => {
  // Does not really delete file. Moves it to trash sub-directory.
  if (fs.existsSync(filePath)) {
    const directoryPath = path.dirname(filePath);
    const trashDirectory = path.join(directoryPath, 'trash');

    if (configuration.delete == 'trash') {
      createDirectoryIfNotExistsSync(trashDirectory);
    }

    const trashFilePath = path.join(trashDirectory, path.basename(filePath));

    try {
      if (configuration.delete == 'trash') {
        fs.copyFileSync(filePath, trashFilePath);
      }

      fs.unlinkSync(filePath);
      myConsole.info('File trashed successfully!', filePath);
      return { success: true, message: 'File trashed successfully!' };
    }
    catch (err) {
      myConsole.error('Error trashing file a:', err);
      return { success: false, message: err.message };
    }
  } else {
    myConsole.error('File does not exist, cannot delete:', filePath);
    return { success: false, message: `File does not exist: ${filePath}` };
  }
});

function createDirectoryIfNotExistsSync(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    try {
      fs.mkdirSync(directoryPath, { recursive: true });
      myConsole.log(`Directory created: ${directoryPath}`);
    } catch (error) {
      myConsole.error(`Error creating directory ${directoryPath}:`, error);
    }
  }
}

ipcMain.handle('rename-file', async (event, { filePath, newFileName }) => {
  if (fs.existsSync(filePath)) {
    try {
      const newFilePath = path.join(path.dirname(filePath), newFileName);
      fs.renameSync(filePath, newFilePath);
      myConsole.info('File renamed successfully!', filePath, newFileName);
      return { success: true, message: 'File renamed successfully!' };
    }
    catch (err) {
      myConsole.error('Error renaming file:', err);
      return { success: false, message: err.message };
    }
  } else {
    myConsole.error('File does not exist, cannot rename:', filePath);
    return { success: false, message: `File does not exist: ${filePath}` };
  }
});



function getConfig() {
  const commandLineArgs = process.argv.slice(2); // Remove 'electron' and 'main.js'
  const configPath = path.join(path.dirname(__dirname), 'app_config.json');
  const config = (fs.existsSync(configPath)) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};

  if (commandLineArgs.length >= 2) {
    config.leftDirectory = commandLineArgs[0];
    config.rightDirectory = commandLineArgs[1];
  }

  if (! ('delete' in config)) {
    config['delete'] = 'delete';
  }

  return config;
}


function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  // Send arguments to the renderer process after it's ready
  win.webContents.on('did-finish-load', () => {
    const configuration = getConfig();
    win.webContents.send('configuration', configuration);
  });

  const menuTemplate = [
    {
      label: 'Preferences',
      click: () => win.webContents.send("menu-clicked", "preferences")
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  win.setMenu(menu);

  win.loadFile('frontend/index.html');
  // win.webContents.openDevTools(); // uncomment to enable debugging
}


app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});