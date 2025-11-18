import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import MenuBar from './components/MenuBar';
import StatusBar from './components/StatusBar';
import BuildProgressModal from './components/BuildProgressModal';
import type { FileNode } from '../shared/types';

interface OpenFile {
  path: string;
  content: string;
  language: string;
}

function App() {
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState<number>(-1);
  const [showBuildProgress, setShowBuildProgress] = useState<boolean>(false);

  // Listen for folder opened from menu
  useEffect(() => {
    console.log('Setting up folder-opened listener');
    window.electronAPI.onFolderOpened((tree) => {
      console.log('Received folder-opened event:', tree);
      setFileTree(tree);
    });

    // Listen for build progress
    window.electronAPI.onBuildProgress((progress) => {
      if (progress.phase === 'scanning') {
        setShowBuildProgress(true);
      } else if (progress.phase === 'complete') {
        setTimeout(() => setShowBuildProgress(false), 1500);
      }
    });
  }, []);

  const handleOpenFolder = async () => {
    const tree = await window.electronAPI.openFolder();
    if (tree) {
      setFileTree(tree);
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

  const handleGoToDefinition = async (filePath: string, line: number, column: number) => {
    // Check if file is already open
    const existingIndex = openFiles.findIndex(f => f.path === filePath);
    
    if (existingIndex !== -1) {
      // File is already open, just switch to it
      setActiveFileIndex(existingIndex);
    } else {
      // Open the file
      const fileContent = await window.electronAPI.readFile(filePath);
      setOpenFiles([...openFiles, fileContent]);
      setActiveFileIndex(openFiles.length);
    }
    
    // Note: Monaco Editor will need to scroll to the line/column
    // This will be handled by the Editor component
  };

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-white">
      <MenuBar onOpenFolder={handleOpenFolder} />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          fileTree={fileTree} 
          onFileSelect={handleFileSelect}
        />
        
        <Editor 
          openFiles={openFiles}
          activeFileIndex={activeFileIndex}
          onTabChange={setActiveFileIndex}
          onTabClose={handleCloseFile}
          activeFile={activeFile}
          onGoToDefinition={handleGoToDefinition}
        />
      </div>
      
      <StatusBar 
        activeFile={activeFile?.path}
        language={activeFile?.language}
      />

      <BuildProgressModal 
        isOpen={showBuildProgress}
        onClose={() => setShowBuildProgress(false)}
      />
    </div>
  );
}

export default App;
