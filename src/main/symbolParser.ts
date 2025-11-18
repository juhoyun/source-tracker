import * as fs from 'fs';
import * as path from 'path';
import type { Symbol, SymbolIndex, BuildProgress } from '../shared/types';
import { SymbolDatabase } from './symbolDatabase';
import { BrowserWindow } from 'electron';

// Simple regex-based symbol parser for C/C++/Python
export class SymbolParser {
  private symbolIndex: SymbolIndex = {};
  private database: SymbolDatabase;
  private currentProjectPath: string = '';

  constructor() {
    this.database = new SymbolDatabase();
  }

  // C/C++ function pattern: return_type function_name(params)
  private cppFunctionPattern = /^\s*(?:(?:static|inline|extern|virtual|explicit)\s+)*(?:\w+(?:\s*\*|\s*&)?(?:\s*::\s*\w+)?)\s+(\w+)\s*\(/gm;
  
  // C/C++ class/struct pattern
  private cppClassPattern = /^\s*(?:class|struct)\s+(\w+)/gm;
  
  // C/C++ typedef pattern: typedef ... name;
  private cppTypedefPattern = /^\s*typedef\s+(.+?)\s+(\w+)\s*;/gm;
  
  // Python function pattern: def function_name(
  private pythonFunctionPattern = /^\s*def\s+(\w+)\s*\(/gm;
  
  // Python class pattern: class ClassName
  private pythonClassPattern = /^\s*class\s+(\w+)/gm;

  async parseFile(filePath: string, language: string): Promise<Symbol[]> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const symbols: Symbol[] = [];

    if (language === 'c' || language === 'cpp') {
      symbols.push(...this.parseCppSymbols(content, lines, filePath));
    } else if (language === 'python') {
      symbols.push(...this.parsePythonSymbols(content, lines, filePath));
    }

    // Add to index
    symbols.forEach(symbol => {
      if (!this.symbolIndex[symbol.name]) {
        this.symbolIndex[symbol.name] = [];
      }
      this.symbolIndex[symbol.name].push(symbol);
    });

    return symbols;
  }

  private parseCppSymbols(content: string, lines: string[], filePath: string): Symbol[] {
    const symbols: Symbol[] = [];

    // Parse functions
    let match;
    this.cppFunctionPattern.lastIndex = 0;
    while ((match = this.cppFunctionPattern.exec(content)) !== null) {
      const functionName = match[1];
      const position = this.getLineAndColumn(content, match.index, lines);
      
      symbols.push({
        name: functionName,
        kind: 'function',
        filePath,
        line: position.line,
        column: position.column,
      });
    }

    // Parse classes/structs
    this.cppClassPattern.lastIndex = 0;
    while ((match = this.cppClassPattern.exec(content)) !== null) {
      const className = match[1];
      const position = this.getLineAndColumn(content, match.index, lines);
      
      symbols.push({
        name: className,
        kind: 'class',
        filePath,
        line: position.line,
        column: position.column,
      });
    }

    // Parse typedefs
    this.cppTypedefPattern.lastIndex = 0;
    while ((match = this.cppTypedefPattern.exec(content)) !== null) {
      const typedefName = match[2];
      const typedefDef = match[1];
      const position = this.getLineAndColumn(content, match.index, lines);
      
      symbols.push({
        name: typedefName,
        kind: 'typedef',
        filePath,
        line: position.line,
        column: position.column,
        signature: `typedef ${typedefDef} ${typedefName};`,
      });
    }

    return symbols;
  }

  private parsePythonSymbols(content: string, lines: string[], filePath: string): Symbol[] {
    const symbols: Symbol[] = [];

    // Parse functions
    let match;
    this.pythonFunctionPattern.lastIndex = 0;
    while ((match = this.pythonFunctionPattern.exec(content)) !== null) {
      const functionName = match[1];
      const position = this.getLineAndColumn(content, match.index, lines);
      
      symbols.push({
        name: functionName,
        kind: 'function',
        filePath,
        line: position.line,
        column: position.column,
      });
    }

    // Parse classes
    this.pythonClassPattern.lastIndex = 0;
    while ((match = this.pythonClassPattern.exec(content)) !== null) {
      const className = match[1];
      const position = this.getLineAndColumn(content, match.index, lines);
      
      symbols.push({
        name: className,
        kind: 'class',
        filePath,
        line: position.line,
        column: position.column,
      });
    }

    return symbols;
  }

  private getLineAndColumn(content: string, index: number, lines: string[]): { line: number; column: number } {
    const beforeMatch = content.substring(0, index);
    const line = beforeMatch.split('\n').length;
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const column = index - lastNewline;
    
    return { line, column };
  }

  async indexDirectory(dirPath: string): Promise<void> {
    const files = await this.getAllSourceFiles(dirPath);
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      let language = 'plaintext';
      
      if (['.c', '.h'].includes(ext)) language = 'c';
      else if (['.cpp', '.cc', '.cxx', '.hpp'].includes(ext)) language = 'cpp';
      else if (ext === '.py') language = 'python';
      
      if (language !== 'plaintext') {
        await this.parseFile(file, language);
      }
    }
  }

  private async getAllSourceFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' || 
          entry.name === '__pycache__') {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...await this.getAllSourceFiles(fullPath));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.py'].includes(ext)) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  // Build symbol database with progress tracking
  async buildSymbolDatabase(dirPath: string, mainWindow: BrowserWindow | null): Promise<void> {
    this.currentProjectPath = dirPath;
    this.clearIndex();

    // Phase 1: Scanning files
    mainWindow?.webContents.send('build-progress', {
      phase: 'scanning',
      current: 0,
      total: 0,
    } as BuildProgress);

    const files = await this.getAllSourceFiles(dirPath);
    const totalFiles = files.length;

    // Phase 2: Parsing files
    const allSymbols: Symbol[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = path.extname(file).toLowerCase();
      let language = 'plaintext';
      
      if (['.c', '.h'].includes(ext)) language = 'c';
      else if (['.cpp', '.cc', '.cxx', '.hpp'].includes(ext)) language = 'cpp';
      else if (ext === '.py') language = 'python';
      
      if (language !== 'plaintext') {
        mainWindow?.webContents.send('build-progress', {
          phase: 'parsing',
          current: i + 1,
          total: totalFiles,
          currentFile: path.basename(file),
        } as BuildProgress);

        const symbols = await this.parseFile(file, language);
        allSymbols.push(...symbols);
      }
    }

    // Phase 3: Saving to database
    mainWindow?.webContents.send('build-progress', {
      phase: 'saving',
      current: 0,
      total: allSymbols.length,
    } as BuildProgress);

    const filtered = this.filterAndDeduplicateSymbols(allSymbols);

    // Persist filtered symbols to database
    await this.database.open(dirPath);
    this.database.saveSymbols(filtered, dirPath);
    this.database.close();

    // And also update in-memory index to the same filtered set
    this.symbolIndex = {};
    filtered.forEach(symbol => {
      if (!this.symbolIndex[symbol.name]) {
        this.symbolIndex[symbol.name] = [];
      }
      this.symbolIndex[symbol.name].push(symbol);
    });

    // Phase 4: Complete
    mainWindow?.webContents.send('build-progress', {
      phase: 'complete',
      current: allSymbols.length,
      total: allSymbols.length,
    } as BuildProgress);
  }

  // Load symbol database if exists
  async loadSymbolDatabase(dirPath: string): Promise<boolean> {
    if (this.database.exists(dirPath)) {
      this.currentProjectPath = dirPath;
      const symbolMap = await this.database.load(dirPath);
      
      // Convert Map to SymbolIndex
      this.symbolIndex = {};
      symbolMap.forEach((symbols: Symbol[], name: string) => {
        const filtered = this.filterAndDeduplicateSymbols(symbols);
        if (filtered.length > 0) {
          this.symbolIndex[name] = filtered;
        }
      });
      
      this.database.close();
      return true;
    }
    return false;
  }

  findDefinition(symbolName: string): Symbol[] {
    return this.symbolIndex[symbolName] || [];
  }

  clearIndex(): void {
    this.symbolIndex = {};
  }

  getIndex(): SymbolIndex {
    return this.symbolIndex;
  }

  private filterAndDeduplicateSymbols(symbols: Symbol[]): Symbol[] {
    const allowedKinds: Symbol['kind'][] = ['function', 'class', 'typedef', 'struct'];
    const invalidNames = new Set([
      'void', 'int', 'char', 'float', 'double', 'long', 'short', 'unsigned',
      'signed', 'bool', 'size_t', 'u8', 'u16', 'u32', 's8', 's16', 's32',
      'if', 'volatile', '__volatile__',
      'BCMPOST_TRAP_RODATA', 'BCMPOST_TRAP_TEXT', 'BCMPOSTTRAPFN', 'BCMRAMFN'
    ]);

    const map = new Map<string, Symbol>();

    for (const s of symbols) {
      if (!allowedKinds.includes(s.kind)) continue;
      if (invalidNames.has(s.name)) continue;

      // typedef / class / struct 는 같은 (name, kind, filePath) 안에서는
      // 선언 라인 하나만 남기고, 그중에서도 가장 앞에 나오는(가장 작은 line) 것만 유지한다.
      if (s.kind === 'typedef' || s.kind === 'class' || s.kind === 'struct') {
        const baseKey = `${s.name}|${s.kind}|${s.filePath}`;
        const existing = map.get(baseKey);
        if (!existing || s.line < existing.line) {
          map.set(baseKey, s);
        }
        continue;
      }

      const key = `${s.name}|${s.kind}|${s.filePath}|${s.line}|${s.column}`;
      if (!map.has(key)) {
        map.set(key, s);
      }
    }

    return Array.from(map.values());
  }
}
