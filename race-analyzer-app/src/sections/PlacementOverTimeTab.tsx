import _ from "lodash";
import { useMemo } from "react";
import type { Rider } from "../types";
import type { RaceOption } from "../utils/races";
import { Filters } from "../components/Filters";
import { regionTextClass } from "../utils/regionStyles";

const REGIONS = ["North", "Central", "South", "Other"];

interface PlacementOverTimeTabProps {
  filtered: Rider[];
  races: number[];
  raceOptions: RaceOption[];
  fR: string;
  fT: string;
  fC: string;
  fRace: string;
  fSchool: string;
  teams: string[];
  cats: string[];
  hl: string | null;
  onFR: (v: string) => void;
  onFT: (v: string) => void;
  onFC: (v: string) => void;
  onFRace: (v: string) => void;
  onFSchool: (v: string) => void;
  onHl: (v: string | null) => void;
}

function riderKey(r: Rider) {
  return `${r.name}|${r.team}`;
}

/** Cubic Bezier path with flat (horizontal) tangents at each point */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < rest.length; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const dx = (p1.x - p0.x) / 3;
    const c0 = { x: p0.x + dx, y: p0.y };
    const c1 = { x: p1.x - dx, y: p1.y };
    d += ` C ${c0.x} ${c0.y} ${c1.x} ${c1.y} ${p1.x} ${p1.y}`;
  }
  return d;
}

export function PlacementOverTimeTab({
  filtered,
  races,
  raceOptions,
  fR,
  fT,
  fC,
  fRace,
  fSchool,
  teams,
  cats,
  hl,
  onFR,
  onFT,
  onFC,
  onFRace,
  onFSchool,
  onHl,
}: PlacementOverTimeTabProps) {
  const raceOrder = useMemo(() => _.sortBy(races), [races]);
  const raceIdToIndex = useMemo(() => {
    const m: Record<number, number> = {};
    raceOrder.forEach((id, i) => { m[id] = i; });
    return m;
  }, [raceOrder]);

  const { series, maxPlace, raceNames } = useMemo(() => {
    const data = fC !== "All" ? filtered : [];
    const byRace = _.groupBy(data, "race");
    const raceNames = raceOrder.map((id) => raceOptions.find((r) => r.id === id)?.name ?? `Race ${id}`);
    let maxPlace = 0;
    const keyToPoints = new Map<string, { name: string; team: string; region: string; points: { x: number; y: number; raceId: number }[] }>();
    raceOrder.forEach((raceId) => {
      const riders = _.sortBy((byRace[raceId] ?? []).filter((r) => r.totalTime != null), "place");
      riders.forEach((r, idx) => {
        const place = idx + 1;
        if (place > maxPlace) maxPlace = place;
        const key = riderKey(r);
        const raceIdx = raceIdToIndex[raceId] ?? 0;
        if (!keyToPoints.has(key)) {
          keyToPoints.set(key, { name: r.name, team: r.team, region: r.region, points: [] });
        }
        keyToPoints.get(key)!.points.push({ x: raceIdx, y: place, raceId });
      });
    });
    const series = Array.from(keyToPoints.entries())
      .map(([key, v]) => ({ key, ...v }))
      .filter((s) => s.points.length >= 2)
      .sort((a, b) => {
        const aAvg = _.meanBy(a.points, "y");
        const bAvg = _.meanBy(b.points, "y");
        return aAvg - bAvg;
      });
    return { series, maxPlace, raceNames };
  }, [filtered, fC, raceOrder, raceIdToIndex, raceOptions]);

  const chartWidth = Math.max(400, raceOrder.length * 80);
  const chartHeight = 320;
  const padding = { top: 20, right: 20, bottom: 40, left: 44 };
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  const xScale = (raceIndex: number) => padding.left + (raceIndex / Math.max(1, raceOrder.length - 1)) * innerW;
  const yScale = (place: number) => {
    if (maxPlace <= 1) return padding.top + innerH / 2;
    return padding.top + ((place - 1) / (maxPlace - 1)) * innerH;
  };

  const pathPoints = (pts: { x: number; y: number }[]) =>
    pts.map((p) => ({ x: xScale(p.x), y: yScale(p.y) }));

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
      <Filters
        regions={REGIONS}
        teams={teams}
        cats={cats}
        races={races}
        fSchool={fSchool}
        fR={fR}
        fT={fT}
        fC={fC}
        fRace={fRace}
        hl={hl}
        onFSchool={onFSchool}
        onFR={onFR}
        onFT={onFT}
        onFC={onFC}
        onFRace={onFRace}
        onHl={onHl}
      />
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
        One line per rider (same name + team across races). Y = finish place (1 at top). Pick a category to compare placement over time.
      </p>
      {raceOrder.length < 2 ? (
        <div className="text-center py-10 text-slate-400 dark:text-slate-500">
          Load &quot;All races (cumulative)&quot; and select a category to see placement over time.
        </div>
      ) : fC === "All" ? (
        <div className="text-center py-10 text-slate-400 dark:text-slate-500">
          Select a single category (e.g. JV Boys) in the filters above to see placement over time.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[500px] bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600 p-4">
            <svg width={chartWidth} height={chartHeight} className="overflow-visible">
              {/* Y grid & labels */}
              {maxPlace > 0 && (
                <>
                  {[1, Math.ceil(maxPlace / 2), maxPlace].filter((v, i, a) => a.indexOf(v) === i).map((place) => (
                    <g key={place}>
                      <line
                        x1={padding.left}
                        y1={yScale(place)}
                        x2={padding.left + innerW}
                        y2={yScale(place)}
                        stroke="currentColor"
                        strokeOpacity={0.12}
                        strokeDasharray="2 2"
                      />
                      <text
                        x={padding.left - 6}
                        y={yScale(place)}
                        textAnchor="end"
                        dominantBaseline="middle"
                        className="fill-slate-400 dark:fill-slate-500 text-[10px]"
                      >
                        {place}
                      </text>
                    </g>
                  ))}
                </>
              )}
              {/* X labels */}
              {raceOrder.map((id, i) => (
                <text
                  key={id}
                  x={xScale(i)}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[10px]"
                  style={{ transform: "rotate(-20deg)", transformOrigin: `${xScale(i)}px ${chartHeight - 8}px` }}
                >
                  {(raceNames[i] ?? "").slice(0, 15)}
                </text>
              ))}
              {/* Lines */}
              {series.map((s, i) => {
                const pts = pathPoints(s.points.map((p) => ({ x: raceIdToIndex[p.raceId] ?? 0, y: p.y })));
                const pathD = smoothPath(pts);
                const isHl = hl != null && s.team === hl;
                const color = isHl ? "rgb(14, 165, 233)" : colors[i % colors.length];
                const strokeW = isHl ? 2.5 : 1.5;
                return (
                  <g key={s.key}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke={color}
                      strokeWidth={strokeW}
                      strokeOpacity={isHl ? 1 : 0.85}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {pts.map((p, j) => (
                      <circle
                        key={j}
                        cx={p.x}
                        cy={p.y}
                        r={isHl ? 4 : 3}
                        fill={color}
                        stroke={isHl ? "white" : "transparent"}
                        strokeWidth={1}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] max-h-32 overflow-y-auto">
              {series.slice(0, 40).map((s, i) => {
                const isHl = hl != null && s.team === hl;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => onHl(isHl ? null : s.team)}
                    className={"flex items-center gap-1.5 truncate " + (isHl ? "ring-1 ring-sky-400 rounded px-1" : "")}
                  >
                    <span
                      className="shrink-0 w-2 h-2 rounded-full"
                      style={{ backgroundColor: isHl ? "rgb(14, 165, 233)" : colors[i % colors.length] }}
                    />
                    <span className={"truncate " + (isHl ? "font-bold text-sky-600 dark:text-sky-400" : "")}>
                      {s.name}
                    </span>
                    <span className={"truncate max-w-20 " + regionTextClass(s.region)}>{s.team}</span>
                  </button>
                );
              })}
              {series.length > 40 && (
                <span className="text-slate-400 dark:text-slate-500">+{series.length - 40} more</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
