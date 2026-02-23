import _ from "lodash";
import type { RaceOption } from "../utils/races";
import { HLBar } from "../components/HLBar";
import { regionTextClass } from "../utils/regionStyles";

export interface CumulativeTeamRow {
  team: string;
  region: string;
  total: number;
  byRace: Record<number, number>;
}

interface CumulativeTeamsTabProps {
  rows: CumulativeTeamRow[];
  raceOptions: RaceOption[];
  fR: string;
  hl: string | null;
  teams: string[];
  onFR: (v: string) => void;
  onHl: (v: string | null) => void;
}

export function CumulativeTeamsTab({
  rows,
  raceOptions,
  fR,
  hl,
  teams,
  onFR,
  onHl,
}: CumulativeTeamsTabProps) {
  const filtered = fR === "All" ? rows : rows.filter((t) => t.region === fR);
  const raceIdToName = _.keyBy(raceOptions, "id");

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select
          value={fR}
          onChange={(e) => onFR(e.target.value)}
          className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1 text-xs text-slate-900"
        >
          <option value="All">All Regions</option>
          <option value="North">North</option>
          <option value="Central">Central</option>
          <option value="South">South</option>
          <option value="Other">Other</option>
        </select>
        <HLBar hl={hl} teams={teams} onHlChange={onHl} />
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
        Cumulative team points across all loaded races. Same scoring rules per race (top N, max per gender).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((t, i) => {
          const h = hl === t.team;
          const raceIds = _.sortBy(Object.keys(t.byRace).map(Number));
          return (
            <div
              key={t.team}
              onClick={() => onHl(h ? null : t.team)}
              className={
                "bg-white dark:bg-slate-800 rounded p-3 border cursor-pointer transition " +
                (h ? "border-sky-400 ring-1 ring-sky-400/30 dark:border-sky-500" : "border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500")
              }
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 text-xs">#{i + 1}</span>
                  <h3 className={"text-sm font-bold leading-tight " + (h ? "text-sky-600 dark:text-sky-400" : "dark:text-slate-100")}>{t.team}</h3>
                  <span className={"text-xs " + regionTextClass(t.region)}>{t.region}</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold dark:text-slate-100">{t.total}</div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">total pts</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5" style={{ fontSize: "10px" }}>
                {raceIds.map((rid) => (
                  <span key={rid} className="text-slate-500 dark:text-slate-400">
                    {(raceIdToName[rid]?.name ?? `R${rid}`).slice(0, 12)}: <span className="font-mono">{t.byRace[rid]}</span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
