import _ from "lodash";
import { useMemo, useState } from "react";
import type { Rider } from "../types";
import type { RaceOption } from "../utils/races";
import { regionTextClass } from "../utils/regionStyles";

function riderKey(r: Rider) {
  return `${r.name}|${r.team}`;
}

/** Cubic Bezier path with flat tangents */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < rest.length; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const dx = (p1.x - p0.x) / 3;
    d += ` C ${p0.x + dx} ${p0.y} ${p1.x - dx} ${p1.y} ${p1.x} ${p1.y}`;
  }
  return d;
}

interface ProgressionTabProps {
  rawData: Rider[];
  raceOptions: RaceOption[];
}

export interface RiderProgressionPoint {
  raceIndex: number;
  raceId: number;
  year: number;
  raceName: string;
  categoryRaw: string;
  gapToWinner: number;
}

export interface RiderProgressionSeries {
  key: string;
  name: string;
  team: string;
  region: string;
  points: RiderProgressionPoint[];
  improvement: number; // negative = closed gap (improved)
}

export function ProgressionTab({ rawData, raceOptions }: ProgressionTabProps) {
  const [teamFilter, setTeamFilter] = useState<string>("All");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const { series, raceOrder, shortLabels, teams } = useMemo(() => {
    const optionsByYear = _.sortBy(
      raceOptions.filter((r) => r.year != null),
      [(r) => r.year, (r) => r.id]
    );
    const raceOrder = optionsByYear.map((r) => r.id);
    const raceIdToIndex: Record<number, number> = {};
    raceOrder.forEach((id, i) => { raceIdToIndex[id] = i; });
    const shortLabels = optionsByYear.map((r) => {
      const y = r.year ?? 0;
      const idxInYear = optionsByYear.filter((o) => o.year === y).indexOf(r) + 1;
      return `${y}-${idxInYear}`;
    });

    const finished = rawData.filter((r) => r.totalTime != null && r.team);
    const byRaceCat = _.groupBy(finished, (r) => `${r.race}|${r.categoryRaw}`);
    const winnerTimeByRaceCat: Record<string, number> = {};
    Object.entries(byRaceCat).forEach(([k, riders]) => {
      const min = _.min(riders.map((r) => r.totalTime!))!;
      winnerTimeByRaceCat[k] = min;
    });

    const keyToPoints = new Map<string, RiderProgressionPoint[]>();
    finished.forEach((r) => {
      const k = `${r.race}|${r.categoryRaw}`;
      const winnerTime = winnerTimeByRaceCat[k];
      if (winnerTime == null) return;
      const raceIndex = raceIdToIndex[r.race] ?? -1;
      if (raceIndex < 0) return;
      const gapToWinner = r.totalTime! - winnerTime;
      const opt = optionsByYear.find((o) => o.id === r.race);
      const key = riderKey(r);
      if (!keyToPoints.has(key)) keyToPoints.set(key, []);
      keyToPoints.get(key)!.push({
        raceIndex,
        raceId: r.race,
        year: opt?.year ?? 0,
        raceName: opt?.name ?? "",
        categoryRaw: r.categoryRaw,
        gapToWinner,
      });
    });

    const series: RiderProgressionSeries[] = Array.from(keyToPoints.entries())
      .filter(([, pts]) => pts.length >= 2)
      .map(([key, points]) => {
        const sorted = _.sortBy(points, "raceIndex");
        const first = sorted[0]!;
        const last = sorted[sorted.length - 1]!;
        const improvement = last.gapToWinner - first.gapToWinner;
        const name = rawData.find((r) => riderKey(r) === key)?.name ?? "";
        const team = rawData.find((r) => riderKey(r) === key)?.team ?? "";
        const region = rawData.find((r) => riderKey(r) === key)?.region ?? "Other";
        return { key, name, team, region, points: sorted, improvement };
      });

    const teams = _.sortBy(_.uniq(series.map((s) => s.team)).filter(Boolean));

    return { series, raceOrder, shortLabels, teams };
  }, [rawData, raceOptions]);

  const filteredSeries = useMemo(() => {
    if (teamFilter === "All") return series;
    return series.filter((s) => s.team === teamFilter);
  }, [series, teamFilter]);

  const chartWidth = Math.max(500, raceOrder.length * 48);
  const chartHeight = 360;
  const padding = { top: 24, right: 24, bottom: 48, left: 52 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  const maxGap = useMemo(() => {
    if (filteredSeries.length === 0) return 60;
    const max = _.max(filteredSeries.flatMap((s) => s.points.map((p) => p.gapToWinner))) ?? 60;
    return Math.max(60, max * 1.05);
  }, [filteredSeries]);

  const xScale = (raceIndex: number) =>
    padding.left + (raceIndex / Math.max(1, raceOrder.length - 1)) * innerW;
  const yScale = (gap: number) => padding.top + innerH - (gap / maxGap) * innerH;

  const colors = [
    "rgb(14, 165, 233)",
    "rgb(236, 72, 153)",
    "rgb(34, 197, 94)",
    "rgb(234, 179, 8)",
    "rgb(168, 85, 247)",
    "rgb(239, 68, 68)",
    "rgb(20, 184, 166)",
    "rgb(251, 146, 60)",
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          Team
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1.5 text-xs text-slate-900 min-w-[180px]"
          >
            <option value="All">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Gap to category winner (seconds). Only finished results; DNF/missing = no point. {filteredSeries.length} riders with 2+ races.
        </span>
      </div>

      <div className="overflow-x-auto">
        <div
          className="min-w-[520px] bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600 p-4 relative"
          onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
        >
          {hoveredKey && (() => {
            const s = filteredSeries.find((x) => x.key === hoveredKey);
            if (!s) return null;
            return (
              <div
                className="pointer-events-none fixed z-50 px-2 py-1.5 rounded bg-slate-800 dark:bg-slate-700 text-white text-xs shadow-lg border border-slate-600"
                style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}
              >
                <div className="font-medium">{s.name} ({s.team})</div>
                <div className="text-slate-300 dark:text-slate-400">
                  {s.points.map((p) => p.gapToWinner.toFixed(0) + "s").join(" → ")}
                </div>
                <div className={s.improvement <= 0 ? "text-emerald-400" : "text-amber-400"}>
                  {s.improvement <= 0 ? "Improved " : "Gap +"}{Math.abs(s.improvement).toFixed(0)}s vs first race
                </div>
              </div>
            );
          })()}

          <svg width={chartWidth} height={chartHeight} className="overflow-visible">
            {/* Y grid */}
            {[0, maxGap / 2, maxGap].map((g) => (
              <g key={g}>
                <line
                  x1={padding.left}
                  y1={yScale(g)}
                  x2={padding.left + innerW}
                  y2={yScale(g)}
                  stroke="currentColor"
                  strokeOpacity={0.12}
                  strokeDasharray="2 2"
                />
                <text
                  x={padding.left - 6}
                  y={yScale(g)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px]"
                >
                  {g.toFixed(0)}s
                </text>
              </g>
            ))}
            <text
              x={padding.left - 8}
              y={padding.top + innerH / 2}
              textAnchor="middle"
              transform={`rotate(-90, ${padding.left - 8}, ${padding.top + innerH / 2})`}
              className="fill-slate-500 dark:fill-slate-400 text-[10px]"
            >
              Gap to winner
            </text>

            {/* X labels */}
            {shortLabels.map((label, i) => (
              <text
                key={i}
                x={xScale(i)}
                y={chartHeight - 10}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[9px]"
              >
                {label}
              </text>
            ))}

            {/* Lines */}
            {filteredSeries.map((s, i) => {
              const pts = s.points.map((p) => ({ x: xScale(p.raceIndex), y: yScale(p.gapToWinner) }));
              const pathD = smoothPath(pts);
              const isHovered = hoveredKey === s.key;
              const color = isHovered ? "rgb(14, 165, 233)" : colors[i % colors.length];
              return (
                <g
                  key={s.key}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHoveredKey(s.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={20}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={color}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                    strokeOpacity={isHovered ? 1 : 0.85}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {pts.map((p, j) => (
                    <circle
                      key={j}
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 4 : 3}
                      fill={color}
                      stroke={isHovered ? "white" : "transparent"}
                      strokeWidth={1}
                    />
                  ))}
                </g>
              );
            })}
          </svg>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 mb-2">
            Hover a line to see rider. Only races with a finish time are plotted.
          </p>

          <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded p-2 space-y-0.5">
            {_.sortBy(filteredSeries, (s) => s.improvement).map((s, i) => (
              <div
                key={s.key}
                className="flex items-center gap-2 text-xs py-1.5 px-2 rounded hover:bg-slate-100 dark:hover:bg-slate-700/50"
                onMouseEnter={() => setHoveredKey(s.key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="font-medium text-slate-800 dark:text-slate-200 min-w-0 truncate">{s.name}</span>
                <span className={"shrink-0 truncate max-w-28 " + regionTextClass(s.region)}>{s.team}</span>
                <span className="shrink-0 text-slate-500 dark:text-slate-400">
                  {s.points.length} races
                </span>
                <span
                  className={
                    "shrink-0 font-mono " +
                    (s.improvement <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")
                  }
                >
                  {s.improvement <= 0 ? "−" : "+"}
                  {Math.abs(s.improvement).toFixed(0)}s
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
