import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { readFileContent, buildFileTree } from './fileSystem';
import { SymbolParser } from './symbolParser';

let mainWindow: BrowserWindow | null = null;
const symbolParser = new SymbolParser();
let currentProjectPath: string = '';
let currentDefines: Record<string, string | null> = {};

function loadDefinesFromFile(filePath: string): void {
  currentDefines = {};

  if (!fs.existsSync(filePath)) {
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);

    let inCflagsSort = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('[') && line.endsWith(']')) {
        // Block header
        inCflagsSort = line === '[CFLAGS_sort]';
        continue;
      }

      if (!inCflagsSort) continue;

      // Inside [CFLAGS_sort] block: extract -D options
      const match = line.match(/^-D([^\s=]+)(?:=(.+))?$/);
      if (!match) continue;

      const name = match[1];
      const value = match[2] !== undefined ? match[2] : null;
      currentDefines[name] = value;
    }
  } catch (err) {
    console.error('Failed to read defines file:', err);
    currentDefines = {};
  }
}

function loadDefinesFromRtecdcOpt(projectPath: string): void {
  const optPath = path.join(projectPath, 'rtecdc.opt');
  loadDefinesFromFile(optPath);
}

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
                loadDefinesFromRtecdcOpt(folderPath);
                
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
            
            // Explicitly notify renderer that a build has started
            mainWindow?.webContents.send('build-progress', {
              phase: 'scanning',
              current: 0,
              total: 0,
            });

            await symbolParser.buildSymbolDatabase(currentProjectPath, mainWindow);
            
            // Ensure a final complete event is sent
            mainWindow?.webContents.send('build-progress', {
              phase: 'complete',
              current: 0,
              total: 0,
            });
            
            dialog.showMessageBox({
              type: 'info',
              title: 'Build Complete',
              message: 'Symbol database has been built successfully!',
            });

            // Notify renderer that symbols have been updated
            mainWindow?.webContents.send('symbols-updated');
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
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'View Cflags',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('view-cflags');
            }
          },
        },
        {
          label: 'Load Cflags',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
            });

            if (result.canceled || result.filePaths.length === 0) {
              return;
            }

            const filePath = result.filePaths[0];
            loadDefinesFromFile(filePath);
            mainWindow.webContents.send('defines-updated');
          },
        },
      ],
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
  loadDefinesFromRtecdcOpt(folderPath);
  
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

ipcMain.handle('get-symbols', async () => {
  return symbolParser.getIndex();
});

ipcMain.handle('get-defines', async () => {
  return currentDefines;
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
