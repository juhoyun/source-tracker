import type { BuildProgress } from '../../shared/types';

interface BuildProgressModalProps {
  isOpen: boolean;
  progress: BuildProgress | null;
  onClose: () => void;
}

function BuildProgressModal({ isOpen, progress, onClose }: BuildProgressModalProps) {
  if (!isOpen || !progress) return null;

  const getPhaseText = () => {
    switch (progress.phase) {
      case 'scanning':
        return 'Scanning files...';
      case 'parsing':
        return `Parsing files... (${progress.current}/${progress.total})`;
      case 'saving':
        return 'Saving to database...';
      case 'complete':
        return 'Complete!';
      default:
        return 'Processing...';
    }
  };

  const getProgressPercent = () => {
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-[#252526] border border-[#3e3e42] rounded-lg p-6 w-96">
        <h2 className="text-lg font-semibold mb-4">Building Symbol Database</h2>
        
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span>{getPhaseText()}</span>
            <span>{getProgressPercent()}%</span>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-[#3e3e42] rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${getProgressPercent()}%` }}
            />
          </div>
        </div>

        {progress.currentFile && (
          <div className="text-sm text-gray-400 truncate">
            {progress.currentFile}
          </div>
        )}

        {progress.phase === 'complete' && (
          <div className="mt-4 text-center text-green-400">
            ✓ Symbol database built successfully!
          </div>
        )}
      </div>
    </div>
  );
}

export default BuildProgressModal;
