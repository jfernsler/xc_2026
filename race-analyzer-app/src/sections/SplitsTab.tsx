import { useState, useMemo } from "react";
import _ from "lodash";
import type { Rider, SplitData } from "../types";
import { formatTime } from "../utils/time";

type TimingMode = "chip" | "sector";
type ViewMode = "splits" | "segment-stats" | "distribution" | "vs-average" | "correlation";

interface SplitsTabProps {
  raceName: string;
  filtered: Rider[];
  splits: SplitData | null;
  hl: string | null;
}

function getSegmentValues(splits: SplitData, riderId: string, mode: TimingMode): (number | null)[] {
  const row = splits.byRiderId[riderId];
  if (!row) return [];
  return mode === "chip" ? row.chip : row.sector;
}

/** Segment stats over an array of values (excludes nulls). */
function segmentStats(values: (number | null)[]): { min: number; max: number; mean: number; median: number; count: number; std: number } | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / nums.length;
  const median = sorted.length % 2 === 1
    ? sorted[(sorted.length - 1) / 2]!
    : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const variance = nums.reduce((a, v) => a + (v - mean) ** 2, 0) / nums.length;
  const std = Math.sqrt(variance);
  return { min, max, mean, median, count: nums.length, std };
}

/** Histogram buckets (seconds) for distribution. */
function histogram(values: (number | null)[], numBuckets = 12): { min: number; max: number; buckets: number[]; step: number } | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const step = range / numBuckets;
  const buckets = new Array(numBuckets).fill(0);
  nums.forEach((v) => {
    const i = Math.min(Math.floor((v - min) / step), numBuckets - 1);
    buckets[i]++;
  });
  return { min, max, buckets, step };
}

/** Pearson correlation. */
function correlation(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 2) return null;
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i]!, 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? null : num / den;
}

/** Linear regression slope and intercept (y = a + b*x). */
function linearRegression(x: number[], y: number[]): { a: number; b: number } | null {
  if (x.length !== y.length || x.length < 2) return null;
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i]!, 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const a = (sumY - b * sumX) / n;
  return { a, b };
}

function correlationInterpretation(r: number): string {
  const abs = Math.abs(r);
  const dir = r > 0 ? "Positive: faster on one tends to mean faster on the other." : "Negative: faster on one tends to mean slower on the other.";
  if (abs >= 0.7) return `Strong (r = ${r.toFixed(2)}). ${dir}`;
  if (abs >= 0.4) return `Moderate (r = ${r.toFixed(2)}). ${dir}`;
  if (abs >= 0.2) return `Weak (r = ${r.toFixed(2)}). Little linear relationship.`;
  return `Very weak (r = ${r.toFixed(2)}). No clear relationship.`;
}

const TOTAL_LABEL = "Total time";
const CATEGORY_COLORS = [
  "#0ea5e9", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899",
  "#06b6d4", "#eab308", "#84cc16", "#a855f7", "#f43f5e",
];

interface CorrelationScatterProps {
  splits: SplitData;
  grouped: Record<string, Rider[]>;
  ridersWithSplits: Rider[];
  timingMode: TimingMode;
  hl: string | null;
}

function CorrelationScatter({ splits, grouped, ridersWithSplits, timingMode, hl }: CorrelationScatterProps) {
  const [catFilter, setCatFilter] = useState<string>("All");
  const [xAxis, setXAxis] = useState<string>(splits.segmentLabels[0] ?? TOTAL_LABEL);
  const [yAxis, setYAxis] = useState<string>(splits.segmentLabels[1] ?? TOTAL_LABEL);

  const categories = useMemo(() => ["All", ...Object.keys(grouped)], [grouped]);

  const points = useMemo(() => {
    const riders = catFilter === "All" ? ridersWithSplits : grouped[catFilter] ?? [];
    const xIdx = xAxis === TOTAL_LABEL ? -1 : splits.segmentLabels.indexOf(xAxis);
    const yIdx = yAxis === TOTAL_LABEL ? -1 : splits.segmentLabels.indexOf(yAxis);
    const out: { x: number; y: number; rider: Rider; category: string }[] = [];
    riders.forEach((r) => {
      const xVal = xIdx === -1 ? r.totalTime : getSegmentValues(splits, r.id, timingMode)[xIdx];
      const yVal = yIdx === -1 ? r.totalTime : getSegmentValues(splits, r.id, timingMode)[yIdx];
      if (xVal != null && yVal != null) out.push({ x: xVal, y: yVal, rider: r, category: r.categoryRaw });
    });
    return out;
  }, [splits, grouped, ridersWithSplits, catFilter, xAxis, yAxis, timingMode]);

  const { xMin, xMax, yMin, yMax, r, trendLine } = useMemo(() => {
    if (points.length < 2) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1, r: null as number | null, trendLine: null as { x1: number; y1: number; x2: number; y2: number } | null };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const padding = 0.04;
    const xRange = (xMax - xMin) || 1;
    const yRange = (yMax - yMin) || 1;
    const rVal = correlation(xs, ys);
    const lr = linearRegression(xs, ys);
    let line: { x1: number; y1: number; x2: number; y2: number } | null = null;
    if (lr) {
      const x1 = xMin - xRange * padding;
      const x2 = xMax + xRange * padding;
      line = { x1, y1: lr.a + lr.b * x1, x2, y2: lr.a + lr.b * x2 };
    }
    return {
      xMin: xMin - xRange * padding,
      xMax: xMax + xRange * padding,
      yMin: yMin - yRange * padding,
      yMax: yMax + yRange * padding,
      r: rVal,
      trendLine: line,
    };
  }, [points]);

  const width = 640;
  const height = 480;
  const pad = { left: 56, right: 24, top: 32, bottom: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const toX = (v: number) => pad.left + ((v - xMin) / (xMax - xMin || 1)) * plotW;
  const toY = (v: number) => pad.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const xLabel = xAxis === TOTAL_LABEL ? "Total time" : `Segment: ${xAxis}`;
  const yLabel = yAxis === TOTAL_LABEL ? "Total time" : `Segment: ${yAxis}`;
  const axisOptions = [TOTAL_LABEL, ...splits.segmentLabels];

  const categoryColorIndex = useMemo(() => {
    const idx: Record<string, number> = {};
    Object.keys(grouped).forEach((cat, i) => { idx[cat] = i % CATEGORY_COLORS.length; });
    return idx;
  }, [grouped]);

  const numTicks = 5;
  const xTicks = useMemo(() => {
    const step = (xMax - xMin) / (numTicks - 1);
    return Array.from({ length: numTicks }, (_, i) => xMin + i * step);
  }, [xMin, xMax]);
  const yTicks = useMemo(() => {
    const step = (yMax - yMin) / (numTicks - 1);
    return Array.from({ length: numTicks }, (_, i) => yMin + i * step);
  }, [yMin, yMax]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-600 p-3">
        <p className="text-sm text-slate-700 dark:text-slate-200">
          <strong>What this shows:</strong> Each point is one rider. The horizontal axis is their time for the chosen X split (or total time); the vertical axis is the Y split. If the cloud follows a line, that split pair is correlated—e.g. riders who are fast in L1-S1 tend to be fast in L2-S1 too. The trend line and <em>r</em> summarize strength and direction.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Category
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="ml-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-slate-900 dark:text-slate-100 text-xs"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          X axis (horizontal)
          <select
            value={xAxis}
            onChange={(e) => setXAxis(e.target.value)}
            className="ml-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-slate-900 dark:text-slate-100 text-xs"
          >
            {axisOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Y axis (vertical)
          <select
            value={yAxis}
            onChange={(e) => setYAxis(e.target.value)}
            className="ml-1.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-slate-900 dark:text-slate-100 text-xs"
          >
            {axisOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
      </div>

      {r != null && (
        <div className={`rounded-lg px-3 py-2 text-sm font-medium ${
          Math.abs(r) >= 0.7 ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700" :
          Math.abs(r) >= 0.4 ? "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-700" :
          "bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
        }`}>
          {correlationInterpretation(r)}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-sm">
        <svg width={width} height={height} className="min-w-0">
          <defs>
            <linearGradient id="corrPlotBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f1f5f9" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#e2e8f0" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <rect x={pad.left} y={pad.top} width={plotW} height={plotH} fill="url(#corrPlotBg)" />
          {/* Grid */}
          {xTicks.slice(1, -1).map((v, i) => (
            <line key={`v${i}`} x1={toX(v)} y1={pad.top} x2={toX(v)} y2={pad.top + plotH} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2,2" className="dark:stroke-slate-600" />
          ))}
          {yTicks.slice(1, -1).map((v, i) => (
            <line key={`h${i}`} x1={pad.left} y1={toY(v)} x2={pad.left + plotW} y2={toY(v)} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2,2" className="dark:stroke-slate-600" />
          ))}
          {/* Trend line */}
          {trendLine && (
            <line
              x1={toX(trendLine.x1)}
              y1={toY(trendLine.y1)}
              x2={toX(trendLine.x2)}
              y2={toY(trendLine.y2)}
              stroke="#f59e0b"
              strokeWidth={2.5}
              strokeLinecap="round"
              className="dark:stroke-amber-400"
              opacity={0.9}
            />
          )}
          {/* Axes */}
          <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="#64748b" strokeWidth={1.5} className="dark:stroke-slate-500" />
          <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} stroke="#64748b" strokeWidth={1.5} className="dark:stroke-slate-500" />
          {/* Axis labels and ticks */}
          {xTicks.map((v) => (
            <g key={v}>
              <line x1={toX(v)} y1={pad.top + plotH} x2={toX(v)} y2={pad.top + plotH + 6} stroke="#64748b" className="dark:stroke-slate-500" />
              <text x={toX(v)} y={pad.top + plotH + 20} textAnchor="middle" className="text-[11px] fill-slate-600 dark:fill-slate-400 font-medium">{formatTime(v)}</text>
            </g>
          ))}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={pad.left - 6} y1={toY(v)} x2={pad.left} y2={toY(v)} stroke="#64748b" className="dark:stroke-slate-500" />
              <text x={pad.left - 8} y={toY(v) + 4} textAnchor="end" className="text-[11px] fill-slate-600 dark:fill-slate-400 font-medium">{formatTime(v)}</text>
            </g>
          ))}
          <text x={pad.left + plotW / 2} y={height - 12} textAnchor="middle" className="text-xs font-semibold fill-slate-700 dark:fill-slate-300">{xLabel}</text>
          <text x={14} y={pad.top + plotH / 2} textAnchor="middle" className="text-xs font-semibold fill-slate-700 dark:fill-slate-300" transform={`rotate(-90, 14, ${pad.top + plotH / 2})`}>{yLabel}</text>
          {/* Points */}
          {points.map((p) => {
            const isHl = hl != null && p.rider.team === hl;
            const color = catFilter === "All" ? CATEGORY_COLORS[categoryColorIndex[p.category] ?? 0] : (isHl ? "#0ea5e9" : "#64748b");
            return (
              <circle
                key={p.rider.id}
                cx={toX(p.x)}
                cy={toY(p.y)}
                r={isHl ? 6 : 4}
                fill={color}
                stroke={isHl ? "#0369a1" : "rgba(255,255,255,0.8)"}
                strokeWidth={isHl ? 2.5 : 1}
                className="dark:stroke-slate-800"
              >
                <title>{p.rider.name} · {p.rider.team} · P{p.rider.place} · {xLabel}: {formatTime(p.x)} · {yLabel}: {formatTime(p.y)}</title>
              </circle>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        {catFilter === "All" && (
          <div className="flex flex-wrap gap-3">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Categories:</span>
            {Object.keys(grouped).map((cat, i) => (
              <span key={cat} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                <span className="text-slate-700 dark:text-slate-300">{cat}</span>
              </span>
            ))}
          </div>
        )}
        {hl && (
          <span className="text-sky-600 dark:text-sky-400 font-medium">
            Highlighted: {hl} (larger points)
          </span>
        )}
        <span className="text-slate-500 dark:text-slate-400">
          {points.length} riders · Hover a point for name, team, place, and times
        </span>
      </div>
    </div>
  );
}

export function SplitsTab({ raceName, filtered, splits, hl }: SplitsTabProps) {
  const [timingMode, setTimingMode] = useState<TimingMode>("sector");
  const [viewMode, setViewMode] = useState<ViewMode>("splits");

  const ridersWithSplits = useMemo(() => {
    if (!splits) return [];
    return filtered.filter((r) => splits.byRiderId[r.id] != null);
  }, [filtered, splits]);

  const grouped = useMemo(() => _.groupBy(ridersWithSplits, "categoryRaw"), [ridersWithSplits]);

  const segmentStatsPerSegment = useMemo(() => {
    if (!splits) return [];
    return splits.segmentLabels.map((_, segIdx) => {
      const values = ridersWithSplits
        .map((r) => getSegmentValues(splits, r.id, timingMode)[segIdx])
        .filter((v): v is number => v != null);
      return segmentStats(values.length ? values : []) ?? null;
    });
  }, [splits, ridersWithSplits, timingMode]);

  /** Per-category segment means (for vs-average: compare each rider to their category avg). */
  const segmentMeansByCategory = useMemo(() => {
    if (!splits) return {} as Record<string, (number | null)[]>;
    const out: Record<string, (number | null)[]> = {};
    Object.entries(grouped).forEach(([cat, riders]) => {
      const n = splits.segmentLabels.length;
      const means: (number | null)[] = [];
      for (let segIdx = 0; segIdx < n; segIdx++) {
        const values = riders
          .map((r) => getSegmentValues(splits, r.id, timingMode)[segIdx])
          .filter((v): v is number => v != null);
        const s = segmentStats(values.length ? values : []);
        means.push(s?.mean ?? null);
      }
      out[cat] = means;
    });
    return out;
  }, [splits, grouped, timingMode]);

  const histogramsPerSegment = useMemo(() => {
    if (!splits) return [];
    return splits.segmentLabels.map((_, segIdx) => {
      const values = ridersWithSplits
        .map((r) => getSegmentValues(splits, r.id, timingMode)[segIdx]);
      return histogram(values);
    });
  }, [splits, ridersWithSplits, timingMode]);

  if (!splits) {
    return (
      <div className="py-8 text-center text-slate-500 dark:text-slate-400">
        <p className="font-medium text-slate-700 dark:text-slate-300">{raceName}</p>
        <p className="mt-2">This race has no split timing data.</p>
      </div>
    );
  }

  const viewTabs: { id: ViewMode; label: string }[] = [
    { id: "splits", label: "Splits" },
    { id: "segment-stats", label: "Segment stats" },
    { id: "distribution", label: "Distribution" },
    { id: "vs-average", label: "Vs average" },
    { id: "correlation", label: "Correlation" },
  ];

  const timingExplanation =
    timingMode === "sector"
      ? "Sector = time in that segment only (e.g. L1-S2 is the interval from the previous mat to this mat). Good for “who was fast through this section?”"
      : "Chip = cumulative time at that split (total elapsed to that mat). Early slow/fast segments carry through—so colors show who’s ahead/behind on total time at each point, not segment-by-segment.";

  const viewExplanations: Record<ViewMode, string> = {
    splits: "Raw split times per rider. Each column is a timing segment; L1/L2/L3 and Total are from results.",
    "segment-stats": "Min, max, mean, median, and standard deviation for each segment across all filtered riders.",
    distribution: "Histogram of times per segment: how many riders fall in each time bucket. Shows spread and pacing patterns.",
    "vs-average": "Each cell = rider’s time minus their category average. Green = faster than category avg, red = slower. With Sector you see segment-by-segment; with Chip you see cumulative position at each mat.",
    correlation: "Scatter plot: each point is a rider; X and Y are two splits (or total). Trend line and r show how related they are.",
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{raceName}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Timing:</span>
          <button
            type="button"
            onClick={() => setTimingMode("sector")}
            className={`px-2 py-1 text-xs rounded ${timingMode === "sector" ? "bg-sky-500 text-white" : "bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300"}`}
          >
            Sector
          </button>
          <button
            type="button"
            onClick={() => setTimingMode("chip")}
            className={`px-2 py-1 text-xs rounded ${timingMode === "chip" ? "bg-sky-500 text-white" : "bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300"}`}
          >
            Chip
          </button>
        </div>
        <div className="flex gap-1 border border-slate-200 dark:border-slate-600 rounded overflow-hidden">
          {viewTabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setViewMode(id)}
              className={`px-3 py-1.5 text-xs font-medium ${viewMode === id ? "bg-slate-700 dark:bg-slate-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
        <p className="font-medium text-slate-700 dark:text-slate-200 mb-1">Using: {timingMode === "sector" ? "Sector" : "Chip"}</p>
        <p className="mb-1">{timingExplanation}</p>
        <p className="font-medium text-slate-700 dark:text-slate-200 mt-1.5 mb-0.5">View: {viewTabs.find((t) => t.id === viewMode)?.label}</p>
        <p>{viewExplanations[viewMode]}</p>
      </div>

      {viewMode === "splits" && (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, riders]) => (
            <div key={cat}>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                {cat} <span className="text-slate-400 dark:text-slate-500 font-normal text-xs">({riders.length})</span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-600">
                      <th className="py-1 px-1 text-left sticky left-0 bg-slate-50 dark:bg-slate-900">P</th>
                      <th className="py-1 px-1 text-left sticky left-8 bg-slate-50 dark:bg-slate-900">Name</th>
                      <th className="py-1 px-1 text-left max-w-32 truncate">Team</th>
                      {splits.segmentLabels.map((l) => (
                        <th key={l} className="py-1 px-1 text-right whitespace-nowrap">{l}</th>
                      ))}
                      <th className="py-1 px-1 text-right">L1</th>
                      <th className="py-1 px-1 text-right">L2</th>
                      <th className="py-1 px-1 text-right">L3</th>
                      <th className="py-1 px-1 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riders.map((r) => {
                      const vals = getSegmentValues(splits, r.id, timingMode);
                      const isHl = hl != null && r.team === hl;
                      return (
                        <tr
                          key={r.id}
                          className={`border-b border-slate-100 dark:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 ${isHl ? "bg-sky-100/60 dark:bg-sky-900/40" : ""}`}
                        >
                          <td className="py-1 px-1 font-mono sticky left-0 bg-inherit">{r.place}</td>
                          <td className={`py-1 px-1 font-medium truncate max-w-32 bg-inherit ${isHl ? "text-sky-600 dark:text-sky-400" : "text-slate-800 dark:text-slate-200"}`} title={r.name}>{r.name}</td>
                          <td className="py-1 px-1 truncate max-w-32 text-slate-500 dark:text-slate-400" title={r.team}>{r.team || "—"}</td>
                          {vals.map((v, i) => (
                            <td key={i} className="py-1 px-1 text-right font-mono text-slate-600 dark:text-slate-400">
                              {v != null ? formatTime(v) : "—"}
                            </td>
                          ))}
                          <td className="py-1 px-1 text-right font-mono text-slate-500">{formatTime(r.lap1)}</td>
                          <td className="py-1 px-1 text-right font-mono text-slate-500">{formatTime(r.lap2)}</td>
                          <td className="py-1 px-1 text-right font-mono text-slate-500">{formatTime(r.lap3)}</td>
                          <td className="py-1 px-1 text-right font-mono font-medium text-slate-800 dark:text-slate-200">{formatTime(r.totalTime)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === "segment-stats" && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-600">
                <th className="py-1 px-2 text-left">Segment</th>
                <th className="py-1 px-2 text-right">Count</th>
                <th className="py-1 px-2 text-right">Min</th>
                <th className="py-1 px-2 text-right">Max</th>
                <th className="py-1 px-2 text-right">Mean</th>
                <th className="py-1 px-2 text-right">Median</th>
                <th className="py-1 px-2 text-right">Std</th>
              </tr>
            </thead>
            <tbody>
              {splits.segmentLabels.map((label, i) => {
                const s = segmentStatsPerSegment[i];
                return (
                  <tr key={label} className="border-b border-slate-100 dark:border-slate-700">
                    <td className="py-1 px-2 font-medium text-slate-800 dark:text-slate-200">{label}</td>
                    <td className="py-1 px-2 text-right font-mono text-slate-600 dark:text-slate-400">{s?.count ?? "—"}</td>
                    <td className="py-1 px-2 text-right font-mono text-slate-600 dark:text-slate-400">{s != null ? formatTime(s.min) : "—"}</td>
                    <td className="py-1 px-2 text-right font-mono text-slate-600 dark:text-slate-400">{s != null ? formatTime(s.max) : "—"}</td>
                    <td className="py-1 px-2 text-right font-mono text-slate-600 dark:text-slate-400">{s != null ? formatTime(s.mean) : "—"}</td>
                    <td className="py-1 px-2 text-right font-mono text-slate-600 dark:text-slate-400">{s != null ? formatTime(s.median) : "—"}</td>
                    <td className="py-1 px-2 text-right font-mono text-slate-500 dark:text-slate-500">{s != null ? formatTime(s.std) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === "distribution" && (
        <div className="space-y-6">
          {splits.segmentLabels.map((label, segIdx) => {
            const hist = histogramsPerSegment[segIdx];
            if (!hist || hist.buckets.every((b) => b === 0)) return null;
            const maxCount = Math.max(...hist.buckets);
            return (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {formatTime(hist.min)} – {formatTime(hist.max)} ({hist.buckets.reduce((a, b) => a + b, 0)} riders)
                  </span>
                </div>
                <div className="flex items-end gap-0.5 h-16">
                  {hist.buckets.map((count, i) => (
                    <div
                      key={i}
                      className="flex-1 min-w-[4px] bg-sky-500 dark:bg-sky-600 rounded-t transition-opacity hover:opacity-90"
                      style={{ height: maxCount > 0 ? `${(count / maxCount) * 100}%` : 0 }}
                      title={`${formatTime(hist.min + i * hist.step)}–${formatTime(hist.min + (i + 1) * hist.step)}: ${count}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "vs-average" && (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, riders]) => {
            const categoryMeans = segmentMeansByCategory[cat] ?? [];
            return (
              <div key={cat}>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                  {cat} — vs category segment average ({timingMode})
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Green = faster than category average, red = slower.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-600">
                        <th className="py-1 px-1 text-left sticky left-0 bg-slate-50 dark:bg-slate-900">P</th>
                        <th className="py-1 px-1 text-left sticky left-8 bg-slate-50 dark:bg-slate-900">Name</th>
                        <th className="py-1 px-1 text-left max-w-32 truncate">Team</th>
                        {splits.segmentLabels.map((l) => (
                          <th key={l} className="py-1 px-1 text-right whitespace-nowrap">{l}</th>
                        ))}
                      </tr>
                      <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/80">
                        <td colSpan={3} className="py-1 px-1 font-medium">Category avg</td>
                        {categoryMeans.map((avg, i) => (
                          <td key={i} className="py-1 px-1 text-right font-mono">
                            {avg != null ? formatTime(avg) : "—"}
                          </td>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {riders.map((r) => {
                        const vals = getSegmentValues(splits, r.id, timingMode);
                        const isHl = hl != null && r.team === hl;
                        return (
                          <tr
                            key={r.id}
                            className={`border-b border-slate-100 dark:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 ${isHl ? "bg-sky-100/60 dark:bg-sky-900/40" : ""}`}
                          >
                            <td className="py-1 px-1 font-mono sticky left-0 bg-inherit">{r.place}</td>
                            <td className={`py-1 px-1 font-medium truncate max-w-32 bg-inherit ${isHl ? "text-sky-600 dark:text-sky-400" : "text-slate-800 dark:text-slate-200"}`}>{r.name}</td>
                            <td className="py-1 px-1 truncate max-w-32 text-slate-500 dark:text-slate-400">{r.team || "—"}</td>
                            {vals.map((v, i) => {
                              const avg = categoryMeans[i] ?? null;
                              const delta = v != null && avg != null ? v - avg : null;
                              let cellClass = "py-1 px-1 text-right font-mono ";
                              if (delta != null) {
                                if (delta < 0) cellClass += "text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-900/30";
                                else if (delta > 0) cellClass += "text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-900/30";
                                else cellClass += "text-slate-500 dark:text-slate-400";
                              } else cellClass += "text-slate-400 dark:text-slate-500";
                              return (
                                <td key={i} className={cellClass} title={delta != null ? `${delta >= 0 ? "+" : ""}${formatTime(delta)} vs cat avg` : ""}>
                                  {delta != null ? (delta >= 0 ? "+" : "") + formatTime(delta) : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "correlation" && (
        <CorrelationScatter
          splits={splits}
          grouped={grouped}
          ridersWithSplits={ridersWithSplits}
          timingMode={timingMode}
          hl={hl}
        />
      )}
    </div>
  );
}
