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

/** MS rider ran the longer HS course in this race (e.g. Grade 8 Level 3 at Finals). Detected by category. */
function isMsRiderOnHSCourse(r: Rider): boolean {
  const raw = (r.categoryRaw ?? "").toLowerCase();
  return raw.includes("level 3") || raw.includes("level3");
}

/** When true, Level 3 MS riders in this race ran the HS course (longer times); rank them first, then other MS. */
function msLevel3RanHSCourse(riders: Rider[]): boolean {
  const level3 = riders.filter(isMsRiderOnHSCourse);
  const other = riders.filter((r) => !isMsRiderOnHSCourse(r));
  if (level3.length === 0 || other.length === 0) return false;
  const mean3 = _.mean(level3.map((r) => r.totalTime!));
  const meanOther = _.mean(other.map((r) => r.totalTime!));
  return mean3 != null && meanOther != null && mean3 >= meanOther * 1.15;
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

export type SchoolLevelFilter = "all" | "ms" | "hs";

export interface RiderProgressionPoint {
  raceIndex: number;
  raceId: number;
  year: number;
  raceName: string;
  categoryRaw: string;
  totalPlace: number;
  /** Riders in same pool (all MS or all HS) in this race. */
  fieldSize: number;
}

export interface RiderProgressionSeries {
  key: string;
  name: string;
  team: string;
  region: string;
  points: RiderProgressionPoint[];
  improvement: number;
}

/** Number of races both series have in common (by raceId). */
function overlapCount(a: RiderProgressionSeries, b: RiderProgressionSeries): number {
  const bIds = new Set(b.points.map((p) => p.raceId));
  return a.points.filter((p) => bIds.has(p.raceId)).length;
}

/** Min overlapping races to be in the selected rider's cohort. 1 = any overlap, 2 = at least 2 races together. */
const COHORT_MIN_OVERLAP = 1;

export function ProgressionTab({ rawData, raceOptions }: ProgressionTabProps) {
  const [schoolLevelFilter, setSchoolLevelFilter] = useState<SchoolLevelFilter>("all");
  const [teamFilter, setTeamFilter] = useState<string>("All");
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set()); // empty = all years
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);
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

    const finishedAll = rawData.filter((r) => r.totalTime != null && (r.name ?? "").trim());
    const finished =
      schoolLevelFilter === "all"
        ? finishedAll
        : finishedAll.filter((r) => getSchoolLevel(r) === schoolLevelFilter);

    const raceCatToPlace: Record<string, Map<string, number>> = {};
    const byRaceMs = _.groupBy(finishedAll.filter((r) => getSchoolLevel(r) === "ms"), "race");
    const byRaceHsNonVarsity = _.groupBy(
      finishedAll.filter((r) => getSchoolLevel(r) === "hs" && r.category !== "varsity"),
      "race"
    );
    Object.entries(byRaceMs).forEach(([raceId, riders]) => {
      const catKey = `${raceId}|ms`;
      const placeMap = new Map<string, number>();
      const orderForPlace =
        msLevel3RanHSCourse(riders)
          ? [
              ..._.sortBy(riders.filter(isMsRiderOnHSCourse), (r) => r.totalTime!),
              ..._.sortBy(riders.filter((r) => !isMsRiderOnHSCourse(r)), (r) => r.totalTime!),
            ]
          : _.sortBy(riders, (r) => r.totalTime!);
      orderForPlace.forEach((r, i) => placeMap.set(riderKey(r), i + 1));
      raceCatToPlace[catKey] = placeMap;
    });
    Object.entries(byRaceHsNonVarsity).forEach(([raceId, riders]) => {
      const catKey = `${raceId}|hs-nonvarsity`;
      const placeMap = new Map<string, number>();
      _.sortBy(riders, (r) => r.totalTime!).forEach((r, i) => placeMap.set(riderKey(r), i + 1));
      raceCatToPlace[catKey] = placeMap;
    });

    const keyToPoints = new Map<string, RiderProgressionPoint[]>();
    finished.forEach((r) => {
      const raceIndex = raceIdToIndex[r.race] ?? -1;
      if (raceIndex < 0) return;
      const levelKey = getSchoolLevel(r) === "ms" ? `${r.race}|ms` : `${r.race}|hs-nonvarsity`;
      const placeMap = raceCatToPlace[levelKey];
      const totalPlace = placeMap?.get(riderKey(r));
      if (totalPlace == null) return;
      const opt = optionsByYear.find((o) => o.id === r.race);
      const key = riderKey(r);
      if (!keyToPoints.has(key)) keyToPoints.set(key, []);
      keyToPoints.get(key)!.push({
        raceIndex,
        raceId: r.race,
        year: opt?.year ?? 0,
        raceName: opt?.name ?? "",
        categoryRaw: r.categoryRaw,
        totalPlace,
        fieldSize: placeMap.size,
      });
    });

    const series: RiderProgressionSeries[] = Array.from(keyToPoints.entries())
      .filter(([, pts]) => pts.length >= 2)
      .map(([key, points]) => {
        const sorted = _.sortBy(points, "raceIndex");
        const first = sorted[0]!;
        const last = sorted[sorted.length - 1]!;
        const improvement = first.totalPlace - last.totalPlace;
        const nameRider = rawData.find((r) => riderKey(r) === key);
        const name = nameRider?.name ?? "";
        const team = last ? (rawData.find((r) => r.race === last.raceId && riderKey(r) === key)?.team ?? "") : (nameRider?.team ?? "");
        const region = nameRider?.region ?? "Other";
        return { key, name, team, region, points: sorted, improvement };
      });

    const teams = _.sortBy(_.uniq(series.map((s) => s.team)).filter(Boolean));

    return { series, raceOrder, shortLabels, teams };
  }, [rawData, raceOptions, effectiveYears, schoolLevelFilter]);

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

  /** When exactly one rider is selected: cohort = riders who share at least COHORT_MIN_OVERLAP races; cohort avg per race (excluding rider); contribution vs cohort. */
  const singleRiderCohort = useMemo(() => {
    if (selectedKeys.size !== 1) return null;
    const selected = filteredSeries.find((s) => selectedKeys.has(s.key));
    if (!selected) return null;
    const cohortRest = filteredSeries.filter(
      (s) => s.key !== selected.key && overlapCount(selected, s) >= COHORT_MIN_OVERLAP
    );
    if (cohortRest.length === 0) return { selected, cohortRest, cohortAvgByRaceId: null, cohortImprovement: 0, contribution: 0 };
    const cohortAvgByRaceId = new Map<number, number>();
    selected.points.forEach((p) => {
      const places = cohortRest
        .map((s) => s.points.find((pt) => pt.raceId === p.raceId)?.totalPlace)
        .filter((n): n is number => n != null);
      if (places.length > 0) cohortAvgByRaceId.set(p.raceId, _.mean(places));
    });
    const firstRaceId = selected.points[0]!.raceId;
    const lastRaceId = selected.points[selected.points.length - 1]!.raceId;
    const firstAvg = cohortAvgByRaceId.get(firstRaceId) ?? 0;
    const lastAvg = cohortAvgByRaceId.get(lastRaceId) ?? 0;
    const cohortImprovement = firstAvg - lastAvg;
    const contribution = selected.improvement - cohortImprovement;
    return {
      selected,
      cohortRest,
      cohortAvgByRaceId,
      cohortImprovement,
      contribution,
    };
  }, [filteredSeries, selectedKeys]);

  const chartHeight = 380;
  const padding = { top: 24, right: 24, bottom: 48, left: 52 };
  const innerW = Math.max(0, chartWidth - padding.left - padding.right);
  const innerH = chartHeight - padding.top - padding.bottom;

  const listSorted = useMemo(() => {
    const byImprovement = (a: RiderProgressionSeries, b: RiderProgressionSeries) => b.improvement - a.improvement;
    if (selectedKeys.size === 0) return _.sortBy(listFiltered, (s) => -s.improvement);
    const selected = listFiltered.filter((s) => selectedKeys.has(s.key));
    const rest = listFiltered.filter((s) => !selectedKeys.has(s.key));
    return [...selected.sort(byImprovement), ...rest.sort(byImprovement)];
  }, [listFiltered, selectedKeys]);

  const showLegend = selectedKeys.size > 0 && selectedKeys.size < filteredSeries.length;

  const { maxY, yTicks } = useMemo(() => {
    if (seriesToShow.length === 0) return { maxY: 1, yTicks: [1] };
    const allPlaces = seriesToShow.flatMap((s) => s.points.map((p) => p.totalPlace));
    const maxPlace = Math.max(1, _.max(allPlaces) ?? 1);
    const ticks = [1];
    if (maxPlace > 1) {
      const step = Math.max(1, Math.ceil(maxPlace / 5));
      for (let t = step; t < maxPlace; t += step) ticks.push(t);
      ticks.push(maxPlace);
    }
    return { maxY: maxPlace, yTicks: _.uniq(ticks).sort((a, b) => a - b) };
  }, [seriesToShow]);

  const xScale = (raceIndex: number) =>
    padding.left + (raceIndex / Math.max(1, raceOrder.length - 1)) * innerW;
  const yScalePlace = (place: number) =>
    padding.top + (maxY <= 1 ? 0 : (place - 1) / (maxY - 1) * innerH);

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
  const colorForKey = (key: string) => {
    const idx = filteredSeries.findIndex((s) => s.key === key);
    return idx >= 0 ? colors[idx % colors.length] : "var(--tw-slate-400)";
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <label className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
          School level
          <select
            value={schoolLevelFilter}
            onChange={(e) => setSchoolLevelFilter(e.target.value as SchoolLevelFilter)}
            className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1.5 text-xs text-slate-900 min-w-[140px]"
          >
            <option value="all">All</option>
            <option value="ms">Middle School</option>
            <option value="hs">High School</option>
          </select>
        </label>
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
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Riders matched by name only. {filteredSeries.length} riders with 2+ races.
          {selectedKeys.size > 0 && ` Showing ${selectedKeys.size} selected in graph.`}
        </span>
      </div>

      <div className="mb-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Total Placement &amp; Cohort Progression</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Your place when all middle school riders (or all high school, excluding varsity) are sorted by total time in that race. One list per race; lower = better. When Grade 8 Level 3 runs the HS course (e.g. Finals), they are ranked by time but placed ahead of all other MS riders. Improvement = first-race place minus last-race place (positive = you moved up).
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          <strong>Cohort</strong> = riders who raced at least one of the same races (tracked by name across years). Select one rider to see their cohort size and <strong>contribution</strong>: how much they improved vs the cohort average (positive = contributing up, negative = contributing down). At each race the cohort average uses only riders who ran that race.
        </p>
      </div>

      <div className="w-full">
        <div
          className="w-full bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600 p-4 relative"
          onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
        >
          {hoveredKey && (() => {
            const s = seriesToShow.find((x) => x.key === hoveredKey);
            if (!s) return null;
            const improved = s.improvement >= 0;
            const impStr = (s.improvement >= 0 ? "−" : "+") + Math.abs(Math.round(s.improvement));
            return (
              <div
                className="pointer-events-none fixed z-50 px-2 py-1.5 rounded bg-slate-800 dark:bg-slate-700 text-white text-xs shadow-lg border border-slate-600"
                style={{ left: tooltipPos.x + 12, top: tooltipPos.y + 12 }}
              >
                <div className="font-medium">{s.name} ({s.team})</div>
                <div className="text-slate-300 dark:text-slate-400">
                  {s.points.map((p) => p.totalPlace).join(" → ")}
                </div>
                <div className={improved ? "text-emerald-400" : "text-amber-400"}>
                  {improved ? "Improved " : ""}{impStr} vs first race
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
                  y1={yScalePlace(g)}
                  x2={padding.left + innerW}
                  y2={yScalePlace(g)}
                  stroke="currentColor"
                  strokeOpacity={0.12}
                  strokeDasharray="2 2"
                />
                <text
                  x={padding.left - 6}
                  y={yScalePlace(g)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px]"
                >
                  {g}
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
              Place (all MS or all HS)
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

            {/* Cohort average line (when one rider selected and cohort has others) */}
            {singleRiderCohort?.cohortAvgByRaceId && singleRiderCohort.cohortRest.length > 0 && (() => {
              const pts = singleRiderCohort.selected.points.map((p) => {
                const avg = singleRiderCohort.cohortAvgByRaceId.get(p.raceId);
                return avg != null ? { x: xScale(p.raceIndex), y: yScalePlace(avg) } : null;
              }).filter((p): p is { x: number; y: number } => p != null);
              if (pts.length < 2) return null;
              return (
                <g>
                  <path
                    d={smoothPath(pts)}
                    fill="none"
                    stroke="var(--tw-slate-400)"
                    strokeWidth={1.5}
                    strokeOpacity={0.8}
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <text x={padding.left + innerW - 2} y={pts[pts.length - 1]!.y} textAnchor="end" dominantBaseline="middle" className="fill-slate-400 text-[9px]">Cohort avg</text>
                </g>
              );
            })()}
            {/* Lines */}
            {seriesToShow.map((s) => {
              const pts = s.points.map((p) => ({ x: xScale(p.raceIndex), y: yScalePlace(p.totalPlace) }));
              const pathD = smoothPath(pts);
              const isHovered = hoveredKey === s.key;
              const color = isHovered ? "rgb(14, 165, 233)" : colorForKey(s.key);
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
              {seriesToShow.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span
                    className="w-3 h-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: colorForKey(s.key) }}
                  />
                  <span className="truncate max-w-[120px]" title={s.name}>{s.name}</span>
                </span>
              ))}
            </div>
          )}

          {singleRiderCohort && (() => {
            const { selected, cohortRest, cohortAvgByRaceId, cohortImprovement, contribution } = singleRiderCohort;
            const hasCohort = cohortRest.length > 0 && cohortAvgByRaceId != null;
            const contributingUp = contribution > 0;
            const contributingDown = contribution < 0;
            const w = Math.max(200, Math.min(400, innerW));
            const h = 72;
            const pad = { t: 6, r: 8, b: 18, l: 32 };
            const iw = w - pad.l - pad.r;
            const ih = h - pad.t - pad.b;
            const perRace = selected.points.map((p) => {
              const avg = cohortAvgByRaceId?.get(p.raceId);
              const ahead = avg != null ? avg - p.totalPlace : null;
              return { raceIndex: p.raceIndex, place: p.totalPlace, avg: avg ?? 0, ahead };
            });
            const maxPlace = Math.max(maxY, ...perRace.map((r) => r.avg));
            const yPlace = (pl: number) => pad.t + (pl - 1) / Math.max(1, maxPlace - 1) * ih;
            const xRace = (i: number) => pad.l + (i / Math.max(1, perRace.length - 1)) * iw;
            const riderPath = perRace.length ? "M " + perRace.map((r, i) => `${xRace(i)} ${yPlace(r.place)}`).join(" L ") : "";
            const avgPath = cohortAvgByRaceId && perRace.length ? "M " + perRace.map((r, i) => `${xRace(i)} ${yPlace(r.avg)}`).join(" L ") : "";
            return (
              <div className="mt-3 mb-3 p-3 rounded-lg border border-sky-200 dark:border-sky-700 bg-sky-50/50 dark:bg-sky-900/20">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Cohort: {selected.name}
                  {hasCohort ? ` vs ${cohortRest.length} rider${cohortRest.length !== 1 ? "s" : ""} who raced at least one of the same races` : " — no other riders who raced any of the same races"}
                </div>
                {!hasCohort && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Contribution is shown when at least one other rider raced any of the same races as this rider.</p>
                )}
                {hasCohort && (
                <>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "text-sm font-medium " +
                        (contributingUp
                          ? "text-emerald-600 dark:text-emerald-400"
                          : contributingDown
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-slate-600 dark:text-slate-400")
                      }
                    >
                      {contributingUp
                        ? "Contributing up"
                        : contributingDown
                          ? "Contributing down"
                          : "In line with cohort"}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 text-xs">
                      {contribution > 0 ? "+" : ""}{contribution.toFixed(1)} vs cohort avg
                      (rider improved {selected.improvement > 0 ? "−" : "+"}{Math.abs(selected.improvement)} places; cohort avg improved {cohortImprovement > 0 ? "−" : "+"}{Math.abs(cohortImprovement).toFixed(1)} places)
                    </span>
                  </div>
                  {cohortAvgByRaceId && (
                    <div className="flex items-baseline gap-2 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      {selected.points.map((p, i) => {
                        const avg = cohortAvgByRaceId.get(p.raceId);
                        const ahead = avg != null ? avg - p.totalPlace : null;
                        return (
                          <span key={i} title={`${p.raceName}: you ${p.totalPlace}, cohort avg ${avg?.toFixed(1) ?? "—"}`}>
                            {shortLabels[p.raceIndex]}: {p.totalPlace} vs {avg != null ? avg.toFixed(1) : "—"}
                            {ahead != null && ahead !== 0 && (
                              <span className={ahead > 0 ? "text-emerald-600" : "text-amber-600"}>
                                {" "}({ahead > 0 ? "ahead" : "behind"} {Math.abs(ahead).toFixed(1)})
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                {perRace.length > 0 && cohortAvgByRaceId && (
                  <div className="mt-2">
                    <svg width={w} height={h} className="overflow-visible">
                      <path d={avgPath} fill="none" stroke="var(--tw-slate-400)" strokeWidth={1} strokeOpacity={0.7} strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />
                      <path d={riderPath} fill="none" stroke="rgb(14, 165, 233)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      {perRace.map((r, i) => (
                        <circle key={i} cx={xRace(i)} cy={yPlace(r.place)} r={2.5} fill="rgb(14, 165, 233)" />
                      ))}
                    </svg>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Solid = your place; dashed = cohort average place (lower = better).
                    </p>
                  </div>
                )}
                </>
                )}
              </div>
            );
          })()}

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
                const color = colorForKey(s.key);
                const improved = s.improvement >= 0;
                const impStr = (s.improvement >= 0 ? "−" : "+") + Math.abs(Math.round(s.improvement));
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
                      {impStr}
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
