import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import type { Symbol } from '../shared/types';

export class SymbolDatabase {
  private db: SqlJsDatabase | null = null;
  private dbPath: string = '';
  private SQL: any = null;

  constructor() {}

  // 데이터베이스 파일 경로 생성
  private getDbPath(projectPath: string): string {
    return path.join(projectPath, '.sourceviewer.db');
  }

  // 데이터베이스 초기화
  async open(projectPath: string): Promise<void> {
    this.dbPath = this.getDbPath(projectPath);
    
    // sql.js 초기화
    if (!this.SQL) {
      this.SQL = await initSqlJs();
    }

    // 기존 DB 파일이 있으면 로드
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }
    
    if (!this.db) {
      throw new Error('Failed to initialize database');
    }
    
    // 테이블 생성
    this.db.run(`
      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        filePath TEXT NOT NULL,
        line INTEGER NOT NULL,
        column INTEGER NOT NULL,
        endLine INTEGER,
        endColumn INTEGER,
        signature TEXT,
        projectPath TEXT NOT NULL
      );
    `);
    
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_name ON symbols(name);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_kind ON symbols(kind);`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_file ON symbols(filePath);`);
  }

  // 데이터베이스 존재 확인
  exists(projectPath: string): boolean {
    const dbPath = this.getDbPath(projectPath);
    return fs.existsSync(dbPath);
  }

  // 데이터베이스 로드
  async load(projectPath: string): Promise<Map<string, Symbol[]>> {
    await this.open(projectPath);
    
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const symbolMap = new Map<string, Symbol[]>();
    const result = this.db.exec('SELECT * FROM symbols WHERE projectPath = ?', [projectPath]);

    if (result.length > 0) {
      const columns = result[0].columns;
      const values = result[0].values;

      for (const row of values) {
        const symbol: Symbol = {
          name: row[columns.indexOf('name')] as string,
          kind: row[columns.indexOf('kind')] as any,
          filePath: row[columns.indexOf('filePath')] as string,
          line: row[columns.indexOf('line')] as number,
          column: row[columns.indexOf('column')] as number,
          endLine: row[columns.indexOf('endLine')] as number | undefined,
          endColumn: row[columns.indexOf('endColumn')] as number | undefined,
          signature: row[columns.indexOf('signature')] as string | undefined,
        };

        if (!symbolMap.has(symbol.name)) {
          symbolMap.set(symbol.name, []);
        }
        symbolMap.get(symbol.name)!.push(symbol);
      }
    }

    return symbolMap;
  }

  // 심볼 저장 (배치 처리)
  saveSymbols(symbols: Symbol[], projectPath: string): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // 기존 데이터 삭제
    this.db.run('DELETE FROM symbols WHERE projectPath = ?', [projectPath]);

    // 배치 삽입
    for (const symbol of symbols) {
      this.db.run(`
        INSERT INTO symbols (name, kind, filePath, line, column, endLine, endColumn, signature, projectPath)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        symbol.name,
        symbol.kind,
        symbol.filePath,
        symbol.line,
        symbol.column,
        symbol.endLine || null,
        symbol.endColumn || null,
        symbol.signature || null,
        projectPath
      ]);
    }

    // 파일에 저장
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, data);
  }

  // 심볼 검색
  findSymbol(name: string): Symbol[] {
    if (!this.db) {
      return [];
    }

    const result = this.db.exec('SELECT * FROM symbols WHERE name = ?', [name]);
    
    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    const values = result[0].values;

    return values.map((row: any) => ({
      name: row[columns.indexOf('name')] as string,
      kind: row[columns.indexOf('kind')] as any,
      filePath: row[columns.indexOf('filePath')] as string,
      line: row[columns.indexOf('line')] as number,
      column: row[columns.indexOf('column')] as number,
      endLine: row[columns.indexOf('endLine')] as number | undefined,
      endColumn: row[columns.indexOf('endColumn')] as number | undefined,
      signature: row[columns.indexOf('signature')] as string | undefined,
    }));
  }

  // 통계 정보
  getStats(): { totalSymbols: number; byKind: Record<string, number> } {
    if (!this.db) {
      return { totalSymbols: 0, byKind: {} };
    }

    const totalResult = this.db.exec('SELECT COUNT(*) as count FROM symbols');
    const byKindResult = this.db.exec('SELECT kind, COUNT(*) as count FROM symbols GROUP BY kind');

    const total = totalResult.length > 0 ? totalResult[0].values[0][0] as number : 0;

    const byKindMap: Record<string, number> = {};
    if (byKindResult.length > 0) {
      const columns = byKindResult[0].columns;
      const values = byKindResult[0].values;
      
      for (const row of values) {
        const kind = row[columns.indexOf('kind')] as string;
        const count = row[columns.indexOf('count')] as number;
        byKindMap[kind] = count;
      }
    }

    return {
      totalSymbols: total,
      byKind: byKindMap,
    };
  }

  // 데이터베이스 닫기
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
