import { X } from 'lucide-react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';

interface OpenFile {
  path: string;
  content: string;
  language: string;
}

interface EditorProps {
  openFiles: OpenFile[];
  activeFileIndex: number;
  onTabChange: (index: number) => void;
  onTabClose: (index: number) => void;
  activeFile: OpenFile | null;
  onGoToDefinition: (filePath: string, line: number, column: number) => void;
}

function Editor({ openFiles, activeFileIndex, onTabChange, onTabClose, activeFile, onGoToDefinition }: EditorProps) {
  const getFileName = (path: string) => {
    return path.split(/[\\/]/).pop() || path;
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
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
        
        // Navigate to definition
        onGoToDefinition(definition.filePath, definition.line, definition.column);
      },
    });

    // Also handle Ctrl+Click (Cmd+Click on Mac)
    editor.onMouseDown((e) => {
      if ((e.event.ctrlKey || e.event.metaKey) && e.target.position) {
        const model = editor.getModel();
        if (!model) return;

        const word = model.getWordAtPosition(e.target.position);
        if (!word) return;

        window.electronAPI.findDefinition(word.word).then((definitions) => {
          if (definitions.length > 0) {
            const definition = definitions[0];
            onGoToDefinition(definition.filePath, definition.line, definition.column);
          }
        });
      }
    });
  };

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
  );
}

export default Editor;
