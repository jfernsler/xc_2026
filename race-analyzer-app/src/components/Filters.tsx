import { HLBar } from "./HLBar";

interface FiltersProps {
  regions: string[];
  teams: string[];
  cats: string[];
  races: number[];
  fSchool: string;
  fR: string;
  fT: string;
  fC: string;
  fRace: string;
  hl: string | null;
  onFSchool: (v: string) => void;
  onFR: (v: string) => void;
  onFT: (v: string) => void;
  onFC: (v: string) => void;
  onFRace: (v: string) => void;
  onHl: (v: string | null) => void;
}

export function Filters({
  regions,
  teams,
  cats,
  races,
  fSchool,
  fR,
  fT,
  fC,
  fRace,
  hl,
  onFSchool,
  onFR,
  onFT,
  onFC,
  onFRace,
  onHl,
}: FiltersProps) {
  return (
    <div className="space-y-2 mb-3">
      <div className="flex gap-2 flex-wrap items-center">
        <select
          value={fSchool}
          onChange={(e) => onFSchool(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value="All">All Grades</option>
          <option value="High School">High School</option>
          <option value="Middle School">Middle School</option>
        </select>
        <select
          value={fR}
          onChange={(e) => onFR(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value="All">All Regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={fT}
          onChange={(e) => onFT(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value="All">All Teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={fC}
          onChange={(e) => onFC(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value="All">All Categories</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {races.length > 1 && (
          <select
            value={fRace}
            onChange={(e) => onFRace(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
          >
            <option value="All">All Races</option>
            {races.map((r) => (
              <option key={r} value={String(r)}>
                Race {r}
              </option>
            ))}
          </select>
        )}
      </div>
      <HLBar hl={hl} teams={teams} onHlChange={onHl} />
    </div>
  );
}
