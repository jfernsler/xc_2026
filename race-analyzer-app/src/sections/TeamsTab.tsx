import _ from "lodash";
import type { TeamScore } from "../types";
import { HLBar } from "../components/HLBar";
import { regionTextClass } from "../utils/regionStyles";

interface TeamsTabProps {
  tScores: TeamScore[];
  fR: string;
  hl: string | null;
  teams: string[];
  maxRiders: number;
  maxPerGender: number;
  onFR: (v: string) => void;
  onHl: (v: string | null) => void;
  onSelectTeam?: (team: string) => void;
}

export function TeamsTab({ tScores, fR, hl, teams, maxRiders, maxPerGender, onFR, onHl, onSelectTeam }: TeamsTabProps) {
  const filtered = fR === "All" ? tScores : tScores.filter((t) => t.region === fR);
  const handleTeamClick = (t: { team: string }) => {
    const h = hl === t.team;
    if (h) onHl(null);
    else {
      onHl(t.team);
      onSelectTeam?.(t.team);
    }
  };
  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select
          value={fR}
          onChange={(e) => onFR(e.target.value)}
          className="bg-slate-100 border border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1 text-xs text-slate-900"
        >
          <option value="All">All Regions</option>
          <option value="North">North</option>
          <option value="Central">Central</option>
          <option value="South">South</option>
          <option value="Other">Other</option>
        </select>
        <HLBar hl={hl} teams={teams} onHlChange={onHl} />
      </div>
      <div className="text-xs text-slate-400 dark:text-slate-500 mb-3">
        Top {maxRiders}/team, max {maxPerGender}/gender (change in header). <span className="text-emerald-500">●</span> = scoring. Select a team to use as base in Overtake.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((t, i) => {
          const h = hl === t.team;
          return (
            <div
              key={t.team}
              onClick={() => handleTeamClick(t)}
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
                  <div style={{ fontSize: "10px" }} className="text-slate-400 dark:text-slate-500">
                    {t.bc}B+{t.gc}G
                  </div>
                </div>
              </div>
              <div className="mt-2 space-y-0.5" style={{ fontSize: "10px" }}>
                {_.sortBy(t.roster, (r) => -r.pts).map((r, j) => (
                  <div key={j} className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span className="truncate flex-1">
                      <span className={r.gender === "girls" ? "text-pink-500" : "text-sky-500"}>
                        {r.gender[0].toUpperCase()}
                      </span>{" "}
                      {r.name}
                    </span>
                    <span className="ml-1 text-slate-400 dark:text-slate-500 truncate max-w-20">{r.categoryRaw}</span>
                    <span className="ml-1 font-mono">{r.pts}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
