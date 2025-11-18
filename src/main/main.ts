import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import { readFileContent, buildFileTree } from './fileSystem';
import { SymbolParser } from './symbolParser';

let mainWindow: BrowserWindow | null = null;
const symbolParser = new SymbolParser();
let currentProjectPath: string = '';

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (mainWindow) {
              const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory'],
              });
              
              if (!result.canceled && result.filePaths.length > 0) {
                const folderPath = result.filePaths[0];
                currentProjectPath = folderPath;
                console.log('Opening folder from menu:', folderPath);
                
                // Try to load existing database
                const loaded = await symbolParser.loadSymbolDatabase(folderPath);
                if (!loaded) {
                  // No database, do quick indexing
                  symbolParser.clearIndex();
                  await symbolParser.indexDirectory(folderPath);
                }
                
                const tree = await buildFileTree(folderPath);
                console.log('Sending folder-opened event with tree:', tree);
                mainWindow.webContents.send('folder-opened', tree);
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Build Symbol Data',
          accelerator: 'CmdOrCtrl+B',
          click: async () => {
            if (!currentProjectPath) {
              dialog.showMessageBox({
                type: 'warning',
                title: 'No Folder Opened',
                message: 'Please open a folder first before building symbol data.',
              });
              return;
            }
            
            await symbolParser.buildSymbolDatabase(currentProjectPath, mainWindow);
            
            dialog.showMessageBox({
              type: 'info',
              title: 'Build Complete',
              message: 'Symbol database has been built successfully!',
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About Source Code Viewer',
              message: 'Source Code Viewer',
              detail: 'Version 0.1.0\n\nA cross-platform source code viewer for C/C++/Python'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload path:', preloadPath);
  console.log('__dirname:', __dirname);
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
    frame: true,
    titleBarStyle: 'default',
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production: __dirname is dist/src/main, so go up to dist then to renderer
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const folderPath = result.filePaths[0];
  currentProjectPath = folderPath;
  
  // Try to load existing database
  const loaded = await symbolParser.loadSymbolDatabase(folderPath);
  if (!loaded) {
    // No database, do quick indexing
    symbolParser.clearIndex();
    await symbolParser.indexDirectory(folderPath);
  }
  
  return await buildFileTree(folderPath);
});

ipcMain.handle('read-file', async (event, filePath: string) => {
  return await readFileContent(filePath);
});

ipcMain.handle('get-file-tree', async (event, dirPath: string) => {
  return await buildFileTree(dirPath);
});

ipcMain.handle('find-definition', async (event, symbolName: string) => {
  return symbolParser.findDefinition(symbolName);
});

// Window controls
ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.close();
});
