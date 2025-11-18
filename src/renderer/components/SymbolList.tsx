import { useEffect, useMemo, useState } from 'react';
import type { Symbol } from '../../shared/types';

interface SymbolListProps {
  symbols: Symbol[];
  projectFiles: string[];
  onSymbolDoubleClick: (symbol: Symbol) => void;
  onFileDoubleClick?: (filePath: string) => void;
}

type SymbolListMode = 'symbol' | 'file';

function SymbolList({ symbols, projectFiles, onSymbolDoubleClick, onFileDoubleClick }: SymbolListProps) {
  const [mode, setMode] = useState<SymbolListMode>('symbol');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(1000);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
    }, 150);

    return () => clearTimeout(id);
  }, [searchInput]);

  // Reset visible count when the data set, search term, or mode changes
  useEffect(() => {
    setVisibleCount(1000);
  }, [symbols, projectFiles, search, mode]);

  const filteredSymbols = useMemo(() => {
    if (mode !== 'symbol') return symbols;
    const term = search.trim().toLowerCase();
    if (!term) return symbols;
    return symbols.filter((s) =>
      s.name.toLowerCase().includes(term) ||
      s.filePath.toLowerCase().includes(term)
    );
  }, [symbols, search, mode]);

  const filteredFiles = useMemo(() => {
    if (mode !== 'file') return projectFiles;
    const term = search.trim().toLowerCase();
    if (!term) return projectFiles;
    return projectFiles.filter((filePath) =>
      filePath.toLowerCase().includes(term)
    );
  }, [projectFiles, search, mode]);

  const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    const target = e.currentTarget;
    const threshold = 50; // px from bottom
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - threshold) {
      setVisibleCount((prev) => {
        const next = prev + 1000;
        const total = mode === 'symbol' ? filteredSymbols.length : filteredFiles.length;
        return next > total ? total : next;
      });
    }
  };

  return (
    <div className="w-72 border-l border-[#3e3e42] bg-[#252526] flex flex-col">
      <div className="border-b border-[#3e3e42]">
        <div className="flex text-xs">
          <button
            className={`flex-1 px-2 py-1 border-b-2 ${
              mode === 'symbol'
                ? 'border-[#007acc] text-white'
                : 'border-transparent text-[#9e9e9e] hover:text-[#cccccc]'
            }`}
            onClick={() => setMode('symbol')}
          >
            Symbols
          </button>
          <button
            className={`flex-1 px-2 py-1 border-b-2 ${
              mode === 'file'
                ? 'border-[#007acc] text-white'
                : 'border-transparent text-[#9e9e9e] hover:text-[#cccccc]'
            }`}
            onClick={() => setMode('file')}
          >
            Files
          </button>
        </div>
        <div className="p-2 border-t border-[#3e3e42]">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={mode === 'symbol' ? 'Search symbols...' : 'Search files...'}
            className="w-full px-2 py-1 text-sm rounded bg-[#1e1e1e] border border-[#3e3e42] focus:outline-none focus:border-[#007acc]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto text-xs" onScroll={handleScroll}>
        {mode === 'symbol' && (
          <>
            {filteredSymbols.slice(0, visibleCount).map((symbol, index) => (
              <div
                key={`${symbol.filePath}:${symbol.line}:${symbol.column}:${index}`}
                className="px-2 py-1 cursor-default hover:bg-[#3e3e42] flex flex-col gap-0.5"
                onDoubleClick={() => onSymbolDoubleClick(symbol)}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-semibold truncate">{symbol.name}</span>
                  <span className="text-[10px] text-[#9e9e9e] uppercase">{symbol.kind}</span>
                </div>
                <div className="text-[10px] text-[#9e9e9e] truncate">
                  {symbol.filePath} : {symbol.line}
                </div>
              </div>
            ))}

            {filteredSymbols.length === 0 && (
              <div className="p-2 text-[#858585] text-xs">No symbols found</div>
            )}
            {filteredSymbols.length > visibleCount && (
              <div className="p-2 text-[#858585] text-[10px]">Scroll to load more (showing {visibleCount} of {filteredSymbols.length})</div>
            )}
          </>
        )}

        {mode === 'file' && (
          <>
            {filteredFiles.slice(0, visibleCount).map((filePath, index) => {
              const parts = filePath.split(/[/\\]/);
              const fileName = parts[parts.length - 1] || filePath;
              return (
                <div
                  key={`${filePath}:${index}`}
                  className="px-2 py-1 cursor-default hover:bg-[#3e3e42] flex flex-col gap-0.5"
                  onDoubleClick={() => onFileDoubleClick && onFileDoubleClick(filePath)}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold truncate">{fileName}</span>
                  </div>
                  <div className="text-[10px] text-[#9e9e9e] truncate">{filePath}</div>
                </div>
              );
            })}

            {filteredFiles.length === 0 && (
              <div className="p-2 text-[#858585] text-xs">No files found</div>
            )}
            {filteredFiles.length > visibleCount && (
              <div className="p-2 text-[#858585] text-[10px]">Scroll to load more (showing {visibleCount} of {filteredFiles.length})</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SymbolList;
