import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Rider } from "../types";
import type { RaceOption } from "../utils/races";
import { getSchoolLevel } from "../constants/schoolLevel";
import { regionTextClass } from "../utils/regionStyles";

/** Match riders across years by name only (category/team change over time). */
function riderKey(r: Rider) {
  return (r.name ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

/** Optionally strip region from category for baselining (e.g. "JV2 Boys North" → "JV2 Boys"). */
function categoryBaselineRegion(cat: string, combineRegions: boolean): string {
  if (!combineRegions) return cat;
  return cat.replace(/\s+(North|South|Central|Other)\s*$/i, "").trim() || cat;
}

/** Baseline key for gap-to-winner: by category (with optional region strip), or by school level for Grade Level Progression. */
function baselineKey(
  r: Rider,
  combineRegions: boolean,
  gradeLevelProgression: boolean
): string {
  if (gradeLevelProgression) {
    const level = getSchoolLevel(r);
    if (level === "ms") return `${r.race}|ms`;
    return `${r.race}|hs-nonvarsity`;
  }
  return `${r.race}|${categoryBaselineRegion(r.categoryRaw ?? "", combineRegions)}`;
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

export type ProgressionMetric = "gap-pct" | "place-pct" | "composite" | "gap-sec";

export interface RiderProgressionPoint {
  raceIndex: number;
  raceId: number;
  year: number;
  raceName: string;
  categoryRaw: string;
  gapToWinner: number;
  gapPct: number;
  place: number;
  fieldSize: number;
  placePct: number;
  performanceIndex: number;
}

export interface RiderProgressionSeries {
  key: string;
  name: string;
  team: string;
  region: string;
  points: RiderProgressionPoint[];
  improvement: number;
  improvementGapPct: number;
  improvementPlacePct: number;
  improvementComposite: number;
  improvementGapSec: number;
}

const METRIC_CONFIG: Record<
  ProgressionMetric,
  { label: string; yLabel: string; explanation: string; formatValue: (v: number) => string; formatImprovement: (v: number) => string }
> = {
  "gap-pct": {
    label: "Gap %",
    yLabel: "Gap to winner (%)",
    explanation:
      "Your time behind the winner as a percentage of the winner’s time. Comparable across courses: a 5% gap is similar difficulty whether the race is 20 or 45 minutes. Improvement = first-race gap % minus last-race gap % (positive = you closed the gap).",
    formatValue: (v) => v.toFixed(1) + "%",
    formatImprovement: (v) => (v >= 0 ? "−" : "+") + Math.abs(v).toFixed(1) + "%",
  },
  "place-pct": {
    label: "Place %",
    yLabel: "Place % (vs peers)",
    explanation:
      "Where you finished among your peers: 100% = 1st, 0% = last in your category/group. Improvement = last-race place % minus first-race place % (positive = you moved up relative to peers).",
    formatValue: (v) => v.toFixed(0) + "%",
    formatImprovement: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%",
  },
  composite: {
    label: "Composite",
    yLabel: "Performance index (0–100)",
    explanation:
      "Single score combining gap % and place % (50/50): 100 = winner, lower = further behind. Comparable across races. Improvement = last-race index minus first-race index (positive = better).",
    formatValue: (v) => v.toFixed(0),
    formatImprovement: (v) => (v >= 0 ? "+" : "") + v.toFixed(1),
  },
  "gap-sec": {
    label: "Gap (sec)",
    yLabel: "Gap to winner (sec)",
    explanation:
      "Raw seconds behind the winner in your category/group. Varies with course length and conditions; use Gap % for course-normalized comparison. Improvement = first-race gap minus last-race gap (negative = you closed the gap).",
    formatValue: (v) => v.toFixed(0) + "s",
    formatImprovement: (v) => (v <= 0 ? "−" : "+") + Math.abs(v).toFixed(0) + "s",
  },
};

export function ProgressionTab({ rawData, raceOptions }: ProgressionTabProps) {
  const [teamFilter, setTeamFilter] = useState<string>("All");
  const [combineRegions, setCombineRegions] = useState(true);
  const [gradeLevelProgression, setGradeLevelProgression] = useState(false); // Compare vs All MS or All HS (excl. varsity)
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set()); // empty = all years
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);
  const [metric, setMetric] = useState<ProgressionMetric>("gap-pct");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const availableYears = useMemo(
    () => _.sortBy(_.uniq(raceOptions.map((r) => r.year).filter((y): y is number => y != null))),
    [raceOptions]
  );
  const effectiveYears = useMemo(
    () => (selectedYears.size === 0 ? availableYears : _.sortBy([...selectedYears])),
    [selectedYears, availableYears]
  );

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const update = () => setChartWidth(el.clientWidth || 800);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  const toggleYear = (year: number) => {
    setSelectedYears((prev) => {
      const base = prev.size === 0 ? new Set(availableYears) : new Set(prev);
      if (base.has(year)) {
        base.delete(year);
        return base.size === 0 ? new Set() : base;
      }
      base.add(year);
      return base;
    });
  };

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
      raceOptions.filter((r) => r.year != null && effectiveYears.includes(r.year)),
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
    const winnerTimeByRaceCat: Record<string, number> = {};
    const raceCatToFieldSize: Record<string, number> = {};
    if (gradeLevelProgression) {
      const byRaceMs = _.groupBy(finished.filter((r) => getSchoolLevel(r) === "ms"), "race");
      const byRaceHsNonVarsity = _.groupBy(
        finished.filter((r) => getSchoolLevel(r) === "hs" && r.category !== "varsity"),
        "race"
      );
      Object.entries(byRaceMs).forEach(([raceId, riders]) => {
        const min = _.min(riders.map((r) => r.totalTime!));
        if (min != null) {
          winnerTimeByRaceCat[`${raceId}|ms`] = min;
          raceCatToFieldSize[`${raceId}|ms`] = riders.length;
        }
      });
      Object.entries(byRaceHsNonVarsity).forEach(([raceId, riders]) => {
        const min = _.min(riders.map((r) => r.totalTime!));
        if (min != null) {
          winnerTimeByRaceCat[`${raceId}|hs-nonvarsity`] = min;
          raceCatToFieldSize[`${raceId}|hs-nonvarsity`] = riders.length;
        }
      });
    } else {
      const byRaceCat = _.groupBy(finished, (r) => baselineKey(r, combineRegions, false));
      Object.entries(byRaceCat).forEach(([k, riders]) => {
        const min = _.min(riders.map((r) => r.totalTime!))!;
        winnerTimeByRaceCat[k] = min;
        raceCatToFieldSize[k] = riders.length;
      });
    }

    const keyToPoints = new Map<string, RiderProgressionPoint[]>();
    finished.forEach((r) => {
      const catKey = baselineKey(r, combineRegions, gradeLevelProgression);
      const winnerTime = winnerTimeByRaceCat[catKey];
      if (winnerTime == null) return;
      const raceIndex = raceIdToIndex[r.race] ?? -1;
      if (raceIndex < 0) return;
      const gapToWinner = r.totalTime! - winnerTime;
      const gapPct = winnerTime > 0 ? (gapToWinner / winnerTime) * 100 : 0;
      const fieldSize = raceCatToFieldSize[catKey] ?? 1;
      const place = r.place >= 1 && r.place <= fieldSize ? r.place : fieldSize;
      const placePct = fieldSize > 0 ? ((fieldSize - place + 1) / fieldSize) * 100 : 0;
      const gapScore = Math.max(0, 100 - Math.min(gapPct, 100));
      const performanceIndex = (gapScore + placePct) / 2;
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
        gapPct,
        place,
        fieldSize,
        placePct,
        performanceIndex,
      });
    });

    const series: RiderProgressionSeries[] = Array.from(keyToPoints.entries())
      .filter(([, pts]) => pts.length >= 2)
      .map(([key, points]) => {
        const sorted = _.sortBy(points, "raceIndex");
        const first = sorted[0]!;
        const last = sorted[sorted.length - 1]!;
        const improvementGapSec = last.gapToWinner - first.gapToWinner;
        const improvementGapPct = first.gapPct - last.gapPct;
        const improvementPlacePct = last.placePct - first.placePct;
        const improvementComposite = last.performanceIndex - first.performanceIndex;
        const nameRider = rawData.find((r) => riderKey(r) === key);
        const name = nameRider?.name ?? "";
        const team = last ? (rawData.find((r) => r.race === last.raceId && riderKey(r) === key)?.team ?? "") : (nameRider?.team ?? "");
        const region = nameRider?.region ?? "Other";
        return {
          key,
          name,
          team,
          region,
          points: sorted,
          improvement: improvementGapSec,
          improvementGapPct,
          improvementPlacePct,
          improvementComposite,
          improvementGapSec,
        };
      });

    const teams = _.sortBy(_.uniq(series.map((s) => s.team)).filter(Boolean));

    return { series, raceOrder, shortLabels, teams };
  }, [rawData, raceOptions, combineRegions, gradeLevelProgression, effectiveYears]);

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

  const chartHeight = 380;
  const padding = { top: 24, right: 24, bottom: 48, left: 52 };
  const innerW = Math.max(0, chartWidth - padding.left - padding.right);
  const innerH = chartHeight - padding.top - padding.bottom;

  const pointY = (p: RiderProgressionPoint, m: ProgressionMetric): number => {
    switch (m) {
      case "gap-pct": return p.gapPct;
      case "place-pct": return p.placePct;
      case "composite": return p.performanceIndex;
      case "gap-sec": return p.gapToWinner;
    }
  };

  const seriesImprovement = (s: RiderProgressionSeries, m: ProgressionMetric): number => {
    switch (m) {
      case "gap-pct": return s.improvementGapPct;
      case "place-pct": return s.improvementPlacePct;
      case "composite": return s.improvementComposite;
      case "gap-sec": return s.improvementGapSec;
    }
  };

  const listSorted = useMemo(() => {
    const byImprovement = (a: RiderProgressionSeries, b: RiderProgressionSeries) =>
      seriesImprovement(b, metric) - seriesImprovement(a, metric);
    if (selectedKeys.size === 0) return _.sortBy(listFiltered, (s) => -seriesImprovement(s, metric));
    const selected = listFiltered.filter((s) => selectedKeys.has(s.key));
    const rest = listFiltered.filter((s) => !selectedKeys.has(s.key));
    return [...selected.sort(byImprovement), ...rest.sort(byImprovement)];
  }, [listFiltered, selectedKeys, metric]);

  const cfg = METRIC_CONFIG[metric];
  const showLegend = selectedKeys.size > 0 && selectedKeys.size < filteredSeries.length;

  const { maxY, yTicks } = useMemo(() => {
    if (seriesToShow.length === 0) return { maxY: 100, yTicks: [0, 50, 100] };
    const allY = seriesToShow.flatMap((s) => s.points.map((p) => pointY(p, metric)));
    const minY = _.min(allY) ?? 0;
    const maxVal = _.max(allY) ?? 100;
    if (metric === "place-pct" || metric === "composite") {
      return { maxY: 100, yTicks: [0, 50, 100] };
    }
    const maxY = Math.max(maxVal * 1.05, minY + 1);
    const step = maxY <= 60 ? 20 : maxY <= 120 ? 30 : Math.ceil(maxY / 4 / 10) * 10;
    const ticks = [0];
    for (let t = step; t < maxY; t += step) ticks.push(t);
    ticks.push(maxY);
    return { maxY, yTicks: ticks.length > 1 ? ticks : [0, maxY] };
  }, [seriesToShow, metric]);

  const xScale = (raceIndex: number) =>
    padding.left + (raceIndex / Math.max(1, raceOrder.length - 1)) * innerW;
  const yScale = (y: number) =>
    padding.top + innerH - (y / maxY) * innerH;

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
        {availableYears.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 dark:text-slate-400">Years</span>
            {availableYears.map((y) => (
              <label key={y} className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedYears.size === 0 || selectedYears.has(y)}
                  onChange={() => toggleYear(y)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                {y}
              </label>
            ))}
          </div>
        )}
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
        <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={gradeLevelProgression}
            onChange={(e) => setGradeLevelProgression(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600"
          />
          Grade Level Progression (compare vs All MS or All HS, exclude varsity)
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          Metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as ProgressionMetric)}
            className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1.5 text-xs text-slate-900 min-w-[140px]"
          >
            {(Object.keys(METRIC_CONFIG) as ProgressionMetric[]).map((m) => (
              <option key={m} value={m}>{METRIC_CONFIG[m].label}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Riders matched by name only. {filteredSeries.length} riders with 2+ races.
          {selectedKeys.size > 0 && ` Showing ${selectedKeys.size} selected in graph.`}
        </span>
      </div>

      <div className="mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{cfg.label}: {cfg.yLabel}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{cfg.explanation}</p>
      </div>

      <div className="w-full">
        <div
          className="w-full bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600 p-4 relative"
          onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
        >
          {hoveredKey && (() => {
            const s = seriesToShow.find((x) => x.key === hoveredKey);
            if (!s) return null;
            const imp = seriesImprovement(s, metric);
            const improved = (metric === "gap-sec" ? imp <= 0 : imp >= 0);
            return (
              <div
                className="pointer-events-none fixed z-50 px-2 py-1.5 rounded bg-slate-800 dark:bg-slate-700 text-white text-xs shadow-lg border border-slate-600"
                style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}
              >
                <div className="font-medium">{s.name} ({s.team})</div>
                <div className="text-slate-300 dark:text-slate-400">
                  {s.points.map((p) => cfg.formatValue(pointY(p, metric))).join(" → ")}
                </div>
                <div className={improved ? "text-emerald-400" : "text-amber-400"}>
                  {improved ? "Improved " : ""}{cfg.formatImprovement(imp)} vs first race
                </div>
              </div>
            );
          })()}

          <div ref={chartContainerRef} className="w-full">
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            className="w-full overflow-visible"
            style={{ minHeight: chartHeight, maxHeight: chartHeight }}
          >
            {/* Y grid */}
            {yTicks.map((g) => (
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
                  {metric === "gap-sec" ? g.toFixed(0) + "s" : g.toFixed(0)}
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
              {cfg.yLabel}
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
              const pts = s.points.map((p) => ({ x: xScale(p.raceIndex), y: yScale(pointY(p, metric)) }));
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
          </div>

          {showLegend && (
            <div className="flex flex-wrap items-center gap-3 mt-2 mb-1 px-1">
              {seriesToShow.map((s, i) => (
                <span key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span
                    className="w-3 h-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: colors[i % colors.length] }}
                  />
                  <span className="truncate max-w-[120px]" title={s.name}>{s.name}</span>
                </span>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 mb-3">
            Click riders below to show only them in the graph. Selected riders appear at the top of the list. Hover a line to see rider.
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
            <div className="max-h-[28rem] overflow-y-auto space-y-1 pr-1">
              {listSorted.map((s) => {
                const isShown = selectedKeys.size === 0 || selectedKeys.has(s.key);
                const colorIdx = seriesToShow.findIndex((x) => x.key === s.key);
                const color = colorIdx >= 0 ? colors[colorIdx % colors.length] : "var(--tw-slate-400)";
                const imp = seriesImprovement(s, metric);
                const improved = (metric === "gap-sec" ? imp <= 0 : imp >= 0);
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
                        borderColor: isShown ? color : "var(--tw-slate-300)",
                        backgroundColor: isShown ? color : "transparent",
                      }}
                    >
                      {isShown && <span className="text-white text-[10px]">✓</span>}
                    </span>
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
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
                        (improved ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")
                      }
                    >
                      {cfg.formatImprovement(imp)}
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
