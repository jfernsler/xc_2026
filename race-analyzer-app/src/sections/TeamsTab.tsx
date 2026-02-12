import _ from "lodash";
import type { TeamScore } from "../types";
import { HLBar } from "../components/HLBar";
import { regionTextClass } from "../utils/regionStyles";

interface TeamsTabProps {
  tScores: TeamScore[];
  fR: string;
  hl: string | null;
  teams: string[];
  onFR: (v: string) => void;
  onHl: (v: string | null) => void;
}

export function TeamsTab({ tScores, fR, hl, teams, onFR, onHl }: TeamsTabProps) {
  const filtered = fR === "All" ? tScores : tScores.filter((t) => t.region === fR);
  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <select
          value={fR}
          onChange={(e) => onFR(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
        >
          <option value="All">All Regions</option>
          <option value="North">North</option>
          <option value="Central">Central</option>
          <option value="South">South</option>
          <option value="Other">Other</option>
        </select>
        <HLBar hl={hl} teams={teams} onHlChange={onHl} />
      </div>
      <div className="text-xs text-gray-500 mb-3">
        Top 8/team, max 6/gender. <span className="text-emerald-400">●</span> = scoring
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((t, i) => {
          const h = hl === t.team;
          return (
            <div
              key={t.team}
              onClick={() => onHl(h ? null : t.team)}
              className={
                "bg-gray-900 rounded p-3 border cursor-pointer transition " +
                (h ? "border-indigo-500 ring-1 ring-indigo-500/30" : "border-gray-800 hover:border-gray-700")
              }
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-gray-600 text-xs">#{i + 1}</span>
                  <h3 className={"text-sm font-bold leading-tight " + (h ? "text-indigo-300" : "")}>{t.team}</h3>
                  <span className={"text-xs " + regionTextClass(t.region)}>{t.region}</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">{t.total}</div>
                  <div style={{ fontSize: "10px" }} className="text-gray-500">
                    {t.bc}B+{t.gc}G
                  </div>
                </div>
              </div>
              <div className="mt-2 space-y-0.5" style={{ fontSize: "10px" }}>
                {_.sortBy(t.roster, (r) => -r.pts).map((r, j) => (
                  <div key={j} className="flex justify-between text-gray-400">
                    <span className="truncate flex-1">
                      <span className={r.gender === "girls" ? "text-pink-400" : "text-sky-400"}>
                        {r.gender[0].toUpperCase()}
                      </span>{" "}
                      {r.name}
                    </span>
                    <span className="ml-1 text-gray-600 truncate max-w-20">{r.categoryRaw}</span>
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
