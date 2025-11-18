import React from 'react';

interface CflagsModalProps {
  isOpen: boolean;
  defines: Record<string, string | null>;
  onClose: () => void;
}

function CflagsModal({ isOpen, defines, onClose }: CflagsModalProps) {
  if (!isOpen) return null;

  const entries = Object.entries(defines).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-[#252526] border border-[#3e3e42] rounded-lg p-4 w-[520px] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">CFLAGS (from rtecdc.opt / loaded file)</h2>
          <button
            className="text-sm text-[#cccccc] hover:text-white px-2 py-1 border border-[#3e3e42] rounded"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="border border-[#3e3e42] rounded overflow-hidden flex-1 flex flex-col bg-[#1e1e1e]">
          <div className="grid grid-cols-[1fr,1.2fr] text-xs bg-[#2d2d30] border-b border-[#3e3e42] px-2 py-1 font-semibold">
            <div>Name</div>
            <div>Value</div>
          </div>
          <div className="flex-1 overflow-auto text-xs">
            {entries.length === 0 && (
              <div className="px-2 py-2 text-[#858585]">No CFLAGS loaded.</div>
            )}

            {entries.map(([name, value]) => (
              <div
                key={name}
                className="grid grid-cols-[1fr,1.2fr] px-2 py-1 border-b border-[#2a2d2e] hover:bg-[#2d2d30]"
              >
                <div className="truncate font-mono text-[#dcdcdc]">{name}</div>
                <div className="truncate font-mono text-[#9e9e9e]">
                  {value === null ? '(no value)' : value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CflagsModal;
