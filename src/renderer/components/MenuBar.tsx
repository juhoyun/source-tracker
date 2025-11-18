import { FolderOpen } from 'lucide-react';

interface MenuBarProps {
  onOpenFolder: () => void;
}

function MenuBar({ onOpenFolder }: MenuBarProps) {
  return (
    <div className="h-12 bg-[#2d2d30] border-b border-[#3e3e42] flex items-center px-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenFolder}
          className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-[#3e3e42] transition-colors"
          title="Open Folder"
        >
          <FolderOpen size={18} />
          <span className="text-sm">Open Folder</span>
        </button>
      </div>
      
      <div className="flex-1 text-center">
        <h1 className="text-sm font-semibold">Source Code Viewer</h1>
      </div>
      
      <div className="w-32"></div> {/* Spacer for centering */}
    </div>
  );
}

export default MenuBar;
