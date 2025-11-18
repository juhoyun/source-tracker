import { X } from 'lucide-react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';

interface OpenFile {
  path: string;
  content: string;
  language: string;
}

interface Location {
  filePath: string;
  line: number;
  column: number;
}

interface EditorProps {
  openFiles: OpenFile[];
  activeFileIndex: number;
  onTabChange: (index: number) => void;
  onTabClose: (index: number) => void;
  activeFile: OpenFile | null;
  onGoToDefinition: (
    sourceFilePath: string,
    sourceLine: number,
    sourceColumn: number,
    targetFilePath: string,
    targetLine: number,
    targetColumn: number
  ) => void;
  goToLocation: Location | null;
  defines: Record<string, string | null>;
}

function Editor({ openFiles, activeFileIndex, onTabChange, onTabClose, activeFile, onGoToDefinition, goToLocation, defines }: EditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const definesRef = useRef<Record<string, string | null>>({});
  definesRef.current = defines;
  const ifdefDecorationsRef = useRef<string[]>([]);
  const monacoRef = useRef<typeof monaco | null>(null);
  const [foldInactive, setFoldInactive] = useState(false);
  const foldInactiveRef = useRef(false);
  foldInactiveRef.current = foldInactive;

  const getFileName = (path: string) => {
    return path.split(/[\\/]/).pop() || path;
  };

  const handleEditorDidMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance as typeof monaco;
    console.log('[EDITOR] mounted', {
      path: activeFile?.path,
      definesKeys: Object.keys(definesRef.current),
    });
    // Register Go to Definition provider
    editor.addAction({
      id: 'go-to-definition',
      label: 'Go to Definition',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: async (ed) => {
        const position = ed.getPosition();
        if (!position || !activeFile) return;

        const model = ed.getModel();
        if (!model) return;

        // Get word at cursor position
        const word = model.getWordAtPosition(position);
        if (!word) return;

        const symbolName = word.word;

        // Query backend for definition
        const definitions = await window.electronAPI.findDefinition(symbolName);

        if (definitions.length === 0) {
          // Show info message
          return;
        }

        // If multiple definitions, use the first one (can be enhanced later)
        const definition = definitions[0];
        
        // Navigate to definition (record source and target locations)
        onGoToDefinition(
          activeFile.path,
          position.lineNumber,
          position.column,
          definition.filePath,
          definition.line,
          definition.column
        );
      },
    });

    // Also handle Alt/Option + Click for Go to Definition
    editor.onMouseDown((e) => {
      if (e.event.altKey && e.target.position && activeFile) {
        const model = editor.getModel();
        if (!model) return;

        const word = model.getWordAtPosition(e.target.position);
        if (!word) return;

        const sourcePosition = e.target.position;

        window.electronAPI.findDefinition(word.word).then((definitions) => {
          if (definitions.length > 0) {
            const definition = definitions[0];
            onGoToDefinition(
              activeFile.path,
              sourcePosition.lineNumber,
              sourcePosition.column,
              definition.filePath,
              definition.line,
              definition.column
            );
          }
        });
      }
    });

    // Hover: show macro definition info for #if/#ifdef/#ifndef lines
    monacoInstance.languages.registerHoverProvider(['c', 'cpp', 'plaintext'], {
      provideHover(model, position) {
        const lineContent = model.getLineContent(position.lineNumber);
        const trimmed = lineContent.trimStart();

        if (!trimmed.startsWith('#')) return null;
        if (!/^#\s*(if|ifdef|ifndef)/.test(trimmed)) return null;

        const word = model.getWordAtPosition(position);
        if (!word) return null;

        const name = word.word;
        if (!name) return null;

        const defines = definesRef.current;
        const hasKey = Object.prototype.hasOwnProperty.call(defines, name);
        const value = hasKey ? defines[name] : null;

        let status: string;
        if (hasKey) {
          if (value === null) {
            status = `**${name}** is **defined** (no explicit value)`;
          } else {
            status = `**${name}** is **defined** with value \
\`${value}\``;
          }
        } else {
          status = `**${name}** is **NOT defined** in rtecdc.opt [CFLAGS_sort]`;
        }

        return {
          range: new monacoInstance.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn,
          ),
          contents: [
            { value: status },
          ],
        };
      },
    });

    // Initial ifdef decorations
    updateIfdefDecorations(
      editor,
      monacoInstance as typeof monaco,
      definesRef.current,
      ifdefDecorationsRef,
      foldInactiveRef.current,
    );
  };

  const updateIfdefDecorations = (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoNs: typeof monaco,
    definesMap: Record<string, string | null>,
    decoRef: React.MutableRefObject<string[]>,
    foldInactiveBlocks: boolean,
  ) => {
    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const isDefined = (name: string) => Object.prototype.hasOwnProperty.call(definesMap, name);

    console.log('[ifdef] updateIfdefDecorations START', {
      definesKeys: Object.keys(definesMap),
      lineCount,
      foldInactiveBlocks,
    });

    // Block-based approach: find all ifdef blocks and mark entire ranges as active/inactive
    interface Block {
      startLine: number; // line of #ifdef/#ifndef/#if
      endLine: number;   // line of #endif
      isActive: boolean; // whether this block is active
      contentStart: number; // first line of content (startLine + 1)
      contentEnd: number;   // last line of content (endLine - 1)
    }

    const blocks: Block[] = [];
    const stack: Array<{ startLine: number; isActive: boolean }> = [];

    // First pass: identify all blocks
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      const lineContent = model.getLineContent(lineNumber);
      const trimmed = lineContent.trimStart();

      // Debug: log all lines starting with #
      if (trimmed.startsWith('#')) {
        if (trimmed.includes('endif')) {
          console.log('[ifdef] found endif line', { lineNumber, trimmed, stackDepth: stack.length });
        }
      }

      if (/^#\s*endif\b/.test(trimmed)) {
        if (stack.length > 0) {
          const block = stack.pop()!;
          blocks.push({
            startLine: block.startLine,
            endLine: lineNumber,
            isActive: block.isActive,
            contentStart: block.startLine + 1,
            contentEnd: lineNumber - 1,
          });
          console.log('[ifdef] block closed', {
            startLine: block.startLine,
            endLine: lineNumber,
            isActive: block.isActive,
          });
        } else {
          console.log('[ifdef] endif but stack empty!', { lineNumber, trimmed });
        }
        continue;
      }

      if (/^#\s*else\b/.test(trimmed)) {
        // For simplicity, treat #else as ending current block and starting inverted one
        if (stack.length > 0) {
          const prev = stack.pop()!;
          // Close previous branch
          blocks.push({
            startLine: prev.startLine,
            endLine: lineNumber - 1,
            isActive: prev.isActive,
            contentStart: prev.startLine + 1,
            contentEnd: lineNumber - 1,
          });
          // Start else branch with inverted condition
          stack.push({
            startLine: lineNumber,
            isActive: !prev.isActive,
          });
          console.log('[ifdef] #else branch', { lineNumber, newActive: !prev.isActive });
        }
        continue;
      }

      if (/^#\s*if\b/.test(trimmed) || /^#\s*ifdef\b/.test(trimmed) || /^#\s*ifndef\b/.test(trimmed)) {
        // Determine if parent context is active
        const parentActive = stack.length === 0 || stack.every(s => s.isActive);
        let cond = true;

        // #ifdef NAME
        let m = trimmed.match(/^#\s*ifdef\b\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (m) {
          cond = isDefined(m[1]);
        } else {
          // #ifndef NAME
          m = trimmed.match(/^#\s*ifndef\b\s+([A-Za-z_][A-Za-z0-9_]*)/);
          if (m) {
            cond = !isDefined(m[1]);
          } else {
            // #if defined(NAME) or #if !defined(NAME)
            m = trimmed.match(/^#\s*if\b\s+defined\s*\(?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)?/);
            if (m) {
              cond = isDefined(m[1]);
            } else {
              m = trimmed.match(/^#\s*if\b\s+!defined\s*\(?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)?/);
              if (m) {
                cond = !isDefined(m[1]);
              } else {
                // Fallback: assume active
                cond = true;
              }
            }
          }
        }

        const isActive = parentActive && cond;
        stack.push({ startLine: lineNumber, isActive });
        console.log('[ifdef] block opened', {
          lineNumber,
          trimmed,
          cond,
          parentActive,
          isActive,
        });
      }
    }

    console.log('[ifdef] First pass complete. Total blocks found:', blocks.length);
    console.log('[ifdef] All blocks:', blocks);

    // Second pass: mark all lines in inactive blocks
    const inactiveLines: boolean[] = new Array(lineCount + 1).fill(false);
    for (const block of blocks) {
      if (!block.isActive && block.contentStart <= block.contentEnd) {
        for (let line = block.contentStart; line <= block.contentEnd; line++) {
          inactiveLines[line] = true;
        }
        console.log('[ifdef] marking block inactive', {
          contentStart: block.contentStart,
          contentEnd: block.contentEnd,
        });
      }
    }

    // Create decorations for all inactive lines
    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    for (let line = 1; line <= lineCount; line++) {
      if (inactiveLines[line]) {
        decorations.push({
          range: new monacoNs.Range(line, 1, line, model.getLineMaxColumn(line)),
          options: {
            isWholeLine: true,
            inlineClassName: 'inactive-ifdef-text',
            className: 'inactive-ifdef-line',
            linesDecorationsClassName: 'inactive-ifdef-gutter',
            marginClassName: 'inactive-ifdef-margin',
          },
        });
      }
    }

    console.log('[ifdef] Second pass complete. Total inactive lines:', decorations.length);
    console.log('[ifdef] Sample inactive lines:', Array.from({length: Math.min(10, decorations.length)}, (_, i) => decorations[i]));
    decoRef.current = editor.deltaDecorations(decoRef.current, decorations);

    // Optionally fold inactive blocks
    if (!foldInactiveBlocks) {
      (editor as any).setHiddenAreas?.([]);
      return;
    }

    const hiddenRanges: monaco.IRange[] = [];
    let start: number | null = null;
    for (let line = 1; line <= lineCount; line++) {
      if (inactiveLines[line]) {
        if (start === null) start = line;
      } else if (start !== null) {
        const end = line - 1;
        hiddenRanges.push(
          new monacoNs.Range(start, 1, end, model.getLineMaxColumn(end)),
        );
        start = null;
      }
    }
    if (start !== null) {
      const end = lineCount;
      hiddenRanges.push(
        new monacoNs.Range(start, 1, end, model.getLineMaxColumn(end)),
      );
    }

    console.log('[ifdef] Folding complete. Hidden ranges:', hiddenRanges.length);
    console.log('[ifdef] Sample hidden ranges:', hiddenRanges.slice(0, 5));
    (editor as any).setHiddenAreas?.(hiddenRanges);
  };

  useEffect(() => {
    if (!editorRef.current || !goToLocation || !activeFile) return;
    if (goToLocation.filePath !== activeFile.path) return;

    const { line, column } = goToLocation;

    editorRef.current.revealPositionInCenter({
      lineNumber: line,
      column,
    });

    const model = editorRef.current.getModel();
    if (!model) return;

    const word = model.getWordAtPosition({ lineNumber: line, column });

    const startColumn = word ? word.startColumn : column;
    const endColumn = word ? word.endColumn : column;

    editorRef.current.setSelection({
      startLineNumber: line,
      startColumn,
      endLineNumber: line,
      endColumn,
    });
  }, [goToLocation, activeFile]);

  // Recompute ifdef decorations when defines or active file changes
  useEffect(() => {
    if (!editorRef.current || !activeFile || !monacoRef.current) return;
    updateIfdefDecorations(
      editorRef.current,
      monacoRef.current,
      definesRef.current,
      ifdefDecorationsRef,
      foldInactiveRef.current,
    );
  }, [defines, activeFile]);

  return (
    <div className="flex-1 flex flex-col bg-[#1e1e1e]">
      {/* Tabs */}
      {openFiles.length > 0 && (
        <div className="flex bg-[#2d2d30] border-b border-[#3e3e42] overflow-x-auto">
          {openFiles.map((file, index) => (
            <div
              key={file.path}
              className={`
                flex items-center gap-2 px-4 py-2 border-r border-[#3e3e42] cursor-pointer
                ${index === activeFileIndex ? 'bg-[#1e1e1e] text-white' : 'bg-[#2d2d30] text-[#969696] hover:bg-[#1e1e1e]'}
              `}
              onClick={() => onTabChange(index)}
            >
              <span className="text-sm">{getFileName(file.path)}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(index);
                }}
                className="hover:bg-[#3e3e42] rounded p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-end items-center px-2 py-1 text-xs text-[#cccccc] bg-[#252526] border-b border-[#3e3e42]">
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-[#007acc]"
              checked={foldInactive}
              onChange={(e) => {
                setFoldInactive(e.target.checked);
                foldInactiveRef.current = e.target.checked;
                if (editorRef.current && monacoRef.current) {
                  updateIfdefDecorations(
                    editorRef.current,
                    monacoRef.current,
                    definesRef.current,
                    ifdefDecorationsRef,
                    foldInactiveRef.current,
                  );
                }
              }}
            />
            <span>Fold inactive #if blocks</span>
          </label>
        </div>
        <div className="flex-1">
          {activeFile ? (
            <MonacoEditor
              height="100%"
              language={activeFile.language}
              value={activeFile.content}
              theme="vs-dark"
              onMount={handleEditorDidMount}
              options={{
                readOnly: true,
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[#858585]">
              <div className="text-center">
                <p className="text-lg mb-2">No file opened</p>
                <p className="text-sm">Open a folder and select a file to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Editor;
