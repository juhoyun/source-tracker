import * as fs from 'fs';
import * as path from 'path';
import type { FileNode, FileContent } from '../shared/types';

// Supported file extensions
const SUPPORTED_EXTENSIONS = ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.py'];

export function isSupportedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

export function getLanguageFromExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  if (['.c', '.h'].includes(ext)) return 'c';
  if (['.cpp', '.cc', '.cxx', '.hpp'].includes(ext)) return 'cpp';
  if (ext === '.py') return 'python';
  
  return 'plaintext';
}

export async function readFileContent(filePath: string): Promise<FileContent> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const language = getLanguageFromExtension(filePath);
    
    return {
      path: filePath,
      content,
      language,
    };
  } catch (error) {
    throw new Error(`Failed to read file: ${error}`);
  }
}

export async function buildFileTree(dirPath: string): Promise<FileNode> {
  const stats = await fs.promises.stat(dirPath);
  const name = path.basename(dirPath);
  
  if (!stats.isDirectory()) {
    return {
      name,
      path: dirPath,
      isDirectory: false,
    };
  }
  
  const children: FileNode[] = [];
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    // Skip hidden files and common directories to ignore
    if (entry.name.startsWith('.') || 
        entry.name === 'node_modules' || 
        entry.name === '__pycache__' ||
        entry.name === 'build' ||
        entry.name === 'dist') {
      continue;
    }
    
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively build tree for directories
      const childNode = await buildFileTree(fullPath);
      children.push(childNode);
    } else if (isSupportedFile(entry.name)) {
      // Only include supported files
      children.push({
        name: entry.name,
        path: fullPath,
        isDirectory: false,
      });
    }
  }
  
  // Sort: directories first, then files, both alphabetically
  children.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return {
    name,
    path: dirPath,
    isDirectory: true,
    children,
  };
}
