import _ from "lodash";
import type { Rider } from "../types";
import { GapChart } from "../components/GapChart";
import { ScoringDot } from "../components/ScoringDot";
import { racePoints } from "../scoring/points";
import { formatTime } from "../utils/time";
import { regionTextClass } from "../utils/regionStyles";

interface ResultsTabProps {
  filtered: Rider[];
  threshold: number;
  hl: string | null;
  scoringIds: Set<string>;
  onToggleCat: (cat: string) => void;
  onGoScenario: () => void;
}

function isHL(hl: string | null, r: Rider) {
  return hl != null && r.team === hl;
}

export function ResultsTab({
  filtered,
  threshold,
  hl,
  scoringIds,
  onToggleCat,
  onGoScenario,
}: ResultsTabProps) {
  const grouped = _.groupBy(filtered, "categoryRaw");
  return (
    <>
      {Object.entries(grouped).map(([cat, riders]) => (
        <div key={cat} className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-white">
              {cat} <span className="text-gray-500 font-normal text-xs">({riders.length})</span>
            </h2>
            <button
              onClick={() => { onToggleCat(cat); onGoScenario(); }}
              className="text-xs px-2 py-1 bg-purple-700 hover:bg-purple-600 rounded"
            >
              🔀
            </button>
          </div>
          <GapChart riders={riders} hl={hl} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="py-1 px-1 text-left">P</th>
                  <th className="py-1 px-1 text-left">Name</th>
                  <th className="py-1 px-1 text-left">Team</th>
                  <th className="py-1 px-1 text-center">Rgn</th>
                  <th className="py-1 px-1 text-right">Pts</th>
                  <th className="py-1 px-1 text-right">L1</th>
                  <th className="py-1 px-1 text-right">L2</th>
                  <th className="py-1 px-1 text-right">L3</th>
                  <th className="py-1 px-1 text-right">Total</th>
                  <th className="py-1 px-1 text-right">Gap</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((r, i) => {
                  const pg = i > 0 && riders[i - 1]!.totalTime != null && r.totalTime != null
                    ? r.totalTime - riders[i - 1]!.totalTime!
                    : 0;
                  const h = isHL(hl, r);
                  return (
                    <tr
                      key={r.id}
                      className={"border-b border-gray-900 hover:bg-gray-900/50 " + (h ? "bg-indigo-950/40" : "")}
                    >
                      <td className="py-1 px-1 font-mono">{r.place}</td>
                      <td className={"py-1 px-1 font-medium " + (h ? "text-indigo-300 font-bold" : "")}>
                        <ScoringDot r={r} isScoring={scoringIds.has(r.id)} />
                        {r.name}
                      </td>
                      <td className={"py-1 px-1 max-w-32 truncate " + (h ? "text-indigo-300" : "text-gray-400")} title={r.team}>
                        {r.team || "—"}
                      </td>
                      <td className={"py-1 px-1 text-center " + regionTextClass(r.region)}>{r.region[0]}</td>
                      <td className="py-1 px-1 text-right font-mono">{racePoints(r.place, r.category)}</td>
                      <td className="py-1 px-1 text-right font-mono text-gray-500">{formatTime(r.lap1)}</td>
                      <td className="py-1 px-1 text-right font-mono text-gray-500">{formatTime(r.lap2)}</td>
                      <td className="py-1 px-1 text-right font-mono text-gray-500">{formatTime(r.lap3)}</td>
                      <td className="py-1 px-1 text-right font-mono font-medium">{formatTime(r.totalTime)}</td>
                      <td className="py-1 px-1 text-right font-mono text-gray-600">
                        {i > 0 && pg > 0 ? (
                          <span className={pg <= threshold ? "text-yellow-400" : ""}>{pg.toFixed(1)}s</span>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
