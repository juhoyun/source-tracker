import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import MenuBar from './components/MenuBar';
import StatusBar from './components/StatusBar';
import BuildProgressModal from './components/BuildProgressModal';
import SymbolList from './components/SymbolList';
import CflagsModal from './components/CflagsModal';
import type { FileNode, Symbol, SymbolIndex, BuildProgress } from '../shared/types';

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

function collectFilesFromTree(node: FileNode | null): string[] {
  if (!node) return [];

  const files: string[] = [];
  const stack: FileNode[] = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.isDirectory) {
      if (current.children) {
        for (const child of current.children) {
          stack.push(child);
        }
      }
    } else {
      files.push(current.path);
    }
  }

  return files;
}

function App() {
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [showBuildProgress, setShowBuildProgress] = useState<boolean>(false);
  const [buildProgress, setBuildProgress] = useState<BuildProgress | null>(null);
  const [goToLocation, setGoToLocation] = useState<Location | null>(null);
  const [navigationStack, setNavigationStack] = useState<Location[]>([]);
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [defines, setDefines] = useState<Record<string, string | null>>({});
  const [showCflagsModal, setShowCflagsModal] = useState(false);

  const refreshSymbols = async () => {
    try {
      const index: SymbolIndex = await (window as any).electronAPI.getSymbols();
      const allSymbols: Symbol[] = [];
      Object.values(index).forEach((arr) => {
        allSymbols.push(...arr);
      });
      setSymbols(allSymbols);
    } catch (e) {
      // ignore for now
    }
  };

  // Listen for folder opened from menu
  useEffect(() => {
    console.log('Setting up folder-opened listener');
    window.electronAPI.onFolderOpened((tree) => {
      console.log('Received folder-opened event:', tree);
      setFileTree(tree);
      setProjectFiles(collectFilesFromTree(tree));
      refreshSymbols();
      window.electronAPI.getDefines().then((d) => setDefines(d));
    });

    // Listen for build progress (single centralized listener)
    window.electronAPI.onBuildProgress((progress) => {
      setBuildProgress(progress);

      if (progress.phase !== 'complete') {
        setShowBuildProgress(true);
      } else {
        setTimeout(() => setShowBuildProgress(false), 1500);
        refreshSymbols();
      }
    });

    // Listen for explicit symbols-updated notifications
    (window as any).electronAPI.onSymbolsUpdated(() => {
      refreshSymbols();
    });

    // View Cflags from menu
    window.electronAPI.onViewCflags(() => {
      setShowCflagsModal(true);
    });

    // Defines updated from menu
    window.electronAPI.onDefinesUpdated(() => {
      window.electronAPI.getDefines().then((d: Record<string, string | null>) => setDefines(d));
    });
  }, []);

  const handleOpenFolder = async () => {
    const tree = await window.electronAPI.openFolder();
    if (tree) {
      setFileTree(tree);
      setProjectFiles(collectFilesFromTree(tree));
      refreshSymbols();
      const d = await window.electronAPI.getDefines();
      setDefines(d);
    }
  };

  const handleFileSelect = async (filePath: string) => {
    // Check if file is already open
    const existingIndex = openFiles.findIndex(f => f.path === filePath);
    if (existingIndex !== -1) {
      setActiveFileIndex(existingIndex);
      return;
    }

    // Read and open new file
    const fileContent = await window.electronAPI.readFile(filePath);
    setOpenFiles([...openFiles, fileContent]);
    setActiveFileIndex(openFiles.length);
  };

  const handleCloseFile = (index: number) => {
    const newOpenFiles = openFiles.filter((_, i) => i !== index);
    setOpenFiles(newOpenFiles);
    
    if (activeFileIndex === index) {
      setActiveFileIndex(Math.max(0, index - 1));
    } else if (activeFileIndex > index) {
      setActiveFileIndex(activeFileIndex - 1);
    }
  };

  const handleGoToDefinition = async (
    sourceFilePath: string,
    sourceLine: number,
    sourceColumn: number,
    targetFilePath: string,
    targetLine: number,
    targetColumn: number
  ) => {
    // Push source location onto navigation stack
    setNavigationStack(prev => [
      ...prev,
      { filePath: sourceFilePath, line: sourceLine, column: sourceColumn },
    ]);

    // Check if target file is already open
    const existingIndex = openFiles.findIndex(f => f.path === targetFilePath);
    let targetIndex = existingIndex;

    if (existingIndex !== -1) {
      setActiveFileIndex(existingIndex);
    } else {
      const fileContent = await window.electronAPI.readFile(targetFilePath);
      const newOpenFiles = [...openFiles, fileContent];
      setOpenFiles(newOpenFiles);
      targetIndex = newOpenFiles.length - 1;
      setActiveFileIndex(targetIndex);
    }

    setGoToLocation({ filePath: targetFilePath, line: targetLine, column: targetColumn });
  };

  const handleGoBack = async () => {
    if (navigationStack.length === 0) return;

    const lastIndex = navigationStack.length - 1;
    const previousLocation = navigationStack[lastIndex];
    setNavigationStack(prev => prev.slice(0, lastIndex));

    const existingIndex = openFiles.findIndex(f => f.path === previousLocation.filePath);

    if (existingIndex !== -1) {
      setActiveFileIndex(existingIndex);
    } else {
      const fileContent = await window.electronAPI.readFile(previousLocation.filePath);
      const newOpenFiles = [...openFiles, fileContent];
      setOpenFiles(newOpenFiles);
      setActiveFileIndex(newOpenFiles.length - 1);
    }

    setGoToLocation(previousLocation);
  };

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-white">
      <MenuBar 
        onOpenFolder={handleOpenFolder}
        onGoBack={handleGoBack}
        canGoBack={navigationStack.length > 0}
      />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          fileTree={fileTree} 
          onFileSelect={handleFileSelect}
        />
        
        <div className="flex flex-1 overflow-hidden">
          <Editor 
            openFiles={openFiles}
            activeFileIndex={activeFileIndex}
            onTabChange={setActiveFileIndex}
            onTabClose={handleCloseFile}
            activeFile={activeFile}
            onGoToDefinition={handleGoToDefinition}
            goToLocation={goToLocation}
            defines={defines}
          />

          <SymbolList
            symbols={symbols}
            projectFiles={projectFiles}
            onSymbolDoubleClick={async (symbol) => {
              // Record current location for back navigation
              if (activeFile) {
                const currentLocation: Location = goToLocation && goToLocation.filePath === activeFile.path
                  ? goToLocation
                  : { filePath: activeFile.path, line: 1, column: 1 };

                setNavigationStack(prev => [
                  ...prev,
                  currentLocation,
                ]);
              }

              const existingIndex = openFiles.findIndex(f => f.path === symbol.filePath);

              if (existingIndex !== -1) {
                setActiveFileIndex(existingIndex);
              } else {
                const fileContent = await window.electronAPI.readFile(symbol.filePath);
                const newOpenFiles = [...openFiles, fileContent];
                setOpenFiles(newOpenFiles);
                setActiveFileIndex(newOpenFiles.length - 1);
              }

              // Defer goToLocation update to ensure Editor has switched to the target file
              setTimeout(() => {
                setGoToLocation({
                  filePath: symbol.filePath,
                  line: symbol.line,
                  column: symbol.column,
                });
              }, 0);
            }}
            onFileDoubleClick={async (filePath: string) => {
              await handleFileSelect(filePath);
              setTimeout(() => {
                setGoToLocation({
                  filePath,
                  line: 1,
                  column: 1,
                });
              }, 0);
            }}
          />
        </div>
      </div>
      
      <StatusBar 
        activeFile={activeFile?.path}
        language={activeFile?.language}
      />

      <BuildProgressModal 
        isOpen={showBuildProgress}
        progress={buildProgress}
        onClose={() => setShowBuildProgress(false)}
      />

      <CflagsModal
        isOpen={showCflagsModal}
        defines={defines}
        onClose={() => setShowCflagsModal(false)}
      />
    </div>
  );
}

export default App;
