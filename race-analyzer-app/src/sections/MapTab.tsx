import { useState, useEffect, useMemo } from "react";
import type { MapData, MapCourse } from "../types";
import { fetchMapByEventId, orderCoursesForDisplay } from "../utils/map";

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
  const y = (lat: number) => oy + (latMax - lat) * scale; // North up
  return coords.map(([lng, lat], i) => `${i === 0 ? "M" : "L"} ${x(lng)} ${y(lat)}`).join(" ");
}

function ElevationGraph({
  elevations,
  distanceUnit,
  elevationUnit,
  width,
  height,
}: {
  elevations: [number, number][];
  distanceUnit: string;
  elevationUnit: string;
  width: number;
  height: number;
}) {
  const { path, distMax, distMin } = useMemo(() => {
    if (!elevations.length) return { path: "", distMax: 0, distMin: 0 };
    const dists = elevations.map((e) => e[0]);
    const elevs = elevations.map((e) => e[1]);
    const distMin = Math.min(...dists);
    const distMax = Math.max(...dists);
    const elevMin = Math.min(...elevs);
    const elevMax = Math.max(...elevs);
    const spanD = distMax - distMin || 1;
    const spanE = elevMax - elevMin || 1;
    const pad = 0.05;
    const w = width * (1 - 2 * pad);
    const h = height * (1 - 2 * pad);
    const x = (d: number) => width * pad + ((d - distMin) / spanD) * w;
    const y = (e: number) => height * (1 - pad) - ((e - elevMin) / spanE) * h;
    const path = elevations.map(([d, e], i) => `${i === 0 ? "M" : "L"} ${x(d)} ${y(e)}`).join(" ");
    return { path, distMax, distMin };
  }, [elevations, width, height]);

  if (!elevations.length) return null;

  return (
    <div className="mt-2">
      <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">
        Elevation ({elevationUnit}) vs distance ({distanceUnit})
      </div>
      <svg width={width} height={height} className="w-full max-w-2xl" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-sky-500 dark:text-sky-400"
        />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
        <span>{distMin.toFixed(2)}</span>
        <span>{distMax.toFixed(2)} {distanceUnit}</span>
      </div>
    </div>
  );
}

function CourseSection({
  course,
  distanceUnit,
  elevationUnit,
  mapHeight,
}: {
  course: MapCourse;
  distanceUnit: string;
  elevationUnit: string;
  mapHeight: number;
}) {
  const coords = course.coordinates ?? [];
  const width = 600;
  const height = mapHeight;
  const path = useMemo(() => courseToPath(coords, width, height), [coords, width, height]);

  const timingPoints = course.timingPoints ?? [];
  const sameBounds = useMemo(() => boundsAndScale(coords), [coords]);
  const project = (lng: number, lat: number) => {
    const pad = 0.05;
    const scaleX = (width * (1 - 2 * pad)) / sameBounds.lngSpan;
    const scaleY = (height * (1 - 2 * pad)) / sameBounds.latSpan;
    const scale = Math.min(scaleX, scaleY);
    const ox = width * pad + (width * (1 - 2 * pad) - sameBounds.lngSpan * scale) / 2;
    const oy = height * pad;
    return {
      x: ox + (lng - sameBounds.lngMin) * scale,
      y: oy + (sameBounds.latMax - lat) * scale,
    };
  };

  return (
    <section className="mb-8">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
        {course.name === "HS" ? "High School" : course.name === "MS" ? "Middle School" : course.name} Course
      </h3>
      <div className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-100 dark:bg-slate-800/50">
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="block text-slate-700 dark:text-slate-300"
        >
          <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {timingPoints.map((tp, i) => {
            const { x, y } = project(tp.lng, tp.lat);
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={5} fill="rgb(14 165 233)" stroke="white" strokeWidth={1.5} className="dark:stroke-slate-800" />
              </g>
            );
          })}
        </svg>
      </div>
      {timingPoints.length > 0 && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          {timingPoints.length} timing point(s)
        </p>
      )}
      <ElevationGraph
        elevations={course.elevations ?? []}
        distanceUnit={distanceUnit}
        elevationUnit={elevationUnit}
        width={400}
        height={120}
      />
    </section>
  );
}

export function MapTab({ eventId, raceName }: MapTabProps) {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      })
      .catch(() => setError("Failed to load map data."))
      .finally(() => setLoading(false));
  }, [eventId]);

  const orderedCourses = useMemo(
    () => (mapData ? orderCoursesForDisplay(mapData.courses) : []),
    [mapData]
  );

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

  return (
    <div className="py-4">
      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">{mapData.eventName ?? raceName}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        North up · {mapData.distanceUnit} / {mapData.elevationUnit}
      </p>
      {orderedCourses.map((course) => (
        <CourseSection
          key={course.id}
          course={course}
          distanceUnit={mapData.distanceUnit}
          elevationUnit={mapData.elevationUnit}
          mapHeight={320}
        />
      ))}
    </div>
  );
}
