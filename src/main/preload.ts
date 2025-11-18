import { contextBridge, ipcRenderer } from 'electron';
import type { FileNode, FileContent, Symbol, SymbolIndex } from '../shared/types';

console.log('Preload script loaded');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // File operations
  openFolder: () => ipcRenderer.invoke('open-folder'),
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  getFileTree: (path: string) => ipcRenderer.invoke('get-file-tree', path),
  
  // Symbol operations
  findDefinition: (symbolName: string) => ipcRenderer.invoke('find-definition', symbolName),
  getSymbols: () => ipcRenderer.invoke('get-symbols'),
  getDefines: () => ipcRenderer.invoke('get-defines'),
  
  // Window operations
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // Event listeners
  onFolderOpened: (callback: (tree: FileNode) => void) => {
    ipcRenderer.removeAllListeners('folder-opened');
    ipcRenderer.on('folder-opened', (_event, tree) => callback(tree));
  },
  onBuildProgress: (callback: (progress: any) => void) => {
    ipcRenderer.removeAllListeners('build-progress');
    ipcRenderer.on('build-progress', (_event, progress) => callback(progress));
  },
  onSymbolsUpdated: (callback: () => void) => {
    ipcRenderer.removeAllListeners('symbols-updated');
    ipcRenderer.on('symbols-updated', () => callback());
  },
  onViewCflags: (callback: () => void) => {
    ipcRenderer.removeAllListeners('view-cflags');
    ipcRenderer.on('view-cflags', () => callback());
  },
  onDefinesUpdated: (callback: () => void) => {
    ipcRenderer.removeAllListeners('defines-updated');
    ipcRenderer.on('defines-updated', () => callback());
  },
});

// Type declarations for TypeScript
declare global {
  interface Window {
    electronAPI: {
      openFolder: () => Promise<FileNode | null>;
      readFile: (path: string) => Promise<FileContent>;
      getFileTree: (path: string) => Promise<FileNode>;
      findDefinition: (symbolName: string) => Promise<Symbol[]>;
      getSymbols: () => Promise<SymbolIndex>;
      getDefines: () => Promise<Record<string, string | null>>;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      onFolderOpened: (callback: (tree: FileNode) => void) => void;
      onBuildProgress: (callback: (progress: any) => void) => void;
      onSymbolsUpdated: (callback: () => void) => void;
      onViewCflags: (callback: () => void) => void;
      onDefinesUpdated: (callback: () => void) => void;
    };
  }
}
