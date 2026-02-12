import _ from "lodash";
import type { Rider } from "../types";
import { LapAnalysis } from "../components/LapAnalysis";
import { ScoringDot } from "../components/ScoringDot";
import { racePoints } from "../scoring/points";

function isHL(hl: string | null, r: Rider) {
  return hl != null && r.team === hl;
}

interface AnalysisTabProps {
  filtered: Rider[];
  threshold: number;
  hl: string | null;
  scoringIds: Set<string>;
}

interface Opp {
  rider: Rider;
  above: Rider;
  gap: number;
  pg: number;
}

interface Defensive {
  rider: Rider;
  threat: Rider;
  gap: number;
  loss: number;
}

export function AnalysisTab({ filtered, threshold, hl, scoringIds }: AnalysisTabProps) {
  const grouped = _.groupBy(filtered, "categoryRaw");
  const entries = Object.entries(grouped);
  if (!entries.length) {
    return <div className="text-center py-10 text-gray-500">No data matches filters.</div>;
  }
  return (
    <>
      {entries.map(([cat, riders]) => {
        const sorted = _.sortBy(riders.filter((r) => r.totalTime != null), "place");
        const opps: Opp[] = [];
        const defensive: Defensive[] = [];
        for (let i = 1; i < sorted.length; i++) {
          const gap2 = sorted[i]!.totalTime! - sorted[i - 1]!.totalTime!;
          const pg = racePoints(sorted[i - 1]!.place, sorted[i]!.category) - racePoints(sorted[i]!.place, sorted[i]!.category);
          if (gap2 <= threshold && gap2 > 0 && pg > 0) {
            opps.push({ rider: sorted[i]!, above: sorted[i - 1]!, gap: gap2, pg });
          }
        }
        for (let j = 0; j < sorted.length - 1; j++) {
          if (!scoringIds.has(sorted[j]!.id)) continue;
          const dGap = sorted[j + 1]!.totalTime! - sorted[j]!.totalTime!;
          if (dGap <= threshold && dGap > 0) {
            const loss = racePoints(sorted[j]!.place, sorted[j]!.category) - racePoints(sorted[j]!.place + 1, sorted[j]!.category);
            defensive.push({ rider: sorted[j]!, threat: sorted[j + 1]!, gap: dGap, loss });
          }
        }
        return (
          <div key={cat} className="mb-5 bg-gray-900 rounded p-3 border border-gray-800">
            <h2 className="text-sm font-bold text-white mb-2">{cat}</h2>
            {opps.length > 0 ? (
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-500 mb-0.5">⚡ Achievable Gains (≤{threshold}s)</div>
                <div className="text-xs space-y-0.5">
                  {opps.map((o, i) => (
                    <div key={i} className={"flex gap-2 items-center flex-wrap " + (isHL(hl, o.rider) ? "bg-indigo-950/40 rounded p-0.5" : "")}>
                      <span className="text-yellow-400 font-mono w-14">{o.gap.toFixed(1)}s</span>
                      <ScoringDot r={o.rider} isScoring={scoringIds.has(o.rider.id)} />
                      <span className={isHL(hl, o.rider) ? "text-indigo-300 font-bold" : ""}>{o.rider.name}</span>
                      <span className="text-gray-600">({o.rider.team})</span>
                      <span className="text-gray-500">→{o.above.name}</span>
                      <span className="text-green-400">+{o.pg}pts</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-600 mb-2">No gains within {threshold}s</div>
            )}
            {defensive.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-red-400 mb-0.5" style={{ opacity: 0.7 }}>
                  🛡️ Defensive — Scoring Riders Under Threat
                </div>
                <div className="text-xs space-y-0.5">
                  {defensive.map((d, i) => (
                    <div key={i} className={"flex gap-2 items-center flex-wrap " + (isHL(hl, d.rider) ? "bg-indigo-950/40 rounded p-0.5" : "")}>
                      <span className="text-red-400 font-mono w-14">{d.gap.toFixed(1)}s</span>
                      <ScoringDot r={d.rider} isScoring={scoringIds.has(d.rider.id)} />
                      <span className={isHL(hl, d.rider) ? "text-indigo-300 font-bold" : ""}>{d.rider.name}</span>
                      <span className="text-gray-600">({d.rider.team})</span>
                      <span className="text-gray-500">
                        ← {d.threat.name} ({d.threat.team})
                      </span>
                      <span className="text-red-400">-{d.loss}pts risk</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <LapAnalysis riders={riders} hl={hl} />
          </div>
        );
      })}
    </>
  );
}
