// Shared types between main and renderer processes

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  content: string;
  language: string;
}

export interface OpenFileRequest {
  path: string;
}

export interface OpenFolderRequest {
  path?: string;
}

export interface Symbol {
  name: string;
  kind: 'function' | 'class' | 'variable' | 'method' | 'struct' | 'enum' | 'typedef';
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  signature?: string;  // 함수 시그니처 또는 typedef 전체 정의
}

export interface SymbolIndex {
  [symbolName: string]: Symbol[];
}

export interface DefinitionRequest {
  symbolName: string;
  currentFilePath: string;
}

export interface BuildProgress {
  phase: 'scanning' | 'parsing' | 'saving' | 'complete';
  current: number;
  total: number;
  currentFile?: string;
}
