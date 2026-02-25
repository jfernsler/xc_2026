import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { MapData, MapCourse } from "../types";
import {
  fetchMapByEventId,
  orderCoursesForDisplay,
  cumulativeDistancesMiles,
  distanceToCoord,
  svgPointToDistance,
  elevationAtDistance,
} from "../utils/map";

interface MapTabProps {
  eventId: number | null;
  raceName: string;
}

function boundsAndScale(coords: [number, number][]) {
  if (!coords.length) {
    return { lngMin: 0, lngMax: 1, latMin: 0, latMax: 1, lngSpan: 1, latSpan: 1 };
  }
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const lngMin = Math.min(...lngs);
  const lngMax = Math.max(...lngs);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lngSpan = lngMax - lngMin || 0.0001;
  const latSpan = latMax - latMin || 0.0001;
  return { lngMin, lngMax, latMin, latMax, lngSpan, latSpan };
}

function courseToPath(coords: [number, number][], width: number, height: number): string {
  if (!coords.length) return "";
  const { lngMin, latMax, lngSpan, latSpan } = boundsAndScale(coords);
  const pad = 0.05;
  const scaleX = (width * (1 - 2 * pad)) / lngSpan;
  const scaleY = (height * (1 - 2 * pad)) / latSpan;
  const scale = Math.min(scaleX, scaleY);
  const ox = width * pad + (width * (1 - 2 * pad) - lngSpan * scale) / 2;
  const oy = height * pad;
  const x = (lng: number) => ox + (lng - lngMin) * scale;
  const y = (lat: number) => oy + (latMax - lat) * scale;
  return coords.map(([lng, lat], i) => `${i === 0 ? "M" : "L"} ${x(lng)} ${y(lat)}`).join(" ");
}

/** Mile (or km) markers to show; use same unit as data. */
function getMarkers(distMin: number, distMax: number, distanceUnit: string): number[] {
  const isMiles = distanceUnit === "mi";
  const step = isMiles ? 1 : 1;
  const markers: number[] = [];
  const start = Math.floor(distMin / step) * step;
  for (let d = start; d <= distMax + 0.001; d += step) {
    if (d >= distMin) markers.push(d);
  }
  return markers;
}

const MAP_WIDTH = 600;
const MAP_HEIGHT = 320;
const ELEV_WIDTH = 800;
const ELEV_HEIGHT = 140;

function CourseAndElevation({
  course,
  distanceUnit,
  elevationUnit,
}: {
  course: MapCourse;
  distanceUnit: string;
  elevationUnit: string;
}) {
  const coords = course.coordinates ?? [];
  const elevations = course.elevations ?? [];
  const path = useMemo(() => courseToPath(coords, MAP_WIDTH, MAP_HEIGHT), [coords]);
  const sameBounds = useMemo(() => boundsAndScale(coords), [coords]);
  const cumulMiles = useMemo(() => cumulativeDistancesMiles(coords), [coords]);
  const totalDist = cumulMiles.length > 0 ? cumulMiles[cumulMiles.length - 1]! : 0;

  const project = useCallback(
    (lng: number, lat: number) => {
      const pad = 0.05;
      const scaleX = (MAP_WIDTH * (1 - 2 * pad)) / sameBounds.lngSpan;
      const scaleY = (MAP_HEIGHT * (1 - 2 * pad)) / sameBounds.latSpan;
      const scale = Math.min(scaleX, scaleY);
      const ox = MAP_WIDTH * pad + (MAP_WIDTH * (1 - 2 * pad) - sameBounds.lngSpan * scale) / 2;
      const oy = MAP_HEIGHT * pad;
      return {
        x: ox + (lng - sameBounds.lngMin) * scale,
        y: oy + (sameBounds.latMax - lat) * scale,
      };
    },
    [sameBounds]
  );

  const [hoverDistance, setHoverDistance] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const elevRef = useRef<HTMLDivElement>(null);

  const distMin = elevations.length ? elevations[0]![0] : 0;
  const distMax = elevations.length ? elevations[elevations.length - 1]![0] : totalDist;
  const mileMarkers = useMemo(
    () => getMarkers(distMin, distMax, distanceUnit),
    [distMin, distMax, distanceUnit]
  );

  const elevData = useMemo(() => {
    if (!elevations.length) return { path: "", distMin: 0, distMax: 0, spanD: 1, spanE: 1, elevMin: 0, elevMax: 0, x: (_: number) => 0, y: (_: number) => 0 };
    const dists = elevations.map((e) => e[0]);
    const elevs = elevations.map((e) => e[1]);
    const dMin = Math.min(...dists);
    const dMax = Math.max(...dists);
    const eMin = Math.min(...elevs);
    const eMax = Math.max(...elevs);
    const spanD = dMax - dMin || 1;
    const spanE = eMax - eMin || 1;
    const pad = 0.05;
    const w = ELEV_WIDTH * (1 - 2 * pad);
    const h = ELEV_HEIGHT * (1 - 2 * pad);
    return {
      path: "",
      distMin: dMin,
      distMax: dMax,
      spanD,
      spanE,
      elevMin: eMin,
      elevMax: eMax,
      x: (d: number) => ELEV_WIDTH * pad + ((d - dMin) / spanD) * w,
      y: (e: number) => ELEV_HEIGHT * (1 - pad) - ((e - eMin) / spanE) * h,
    };
  }, [elevations]);

  const elevPath = useMemo(() => {
    if (!elevations.length) return "";
    return elevations
      .map(([d, e], i) => `${i === 0 ? "M" : "L"} ${elevData.x(d)} ${elevData.y(e)}`)
      .join(" ");
  }, [elevations, elevData]);

  const handleCourseMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || !cumulMiles.length) return;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const scaleX = vb.width / rect.width;
      const scaleY = vb.height / rect.height;
      const svgX = (e.clientX - rect.left) * scaleX;
      const svgY = (e.clientY - rect.top) * scaleY;
      const dist = svgPointToDistance(svgX, svgY, coords, cumulMiles, project);
      setHoverDistance(dist ?? null);
    },
    [coords, cumulMiles, project]
  );

  const handleCourseMouseLeave = useCallback(() => setHoverDistance(null), []);

  const handleElevationMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = elevRef.current;
      if (!el || !elevations.length) return;
      const rect = el.getBoundingClientRect();
      const pad = 0.05;
      const innerLeft = pad * rect.width;
      const innerWidth = rect.width * (1 - 2 * pad);
      const x = e.clientX - rect.left - innerLeft;
      if (x < 0 || x > innerWidth) return;
      const frac = x / innerWidth;
      const d = elevData.distMin + frac * (elevData.distMax - elevData.distMin);
      setHoverDistance(d);
    },
    [elevations.length, elevData]
  );

  const hoverCoord = hoverDistance != null ? distanceToCoord(coords, hoverDistance, cumulMiles) : null;
  const hoverProjected = hoverCoord ? project(hoverCoord[0], hoverCoord[1]) : null;
  const hoverElev = hoverDistance != null ? elevationAtDistance(elevations, hoverDistance) : null;
  const hoverElevY = hoverElev != null ? elevData.y(hoverElev) : null;
  const hoverElevX = hoverDistance != null ? elevData.x(hoverDistance) : null;

  const timingPoints = course.timingPoints ?? [];

  return (
    <div className="w-full">
      <div
        className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-100 dark:bg-slate-800/50"
        onMouseLeave={handleCourseMouseLeave}
      >
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="block text-slate-700 dark:text-slate-300 cursor-crosshair"
          onMouseMove={handleCourseMouseMove}
        >
          <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {mileMarkers.map((mi) => {
            const pt = distanceToCoord(coords, mi, cumulMiles);
            if (!pt) return null;
            const { x, y } = project(pt[0], pt[1]);
            return (
              <g key={mi}>
                <circle cx={x} cy={y} r={4} fill="rgb(100 116 139)" stroke="white" strokeWidth={1} className="dark:stroke-slate-800" />
                <text x={x} y={y - 8} textAnchor="middle" className="fill-slate-600 dark:fill-slate-400 text-[10px] font-medium">
                  {mi}
                </text>
              </g>
            );
          })}
          {timingPoints.map((tp, i) => {
            const { x, y } = project(tp.lng, tp.lat);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={5}
                fill="rgb(14 165 233)"
                stroke="white"
                strokeWidth={1.5}
                className="dark:stroke-slate-800"
              />
            );
          })}
          {hoverProjected && (
            <circle
              cx={hoverProjected.x}
              cy={hoverProjected.y}
              r={6}
              fill="rgb(239 68 68)"
              stroke="white"
              strokeWidth={2}
              className="pointer-events-none dark:stroke-slate-800"
            />
          )}
        </svg>
      </div>

      {timingPoints.length > 0 && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          {timingPoints.length} timing point(s) · Blue = timing, Gray = mile markers
        </p>
      )}

      <div className="mt-4 w-full">
        <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
          Elevation ({elevationUnit}) vs distance ({distanceUnit}) — hover course or chart to sync
        </div>
        <div
          ref={elevRef}
          className="w-full border border-slate-200 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-800/30 overflow-hidden"
          onMouseMove={handleElevationMouseMove}
          onMouseLeave={handleCourseMouseLeave}
          style={{ height: ELEV_HEIGHT }}
        >
          <svg width="100%" height={ELEV_HEIGHT} viewBox={`0 0 ${ELEV_WIDTH} ${ELEV_HEIGHT}`} preserveAspectRatio="none" className="block cursor-crosshair">
            <path d={elevPath} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-sky-500 dark:text-sky-400" />
            {mileMarkers.map((mi) => {
              const x = elevData.x(mi);
              return (
                <line
                  key={mi}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={ELEV_HEIGHT}
                  stroke="rgb(148 163 184)"
                  strokeWidth={0.5}
                  className="dark:stroke-slate-500"
                />
              );
            })}
            {hoverElevX != null && hoverElevY != null && (
              <>
                <line
                  x1={hoverElevX}
                  y1={hoverElevY}
                  x2={hoverElevX}
                  y2={ELEV_HEIGHT}
                  stroke="rgb(239 68 68)"
                  strokeWidth={1}
                  className="pointer-events-none"
                />
                <circle cx={hoverElevX} cy={hoverElevY} r={5} fill="rgb(239 68 68)" stroke="white" strokeWidth={2} className="pointer-events-none" />
              </>
            )}
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          <span>{elevData.distMin.toFixed(2)}</span>
          {mileMarkers.slice(0, 5).map((mi) => (
            <span key={mi}>{mi} {distanceUnit}</span>
          ))}
          <span>{elevData.distMax.toFixed(2)} {distanceUnit}</span>
        </div>
      </div>
    </div>
  );
}

export function MapTab({ eventId, raceName }: MapTabProps) {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseIndex, setCourseIndex] = useState(0);

  useEffect(() => {
    if (eventId == null) {
      setMapData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchMapByEventId(eventId)
      .then((data) => {
        setMapData(data ?? null);
        if (data == null) setError("No map data for this race.");
        setCourseIndex(0);
      })
      .catch(() => setError("Failed to load map data."))
      .finally(() => setLoading(false));
  }, [eventId]);

  const orderedCourses = useMemo(
    () => (mapData ? orderCoursesForDisplay(mapData.courses) : []),
    [mapData]
  );
  const currentCourse = orderedCourses[courseIndex] ?? null;

  if (eventId == null) {
    return (
      <div className="py-8 text-center text-slate-500 dark:text-slate-400">
        Select a single race to view the course map.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-8 text-center text-slate-500 dark:text-slate-400">
        Loading map…
      </div>
    );
  }

  if (error || !mapData) {
    return (
      <div className="py-8 text-center text-slate-500 dark:text-slate-400">
        {error ?? "No map data for this race."}
      </div>
    );
  }

  if (orderedCourses.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500 dark:text-slate-400">
        No courses in map data.
      </div>
    );
  }

  return (
    <div className="py-4 w-full max-w-6xl">
      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">{mapData.eventName ?? raceName}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        North up · {mapData.distanceUnit} / {mapData.elevationUnit}
      </p>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">Course:</span>
        {orderedCourses.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCourseIndex(i)}
            className={
              "px-3 py-1.5 rounded text-xs font-medium " +
              (courseIndex === i
                ? "bg-sky-500 text-white dark:bg-sky-600"
                : "bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-300 dark:hover:bg-slate-500")
            }
          >
            {c.name === "HS" ? "High School" : c.name === "MS" ? "Middle School" : c.name}
          </button>
        ))}
      </div>

      {currentCourse && (
        <CourseAndElevation
          course={currentCourse}
          distanceUnit={mapData.distanceUnit}
          elevationUnit={mapData.elevationUnit}
        />
      )}
    </div>
  );
}
