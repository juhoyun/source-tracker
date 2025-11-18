interface StatusBarProps {
  activeFile?: string;
  language?: string;
}

function StatusBar({ activeFile, language }: StatusBarProps) {
  const getLanguageDisplay = (lang?: string) => {
    if (!lang) return '';
    
    const langMap: Record<string, string> = {
      'c': 'C',
      'cpp': 'C++',
      'python': 'Python',
    };
    
    return langMap[lang] || lang;
  };

  return (
    <div className="h-6 bg-[#007acc] text-white flex items-center px-4 text-xs">
      <div className="flex-1">
        {activeFile && (
          <span className="truncate">{activeFile}</span>
        )}
      </div>
      
      {language && (
        <div className="flex items-center gap-4">
          <span>{getLanguageDisplay(language)}</span>
        </div>
      )}
    </div>
  );
}

export default StatusBar;
