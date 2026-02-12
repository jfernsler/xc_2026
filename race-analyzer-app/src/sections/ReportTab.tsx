interface ReportTabProps {
  reportText: string;
  onCopy: () => void;
  onDownload: () => void;
}

export function ReportTab({ reportText, onCopy, onDownload }: ReportTabProps) {
  if (!reportText) {
    return (
      <div className="text-center py-10 text-gray-500">
        Run a scenario or overtake plan, then generate report
      </div>
    );
  }
  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button onClick={onCopy} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-sm">
          📋 Copy
        </button>
        <button onClick={onDownload} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm">
          💾 Download
        </button>
      </div>
      <pre
        className="bg-gray-900 border border-gray-800 rounded p-4 text-xs text-gray-300 whitespace-pre-wrap overflow-auto"
        style={{ maxHeight: "70vh" }}
      >
        {reportText}
      </pre>
    </div>
  );
}
