import _ from "lodash";
import type { Rider } from "../types";
import { ScoringDot } from "../components/ScoringDot";
import { racePoints } from "../scoring/points";
import { formatTime } from "../utils/time";

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

/** Rider with lap-pacing stats for the analysis list */
interface RiderWithLapStats extends Rider {
  variance: number;   // avg deviation from mean lap (consistent)
  fade: number;       // lap2 - lap1 (positive = slowed on 2nd lap)
  negSplit: number;   // lap1 - lap2 (positive = faster 2nd lap)
}

function riderLapStats(riders: Rider[]): RiderWithLapStats[] {
  return riders
    .filter((r) => r.lap1 != null && r.lap2 != null)
    .map((r) => {
      const laps = [r.lap1, r.lap2, r.lap3].filter((l): l is number => l != null);
      const avg = laps.length >= 2 ? _.mean(laps) : 0;
      const variance = laps.length >= 2 ? _.mean(laps.map((l) => Math.abs(l - avg))) : 0;
      const fade = (r.lap2 ?? 0) - (r.lap1 ?? 0);
      const negSplit = (r.lap1 ?? 0) - (r.lap2 ?? 0);
      return { ...r, variance, fade, negSplit };
    });
}

const LAP_PACING_HELP = (
  <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600">
    <div className="font-medium text-slate-600 dark:text-slate-300 mb-1">Lap pacing metrics</div>
    <ul className="list-disc list-inside space-y-0.5">
      <li><strong>Consistent</strong> — Average deviation from their mean lap time (lower = more even pacing).</li>
      <li><strong>Fade</strong> — Lap 2 − Lap 1 in seconds. Positive = slowed on 2nd lap.</li>
      <li><strong>Neg split</strong> — Lap 1 − Lap 2. Positive = faster 2nd lap (negative split).</li>
    </ul>
  </div>
);

function LapPacingList({
  riders,
  hl,
  sortedByPlace,
  scoringIds,
}: {
  riders: Rider[];
  hl: string | null;
  sortedByPlace: Rider[];
  scoringIds: Set<string>;
}) {
  const statsById = _.keyBy(riderLapStats(riders), "id");
  return (
    <div className="mt-2">
      {LAP_PACING_HELP}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-left">
              <th className="py-1 pr-2">Place</th>
              <th className="py-1 pr-2">Rider</th>
              <th className="py-1 pr-2 text-right">Consistent</th>
              <th className="py-1 pr-2 text-right">Fade</th>
              <th className="py-1 pr-2 text-right">Neg split</th>
            </tr>
          </thead>
          <tbody>
            {sortedByPlace.map((r) => {
              const s = statsById[r.id];
              const rowClass = hl && r.team === hl ? "bg-sky-100/60 dark:bg-sky-900/40" : "";
              return (
                <tr key={r.id} className={"border-b border-slate-100 dark:border-slate-700/50 " + rowClass}>
                  <td className="py-0.5 pr-2 text-slate-500 dark:text-slate-400">{r.place}</td>
                  <td className="py-0.5 pr-2">
                    <ScoringDot r={r} isScoring={scoringIds.has(r.id)} />
                    <span className={hl && r.team === hl ? "text-sky-600 dark:text-sky-400 font-bold" : "text-slate-700 dark:text-slate-200"}>
                      {r.name}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 ml-1">({r.team})</span>
                  </td>
                  <td className="py-0.5 pr-2 text-right text-slate-600 dark:text-slate-300">
                    {s != null ? `±${s.variance.toFixed(1)}s` : "—"}
                  </td>
                  <td className="py-0.5 pr-2 text-right">
                    {s != null ? (
                      <span className={s.fade > 0 ? "text-red-500 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}>
                        {s.fade > 0 ? "+" : ""}{formatTime(s.fade)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-0.5 pr-2 text-right">
                    {s != null ? (
                      <span className={s.negSplit > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"}>
                        {s.negSplit > 0 ? "-" : "+"}{formatTime(Math.abs(s.negSplit))}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnalysisTab({ filtered, threshold, hl, scoringIds }: AnalysisTabProps) {
  const grouped = _.groupBy(filtered, "categoryRaw");
  const entries = Object.entries(grouped);
  if (!entries.length) {
    return <div className="text-center py-10 text-slate-400 dark:text-slate-500">No data matches filters.</div>;
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
          <div key={cat} className="mb-5 bg-white dark:bg-slate-800 rounded p-3 border border-slate-200 dark:border-slate-600">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2">{cat}</h2>
            {opps.length > 0 ? (
              <div className="mb-3">
                <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 mb-0.5">⚡ Achievable Gains (≤{threshold}s)</div>
                <div className="text-xs space-y-0.5">
                  {opps.map((o, i) => (
                    <div key={i} className={"flex gap-2 items-center flex-wrap rounded p-0.5 " + (isHL(hl, o.rider) ? "bg-sky-100/60 dark:bg-sky-900/40" : "")}>
                      <span className="text-amber-600 dark:text-amber-400 font-mono w-14">{o.gap.toFixed(1)}s</span>
                      <ScoringDot r={o.rider} isScoring={scoringIds.has(o.rider.id)} />
                      <span className={isHL(hl, o.rider) ? "text-sky-600 dark:text-sky-400 font-bold" : "text-slate-700 dark:text-slate-200"}>{o.rider.name}</span>
                      <span className="text-slate-400 dark:text-slate-500">({o.rider.team})</span>
                      <span className="text-slate-400 dark:text-slate-500">→{o.above.name}</span>
                      <span className="text-emerald-600 dark:text-emerald-400">+{o.pg}pts</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-2">No gains within {threshold}s</div>
            )}
            {defensive.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-semibold text-red-500 dark:text-red-400 mb-0.5 opacity-90">
                  🛡️ Defensive — Scoring Riders Under Threat
                </div>
                <div className="text-xs space-y-0.5">
                  {defensive.map((d, i) => (
                    <div key={i} className={"flex gap-2 items-center flex-wrap rounded p-0.5 " + (isHL(hl, d.rider) ? "bg-sky-100/60 dark:bg-sky-900/40" : "")}>
                      <span className="text-red-500 dark:text-red-400 font-mono w-14">{d.gap.toFixed(1)}s</span>
                      <ScoringDot r={d.rider} isScoring={scoringIds.has(d.rider.id)} />
                      <span className={isHL(hl, d.rider) ? "text-sky-600 dark:text-sky-400 font-bold" : "text-slate-700 dark:text-slate-200"}>{d.rider.name}</span>
                      <span className="text-slate-400 dark:text-slate-500">({d.rider.team})</span>
                      <span className="text-slate-400 dark:text-slate-500">
                        ← {d.threat.name} ({d.threat.team})
                      </span>
                      <span className="text-red-500 dark:text-red-400">-{d.loss}pts risk</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <LapPacingList riders={riders} hl={hl} sortedByPlace={sorted} scoringIds={scoringIds} />
          </div>
        );
      })}
    </>
  );
}
