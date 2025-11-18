import { contextBridge, ipcRenderer } from 'electron';
import type { FileNode, FileContent, Symbol } from '../shared/types';

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
});

// Type declarations for TypeScript
declare global {
  interface Window {
    electronAPI: {
      openFolder: () => Promise<FileNode | null>;
      readFile: (path: string) => Promise<FileContent>;
      getFileTree: (path: string) => Promise<FileNode>;
      findDefinition: (symbolName: string) => Promise<Symbol[]>;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      onFolderOpened: (callback: (tree: FileNode) => void) => void;
      onBuildProgress: (callback: (progress: any) => void) => void;
    };
  }
}
