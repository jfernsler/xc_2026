import _ from "lodash";
import { useMemo, useState } from "react";
import type { Rider } from "../types";
import type { RaceOption } from "../utils/races";
import { regionTextClass } from "../utils/regionStyles";

/** Match riders across years by name only (category/team change over time). */
function riderKey(r: Rider) {
  return (r.name ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

/** Optionally strip region from category for baselining (e.g. "JV2 Boys North" → "JV2 Boys"). */
function categoryBaseline(cat: string, combineRegions: boolean): string {
  if (!combineRegions) return cat;
  return cat.replace(/\s+(North|South|Central|Other)\s*$/i, "").trim() || cat;
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
  const [combineRegions, setCombineRegions] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const toggleSelected = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedKeys(new Set(filteredSeries.map((s) => s.key)));
  };

  const deselectAll = () => {
    setSelectedKeys(new Set());
  };

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

    const finished = rawData.filter((r) => r.totalTime != null && (r.name ?? "").trim());
    const byRaceCat = _.groupBy(
      finished,
      (r) => `${r.race}|${categoryBaseline(r.categoryRaw, combineRegions)}`
    );
    const winnerTimeByRaceCat: Record<string, number> = {};
    Object.entries(byRaceCat).forEach(([k, riders]) => {
      const min = _.min(riders.map((r) => r.totalTime!))!;
      winnerTimeByRaceCat[k] = min;
    });

    const keyToPoints = new Map<string, RiderProgressionPoint[]>();
    finished.forEach((r) => {
      const catKey = `${r.race}|${categoryBaseline(r.categoryRaw, combineRegions)}`;
      const winnerTime = winnerTimeByRaceCat[catKey];
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
        const nameRider = rawData.find((r) => riderKey(r) === key);
        const name = nameRider?.name ?? "";
        const team = last ? (rawData.find((r) => r.race === last.raceId && riderKey(r) === key)?.team ?? "") : (nameRider?.team ?? "");
        const region = nameRider?.region ?? "Other";
        return { key, name, team, region, points: sorted, improvement };
      });

    const teams = _.sortBy(_.uniq(series.map((s) => s.team)).filter(Boolean));

    return { series, raceOrder, shortLabels, teams };
  }, [rawData, raceOptions, combineRegions]);

  const filteredSeries = useMemo(() => {
    if (teamFilter === "All") return series;
    return series.filter((s) => s.team === teamFilter);
  }, [series, teamFilter]);

  const listFiltered = useMemo(() => {
    if (!searchQuery.trim()) return filteredSeries;
    const q = searchQuery.trim().toLowerCase();
    return filteredSeries.filter(
      (s) =>
        (s.name ?? "").toLowerCase().includes(q) ||
        (s.team ?? "").toLowerCase().includes(q)
    );
  }, [filteredSeries, searchQuery]);

  const seriesToShow = useMemo(() => {
    if (selectedKeys.size === 0) return filteredSeries;
    return filteredSeries.filter((s) => selectedKeys.has(s.key));
  }, [filteredSeries, selectedKeys]);

  const chartWidth = Math.max(600, raceOrder.length * 56);
  const chartHeight = 380;
  const padding = { top: 24, right: 24, bottom: 48, left: 52 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  const maxGap = useMemo(() => {
    if (seriesToShow.length === 0) return 60;
    const max = _.max(seriesToShow.flatMap((s) => s.points.map((p) => p.gapToWinner))) ?? 60;
    return Math.max(60, max * 1.05);
  }, [seriesToShow]);

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
      <div className="flex items-center gap-4 mb-4 flex-wrap">
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
        <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={combineRegions}
            onChange={(e) => setCombineRegions(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600"
          />
          Combine regions (baseline by category only, e.g. JV Boys)
        </label>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Riders matched by name only. Gap to category winner (seconds). Only finished results; DNF/missing = no point. {filteredSeries.length} riders with 2+ races.
          {selectedKeys.size > 0 && ` Showing ${selectedKeys.size} selected in graph.`}
        </span>
      </div>

      <div className="w-full">
        <div
          className="w-full bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600 p-4 relative"
          onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
        >
          {hoveredKey && (() => {
            const s = seriesToShow.find((x) => x.key === hoveredKey);
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

          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full overflow-visible"
            style={{ minHeight: chartHeight, maxHeight: chartHeight }}
          >
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
            {seriesToShow.map((s, i) => {
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

          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 mb-3">
            Click riders below to show only them in the graph. Hover a line to see rider.
          </p>

          <div className="border border-slate-200 dark:border-slate-600 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <input
                type="text"
                placeholder="Type to find riders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[200px] max-w-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={selectAll}
                className="px-3 py-1.5 text-xs font-medium rounded bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-800"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={deselectAll}
                className="px-3 py-1.5 text-xs font-medium rounded bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500"
              >
                Deselect all
              </button>
              {searchQuery.trim() && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {listFiltered.length} match
                </span>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
              {_.sortBy(listFiltered, (s) => s.improvement).map((s, i) => {
                const isShown = selectedKeys.size === 0 || selectedKeys.has(s.key);
                return (
                  <div
                    key={s.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleSelected(s.key)}
                    onKeyDown={(e) => e.key === "Enter" && toggleSelected(s.key)}
                    className={
                      "flex items-center gap-3 text-sm py-2.5 px-3 rounded-lg cursor-pointer transition " +
                      (isShown
                        ? "bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700"
                        : "hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-transparent opacity-70")
                    }
                    onMouseEnter={() => setHoveredKey(s.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  >
                    <span
                      className="shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center"
                      style={{
                        borderColor: isShown ? colors[i % colors.length] : "var(--tw-slate-300)",
                        backgroundColor: isShown ? colors[i % colors.length] : "transparent",
                      }}
                    >
                      {isShown && <span className="text-white text-[10px]">✓</span>}
                    </span>
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: colors[i % colors.length] }}
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-200 min-w-0 truncate flex-1">
                      {s.name}
                    </span>
                    <span className={"shrink-0 truncate max-w-36 " + regionTextClass(s.region)}>
                      {s.team}
                    </span>
                    <span className="shrink-0 text-slate-500 dark:text-slate-400 text-xs">
                      {s.points.length} races
                    </span>
                    <span
                      className={
                        "shrink-0 font-mono text-xs " +
                        (s.improvement <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")
                      }
                    >
                      {s.improvement <= 0 ? "−" : "+"}
                      {Math.abs(s.improvement).toFixed(0)}s
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
