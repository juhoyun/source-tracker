import type { FileNode, FileContent, Symbol } from '../shared/types';

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

export {};
