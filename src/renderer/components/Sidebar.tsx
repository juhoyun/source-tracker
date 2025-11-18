import { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import type { FileNode } from '../../shared/types';

interface SidebarProps {
  fileTree: FileNode | null;
  onFileSelect: (path: string) => void;
}

interface FileTreeItemProps {
  node: FileNode;
  onFileSelect: (path: string) => void;
  level: number;
}

function FileTreeItem({ node, onFileSelect, level }: FileTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = () => {
    if (node.isDirectory) {
      setIsExpanded(!isExpanded);
    } else {
      onFileSelect(node.path);
    }
  };

  const paddingLeft = level * 12 + 8;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 hover:bg-[#2a2d2e] cursor-pointer text-sm"
        style={{ paddingLeft: `${paddingLeft}px` }}
        onClick={handleClick}
      >
        {node.isDirectory ? (
          <>
            {isExpanded ? (
              <ChevronDown size={16} className="flex-shrink-0" />
            ) : (
              <ChevronRight size={16} className="flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen size={16} className="flex-shrink-0 text-[#dcb67a]" />
            ) : (
              <Folder size={16} className="flex-shrink-0 text-[#dcb67a]" />
            )}
          </>
        ) : (
          <>
            <span className="w-4"></span>
            <File size={16} className="flex-shrink-0 text-[#519aba]" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>

      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map((child, index) => (
            <FileTreeItem
              key={`${child.path}-${index}`}
              node={child}
              onFileSelect={onFileSelect}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ fileTree, onFileSelect }: SidebarProps) {
  return (
    <div className="w-64 bg-[#252526] border-r border-[#3e3e42] overflow-y-auto">
      <div className="p-2 border-b border-[#3e3e42]">
        <h2 className="text-xs font-semibold uppercase text-[#cccccc]">Explorer</h2>
      </div>
      
      <div className="py-2">
        {fileTree ? (
          <FileTreeItem node={fileTree} onFileSelect={onFileSelect} level={0} />
        ) : (
          <div className="p-4 text-sm text-[#858585] text-center">
            No folder opened
          </div>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
