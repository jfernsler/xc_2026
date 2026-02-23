import type { Rider } from "../types";
import { formatDelta } from "../utils/time";
import { regionBarClass } from "../utils/regionStyles";

interface GapChartProps {
  riders: Rider[];
  hl: string | null;
}

export function GapChart({ riders, hl }: GapChartProps) {
  const v = (riders ?? []).filter((r) => r.totalTime != null);
  if (v.length < 2) return null;
  const ld = v[0]!.totalTime!;
  const mx = v[v.length - 1]!.totalTime! - ld;
  if (mx <= 0) return null;
  return (
    <div className="mt-1 mb-2">
      <div className="space-y-0.5">
        {v.slice(0, 25).map((r) => {
          const gap = r.totalTime! - ld;
          const pct = (gap / mx) * 100;
          const h = hl && r.team === hl;
          return (
            <div
              key={r.id}
              className={"flex items-center gap-1 text-xs rounded " + (h ? "bg-sky-100/80 dark:bg-sky-900/40" : "")}
            >
              <span className="w-5 text-right text-slate-400 dark:text-slate-500">{r.place}</span>
              <span className={"w-24 truncate " + (h ? "text-sky-600 dark:text-sky-400 font-bold" : "text-slate-500 dark:text-slate-300")}>
                {r.name}
              </span>
              <div className="flex-1 h-3 bg-slate-200 dark:bg-slate-600 rounded relative">
                <div
                  className={"h-3 rounded " + (h ? "bg-sky-500/90 dark:bg-sky-600/80" : regionBarClass(r.region))}
                  style={{ width: Math.max(pct, 0.5) + "%" }}
                />
                <span
                  className="absolute right-1 top-0 text-slate-400 dark:text-slate-500"
                  style={{ fontSize: "9px", lineHeight: "12px" }}
                >
                  {formatDelta(gap)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
