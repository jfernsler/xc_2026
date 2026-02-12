import _ from "lodash";
import type { Rider } from "../types";
import { formatTime } from "../utils/time";

interface LapAnalysisProps {
  riders: Rider[];
  hl: string | null;
}

export function LapAnalysis({ riders, hl }: LapAnalysisProps) {
  const wl = (riders ?? []).filter((r) => r.lap1 != null && r.lap2 != null);
  if (!wl.length) return null;
  const withStats = wl
    .map((r) => {
      const laps = [r.lap1, r.lap2, r.lap3].filter((l): l is number => l != null);
      if (laps.length < 2) return null;
      const avg = _.mean(laps);
      return {
        ...r,
        laps,
        avg,
        variance: _.mean(laps.map((l) => Math.abs(l - avg))),
      };
    })
    .filter(Boolean) as Array<Rider & { variance: number }>;
  const tight = _.sortBy(withStats, "variance").slice(0, 6);
  const fade = _.sortBy(
    wl.map((r) => ({ ...r, fade: (r.lap2 ?? 0) - (r.lap1 ?? 0) })),
    (r) => -r.fade
  ).slice(0, 4);
  const neg = _.sortBy(
    wl.map((r) => ({ ...r, split: (r.lap1 ?? 0) - (r.lap2 ?? 0) })),
    (r) => -r.split
  ).slice(0, 4);
  const HN = (r: Rider) => (
    <span className={"w-24 truncate " + (hl && r.team === hl ? "text-indigo-300 font-bold" : "")}>
      {r.name}
    </span>
  );
  return (
    <div className="mt-2 space-y-2 text-xs">
      <div>
        <div className="font-semibold text-gray-500 mb-0.5">🎯 Consistent</div>
        {tight.map((r, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-600 w-4">{i + 1}.</span>
            {HN(r)}
            <span className="text-gray-500">±{r.variance.toFixed(1)}s</span>
          </div>
        ))}
      </div>
      <div>
        <div className="font-semibold text-gray-500 mb-0.5">📉 Fade</div>
        {fade.map((r, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-600 w-4">{i + 1}.</span>
            {HN(r)}
            <span className="text-red-400">+{formatTime(r.fade)}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="font-semibold text-gray-500 mb-0.5">📈 Neg Split</div>
        {neg.map((r, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-gray-600 w-4">{i + 1}.</span>
            {HN(r)}
            <span className="text-green-400">-{formatTime(r.split)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
