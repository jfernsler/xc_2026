interface HLBarProps {
  hl: string | null;
  teams: string[];
  onHlChange: (team: string | null) => void;
}

export function HLBar({ hl, teams, onHlChange }: HLBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-slate-400">Highlight:</span>
      <select
        value={hl ?? ""}
        onChange={(e) => onHlChange(e.target.value || null)}
        className="bg-slate-100 border border-slate-200 rounded px-2 py-1 text-xs text-slate-900 max-w-48"
      >
        <option value="">None</option>
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      {hl && (
        <button onClick={() => onHlChange(null)} className="text-xs text-slate-400 hover:text-slate-700">
          ✕
        </button>
      )}
      {hl && <span className="text-xs text-sky-500">● {hl}</span>}
    </div>
  );
}
