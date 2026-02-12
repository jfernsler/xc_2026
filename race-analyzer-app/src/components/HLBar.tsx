interface HLBarProps {
  hl: string | null;
  teams: string[];
  onHlChange: (team: string | null) => void;
}

export function HLBar({ hl, teams, onHlChange }: HLBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">Highlight:</span>
      <select
        value={hl ?? ""}
        onChange={(e) => onHlChange(e.target.value || null)}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white max-w-48"
      >
        <option value="">None</option>
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {hl && (
        <button onClick={() => onHlChange(null)} className="text-xs text-gray-500 hover:text-gray-300">
          ✕
        </button>
      )}
      {hl && <span className="text-xs text-indigo-400">● {hl}</span>}
    </div>
  );
}
