interface ReportTabProps {
  reportText: string;
  onCopy: () => void;
  onDownload: () => void;
}

export function ReportTab({ reportText, onCopy, onDownload }: ReportTabProps) {
  if (!reportText) {
    return (
      <div className="text-center py-10 text-slate-400 dark:text-slate-500">
        Run a scenario or overtake plan, then generate report
      </div>
    );
  }
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button onClick={onCopy} className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 dark:bg-sky-600 dark:hover:bg-sky-500 text-white rounded text-sm">
          📋 Copy
        </button>
        <button onClick={onDownload} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded text-sm">
          💾 Download
        </button>
      </div>
      <pre
        className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded p-4 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap overflow-auto"
        style={{ maxHeight: "70vh" }}
      >
        {reportText}
      </pre>
    </div>
  );
}
