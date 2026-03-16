import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { MapData, MapCourse } from "../types";
import {
  fetchMapByEventId,
  orderCoursesForDisplay,
  cumulativeDistancesMiles,
  distanceToCoord,
  svgPointToDistance,
  elevationAtDistance,
  segmentSlopeAndElev,
  sliceCourseToDistanceRange,
  sliceElevationsToRange,
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

export type SectionMode = "timing" | "miles";

export interface SectionSegment {
  label: string;
  dist: number;
}

/** Build section options: timing points (Start, Split 1.., Finish) or miles (Start, 1 mi, 2 mi.., Finish). */
function buildSectionSegments(
  mode: SectionMode,
  totalDist: number,
  timingPoints: { distance: number | null }[],
  mileMarkers: number[],
  distanceUnit: string
): SectionSegment[] {
  const segments: SectionSegment[] = [{ label: "Start", dist: 0 }];
  if (mode === "timing") {
    const sorted = timingPoints
      .map((tp) => tp.distance)
      .filter((d): d is number => d != null && d > 0 && d < totalDist)
      .sort((a, b) => a - b);
    sorted.forEach((d, i) => segments.push({ label: `Split ${i + 1}`, dist: d }));
  } else {
    const mid = mileMarkers.filter((m) => m > 0 && m < totalDist);
    mid.forEach((m) => segments.push({ label: `${m} ${distanceUnit}`, dist: m }));
  }
  segments.push({ label: "Finish", dist: totalDist });
  return segments;
}

const MAP_WIDTH = 600;
const MAP_HEIGHT = 320;
const ELEV_WIDTH = 800;
const ELEV_HEIGHT = 140;

export type CourseColorBy = "none" | "elevation" | "slope";

export interface MapVizOptions {
  courseColorBy: CourseColorBy;
}

function lerpColor(a: string, b: string, t: number): string {
  const hex = (x: number) => Math.round(x).toString(16).padStart(2, "0");
  const parse = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const [r0, g0, b0] = parse(a);
  const [r1, g1, b1] = parse(b);
  return `#${hex(r0 + (r1 - r0) * t)}${hex(g0 + (g1 - g0) * t)}${hex(b0 + (b1 - b0) * t)}`;
}

/** Multi-stop gradient: stops are [t, hex] with t in 0..1. */
function gradientColor(stops: [number, string][], t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]!;
    const [t1, c1] = stops[i + 1]!;
    if (clamped <= t1) {
      const tLocal = t0 === t1 ? 1 : (clamped - t0) / (t1 - t0);
      return lerpColor(c0, c1, tLocal);
    }
  }
  return stops[stops.length - 1]![1];
}

/** Non-linear slope -> t for coloring: flat is a wider band, steep grades stand out. */
function slopeToT(slope: number): number {
  const atan = Math.atan;
  const scale = 4;
  const raw = atan(slope * scale);
  const maxAtan = atan(scale * 0.25);
  const minAtan = atan(scale * -0.15);
  return (raw - minAtan) / (maxAtan - minAtan);
}

function CourseAndElevation({
  course,
  distanceUnit,
  elevationUnit,
  vizOptions,
}: {
  course: MapCourse;
  distanceUnit: string;
  elevationUnit: string;
  vizOptions: MapVizOptions;
}) {
  const fullCoords = course.coordinates ?? [];
  const fullElevations = course.elevations ?? [];
  const fullCumulMiles = useMemo(() => cumulativeDistancesMiles(fullCoords), [fullCoords]);
  const totalDist = fullCumulMiles.length > 0 ? fullCumulMiles[fullCumulMiles.length - 1]! : 0;

  const [sectionMode, setSectionMode] = useState<SectionMode>("timing");
  const [sectionStartIdx, setSectionStartIdx] = useState(0);
  const [sectionFinishIdx, setSectionFinishIdx] = useState(999);

  const sectionSegments = useMemo(() => {
    const mileMarkers = getMarkers(0, totalDist, distanceUnit);
    return buildSectionSegments(sectionMode, totalDist, course.timingPoints ?? [], mileMarkers, distanceUnit);
  }, [sectionMode, totalDist, course.timingPoints, distanceUnit]);

  useEffect(() => {
    setSectionStartIdx(0);
    setSectionFinishIdx(999);
  }, [course.id]);

  useEffect(() => {
    const n = sectionSegments.length;
    if (n === 0) return;
    setSectionStartIdx((i) => Math.min(i, n - 1));
    setSectionFinishIdx((i) => {
      const clamped = Math.min(Math.max(i, 0), n - 1);
      return clamped;
    });
  }, [sectionSegments.length]);

  useEffect(() => {
    setSectionFinishIdx((i) => (i < sectionStartIdx ? sectionStartIdx : i));
  }, [sectionStartIdx]);

  const sectionDistMin = sectionSegments[sectionStartIdx]?.dist ?? 0;
  const sectionDistMax = sectionSegments[sectionFinishIdx]?.dist ?? totalDist;
  const isFullSection = sectionStartIdx === 0 && sectionFinishIdx === sectionSegments.length - 1;

  useEffect(() => {
    setElevViewRange(null);
  }, [sectionDistMin, sectionDistMax]);

  const { coords, cumulMiles } = useMemo(() => {
    if (isFullSection || totalDist <= 0) return { coords: fullCoords, cumulMiles: fullCumulMiles };
    const r = sliceCourseToDistanceRange(fullCoords, fullCumulMiles, sectionDistMin, sectionDistMax);
    return { coords: r.coords, cumulMiles: r.cumulativeMiles };
  }, [isFullSection, fullCoords, fullCumulMiles, sectionDistMin, sectionDistMax, totalDist]);

  const elevations = useMemo(() => {
    if (isFullSection || totalDist <= 0) return fullElevations;
    return sliceElevationsToRange(fullElevations, sectionDistMin, sectionDistMax);
  }, [isFullSection, fullElevations, sectionDistMin, sectionDistMax, totalDist]);

  const path = useMemo(() => courseToPath(coords, MAP_WIDTH, MAP_HEIGHT), [coords]);
  const sameBounds = useMemo(() => boundsAndScale(coords), [coords]);
  const segments = useMemo(
    () => segmentSlopeAndElev(coords, cumulMiles, elevations),
    [coords, cumulMiles, elevations]
  );
  const elevRange = useMemo(() => {
    if (!segments.length) return { min: 0, max: 1 };
    const elevs = segments.map((s) => s.elev);
    return { min: Math.min(...elevs), max: Math.max(...elevs) || 1 };
  }, [segments]);

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
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [elevViewRange, setElevViewRange] = useState<{ distMin: number; distMax: number } | null>(null);

  const distMin = elevations.length ? elevations[0]![0] : 0;
  const distMax = elevations.length ? elevations[elevations.length - 1]![0] : totalDist;
  const mileMarkers = useMemo(
    () => getMarkers(distMin, distMax, distanceUnit),
    [distMin, distMax, distanceUnit]
  );

  const elevData = useMemo(() => {
    if (!elevations.length) return { path: "", distMin: 0, distMax: 0, dataMin: 0, dataMax: 0, spanD: 1, spanE: 1, elevMin: 0, elevMax: 0, x: (_: number) => 0, y: (_: number) => 0 };
    const dists = elevations.map((e) => e[0]);
    const elevs = elevations.map((e) => e[1]);
    const dataMin = Math.min(...dists);
    const dataMax = Math.max(...dists);
    const dMin = elevViewRange?.distMin ?? dataMin;
    const dMax = elevViewRange?.distMax ?? dataMax;
    const spanD = (dMax - dMin) || 1;
    const eMin = Math.min(...elevs);
    const eMax = Math.max(...elevs);
    const spanE = eMax - eMin || 1;
    const pad = 0.05;
    const w = ELEV_WIDTH * (1 - 2 * pad);
    const h = ELEV_HEIGHT * (1 - 2 * pad);
    return {
      path: "",
      distMin: dMin,
      distMax: dMax,
      dataMin,
      dataMax,
      spanD,
      spanE,
      elevMin: eMin,
      elevMax: eMax,
      x: (d: number) => ELEV_WIDTH * pad + ((d - dMin) / spanD) * w,
      y: (e: number) => ELEV_HEIGHT * (1 - pad) - ((e - eMin) / spanE) * h,
    };
  }, [elevations, elevViewRange]);

  const elevPath = useMemo(() => {
    if (!elevations.length) return "";
    const { distMin, distMax } = elevData;
    const points = elevations.filter(([d]) => d >= distMin - 1e-6 && d <= distMax + 1e-6);
    if (points.length === 0) return "";
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const needStart = first[0] > distMin;
    const needEnd = last[0] < distMax;
    const out: [number, number][] = [];
    if (needStart && elevations[0]) {
      const e0 = elevationAtDistance(elevations, distMin);
      if (e0 != null) out.push([distMin, e0]);
    }
    points.forEach(([d, e]) => out.push([d, e]));
    if (needEnd && elevations.length) {
      const e1 = elevationAtDistance(elevations, distMax);
      if (e1 != null) out.push([distMax, e1]);
    }
    const pts = out.length ? out : points;
    return pts.map(([d, e], i) => `${i === 0 ? "M" : "L"} ${elevData.x(d)} ${elevData.y(e)}`).join(" ");
  }, [elevations, elevData]);

  const handleCourseMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || !cumulMiles.length) return;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const scaleX = vb.width / rect.width;
      const scaleY = vb.height / rect.height;
      const viewX = (e.clientX - rect.left) * scaleX;
      const viewY = (e.clientY - rect.top) * scaleY;
      const pathX = (viewX - pan.x) / scale + (MAP_WIDTH / 2) * (1 - 1 / scale);
      const pathY = (viewY - pan.y) / scale + (MAP_HEIGHT / 2) * (1 - 1 / scale);
      const dist = svgPointToDistance(pathX, pathY, coords, cumulMiles, project);
      setHoverDistance(dist ?? null);
    },
    [coords, cumulMiles, project, pan, scale]
  );

  const handleCourseMouseLeave = useCallback(() => setHoverDistance(null), []);

  const hoverCoord = hoverDistance != null ? distanceToCoord(coords, hoverDistance, cumulMiles) : null;
  const hoverProjected = hoverCoord ? project(hoverCoord[0], hoverCoord[1]) : null;
  const hoverElev = hoverDistance != null ? elevationAtDistance(elevations, hoverDistance) : null;
  const hoverElevY = hoverElev != null ? elevData.y(hoverElev) : null;
  const hoverElevX = hoverDistance != null ? elevData.x(hoverDistance) : null;

  const allTimingPoints = course.timingPoints ?? [];
  const timingPoints = useMemo(
    () =>
      allTimingPoints.filter((tp) => {
        const d = tp.distance;
        return d != null && d >= sectionDistMin - 1e-6 && d <= sectionDistMax + 1e-6;
      }),
    [allTimingPoints, sectionDistMin, sectionDistMax]
  );
  const useViz = vizOptions.courseColorBy !== "none";

  const [selectedRange, setSelectedRange] = useState<{ distMin: number; distMax: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ dist: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);

  const dragRef = useRef({ dragStart, dragCurrent });
  dragRef.current = { dragStart, dragCurrent };
  useEffect(() => {
    const onUp = () => {
      const { dragStart: start, dragCurrent: cur } = dragRef.current;
      if (start != null && cur != null) {
        const a = Math.min(start.dist, cur);
        const b = Math.max(start.dist, cur);
        if (b - a > 0.001) setSelectedRange({ distMin: a, distMax: b });
      }
      setDragStart(null);
      setDragCurrent(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const selectionSegmentIndices = useMemo(() => {
    if (!selectedRange || !segments.length) return new Set<number>();
    const set = new Set<number>();
    segments.forEach((seg, i) => {
      if (seg.distEnd > selectedRange.distMin && seg.distStart < selectedRange.distMax) set.add(i);
    });
    return set;
  }, [selectedRange, segments]);

  const pathContent = useMemo(() => {
    const slopeStops: [number, string][] = [
      [0, "#22c55e"],
      [0.2, "#06b6d4"],
      [0.4, "#1e293b"],
      [0.5, "#1e293b"],
      [0.6, "#eab308"],
      [0.8, "#f97316"],
      [1, "#dc2626"],
    ];

    const els: JSX.Element[] = [];

    if (coords.length === 0) return <g />;

    if (selectionSegmentIndices.size > 0) {
      for (let i = 0; i < coords.length - 1; i++) {
        if (!selectionSegmentIndices.has(i)) continue;
        const a = project(coords[i]![0], coords[i]![1]);
        const b = project(coords[i + 1]![0], coords[i + 1]![1]);
        els.push(<line key={`sel-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0ea5e9" strokeWidth={8} strokeLinecap="round" />);
      }
    }

    if (!useViz) {
      els.push(<path key="path" d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />);
    } else {
      for (let i = 0; i < coords.length - 1; i++) {
        const a = project(coords[i]![0], coords[i]![1]);
        const b = project(coords[i + 1]![0], coords[i + 1]![1]);
        let stroke = "currentColor";
        if (vizOptions.courseColorBy === "elevation") {
          const t = (segments[i]!.elev - elevRange.min) / (elevRange.max - elevRange.min || 1);
          stroke = lerpColor("#22c55e", "#92400e", t);
        } else if (vizOptions.courseColorBy === "slope") {
          const t = slopeToT(segments[i]!.slope);
          stroke = gradientColor(slopeStops, t);
        }
        els.push(<line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />);
      }
    }
    return <g>{els}</g>;
  }, [useViz, coords, path, project, segments, elevRange, vizOptions, selectionSegmentIndices]);

  const xToDist = useCallback(
    (clientX: number) => {
      const el = elevRef.current;
      if (!el || !elevations.length) return elevData.distMin;
      const rect = el.getBoundingClientRect();
      const pad = 0.05;
      const innerLeft = pad * rect.width;
      const innerWidth = rect.width * (1 - 2 * pad);
      const x = clientX - rect.left - innerLeft;
      const frac = Math.max(0, Math.min(1, x / innerWidth));
      return elevData.distMin + frac * (elevData.distMax - elevData.distMin);
    },
    [elevations.length, elevData]
  );

  const handleElevationMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!elevations.length) return;
      const dist = xToDist(e.clientX);
      setDragStart({ dist });
      setDragCurrent(dist);
      setSelectedRange(null);
    },
    [elevations.length, xToDist]
  );

  const handleElevationMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = elevRef.current;
      if (!el || !elevations.length) return;
      const d = xToDist(e.clientX);
      if (dragStart != null) setDragCurrent(d);
      else setHoverDistance(d);
    },
    [elevations.length, xToDist, dragStart]
  );

  const handleElevationMouseUp = useCallback(() => {
    if (dragStart != null && dragCurrent != null) {
      const a = Math.min(dragStart.dist, dragCurrent);
      const b = Math.max(dragStart.dist, dragCurrent);
      if (b - a > 0.001) setSelectedRange({ distMin: a, distMax: b });
    }
    setDragStart(null);
    setDragCurrent(null);
  }, [dragStart, dragCurrent]);

  const handleElevationMouseLeave = useCallback(() => {
    setHoverDistance(null);
    if (dragStart != null) {
      if (dragCurrent != null) {
        const a = Math.min(dragStart.dist, dragCurrent);
        const b = Math.max(dragStart.dist, dragCurrent);
        if (b - a > 0.001) setSelectedRange({ distMin: a, distMax: b });
      }
      setDragStart(null);
      setDragCurrent(null);
    }
  }, [dragStart, dragCurrent]);

  const handleElevationWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!elevations.length) return;
      e.preventDefault();
      const dist = xToDist(e.clientX);
      const dMin = elevData.distMin;
      const dMax = elevData.distMax;
      const dataMin = elevData.dataMin ?? dMin;
      const dataMax = elevData.dataMax ?? dMax;
      const fullSpan = dataMax - dataMin;
      const minSpan = Math.max(0.02, fullSpan * 0.05);
      const delta = e.deltaY > 0 ? 1 : -1;
      const factor = delta > 0 ? 1 / 1.15 : 1.15;
      let newSpan = (dMax - dMin) * factor;
      if (newSpan < minSpan) newSpan = minSpan;
      if (newSpan >= fullSpan * 0.99) {
        setElevViewRange(null);
        return;
      }
      const center = dist;
      let newMin = center - newSpan / 2;
      let newMax = center + newSpan / 2;
      if (newMin < dataMin) {
        newMin = dataMin;
        newMax = Math.min(dataMax, dataMin + newSpan);
      }
      if (newMax > dataMax) {
        newMax = dataMax;
        newMin = Math.max(dataMin, dataMax - newSpan);
      }
      setElevViewRange({ distMin: newMin, distMax: newMax });
    },
    [elevations.length, xToDist, elevData]
  );

  const resetElevationView = useCallback(() => setElevViewRange(null), []);

  const mapCenter = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
  const transform = `translate(${mapCenter.x + pan.x}, ${mapCenter.y + pan.y}) scale(${scale}) translate(${-mapCenter.x}, ${-mapCenter.y})`;

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const vb = svg.viewBox.baseVal;
      const viewX = (e.clientX - rect.left) * (vb.width / rect.width);
      const viewY = (e.clientY - rect.top) * (vb.height / rect.height);
      const cx = MAP_WIDTH / 2;
      const cy = MAP_HEIGHT / 2;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.min(4, Math.max(0.4, scale + delta));
      setPan({
        x: pan.x * (newScale / scale) + (viewX - cx) * (1 - newScale / scale),
        y: pan.y * (newScale / scale) + (viewY - cy) * (1 - newScale / scale),
      });
      setScale(newScale);
    },
    [scale, pan]
  );

  const handleMapMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      panStart.current = { x: e.clientX, y: e.clientY, vx: pan.x, vy: pan.y };
    },
    [pan]
  );

  const handleMapMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (panStart.current) {
        setPan({ x: panStart.current.vx + e.clientX - panStart.current.x, y: panStart.current.vy + e.clientY - panStart.current.y });
      } else {
        handleCourseMouseMove(e);
      }
    },
    [handleCourseMouseMove]
  );

  const handleMapMouseUp = useCallback(() => {
    panStart.current = null;
  }, []);

  const handleMapMouseLeave = useCallback(() => {
    panStart.current = null;
    handleCourseMouseLeave();
  }, [handleCourseMouseLeave]);

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const dragRange = useMemo(() => {
    if (dragStart == null || dragCurrent == null) return null;
    return { distMin: Math.min(dragStart.dist, dragCurrent), distMax: Math.max(dragStart.dist, dragCurrent) };
  }, [dragStart, dragCurrent]);

  const showRange = selectedRange ?? dragRange;

  const selectionStats = useMemo(() => {
    if (!selectedRange || !elevations.length) return null;
    const dist = selectedRange.distMax - selectedRange.distMin;
    const e0 = elevationAtDistance(elevations, selectedRange.distMin);
    const e1 = elevationAtDistance(elevations, selectedRange.distMax);
    if (e0 == null || e1 == null) return null;
    const elevChange = e1 - e0;
    const isMiles = distanceUnit === "mi";
    const runSameUnit = isMiles ? dist * 5280 : dist;
    const avgGradePct = runSameUnit !== 0 ? (elevChange / runSameUnit) * 100 : 0;
    const sliced = sliceElevationsToRange(elevations, selectedRange.distMin, selectedRange.distMax);
    let climbing = 0;
    let descending = 0;
    for (let i = 1; i < sliced.length; i++) {
      const delta = sliced[i]![1] - sliced[i - 1]![1];
      if (delta > 0) climbing += delta;
      else if (delta < 0) descending += -delta;
    }
    return { distance: dist, distanceUnit, elevChange, elevationUnit, avgGradePct, climbing, descending };
  }, [selectedRange, elevations, distanceUnit, elevationUnit]);
  const startPoint = coords.length > 0 ? project(coords[0]![0], coords[0]![1]) : null;

  const finishOptions = sectionSegments.slice(sectionStartIdx);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">Section:</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="radio"
              name="sectionMode"
              checked={sectionMode === "timing"}
              onChange={() => {
                setSectionMode("timing");
                setSectionStartIdx(0);
                setSectionFinishIdx(999);
              }}
              className="border-slate-300 dark:border-slate-600"
            />
            Timing points
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="radio"
              name="sectionMode"
              checked={sectionMode === "miles"}
              onChange={() => {
                setSectionMode("miles");
                setSectionStartIdx(0);
                setSectionFinishIdx(999);
              }}
              className="border-slate-300 dark:border-slate-600"
            />
            Miles
          </label>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            Start
            <select
              value={sectionStartIdx}
              onChange={(e) => {
                const i = Number(e.target.value);
                setSectionStartIdx(i);
                if (sectionFinishIdx < i) setSectionFinishIdx(i);
              }}
              className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs py-1 pr-6"
            >
              {sectionSegments.map((seg, i) => (
                <option key={i} value={i}>
                  {seg.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
            Finish
            <select
              value={sectionFinishIdx}
              onChange={(e) => setSectionFinishIdx(Number(e.target.value))}
              className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs py-1 pr-6"
            >
              {finishOptions.map((seg, j) => {
                const idx = sectionStartIdx + j;
                return (
                  <option key={idx} value={idx}>
                    {seg.label}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      </div>
      <div
        className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-100 dark:bg-slate-800/50 relative"
        onMouseLeave={handleMapMouseLeave}
      >
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(4, s + 0.25))}
            className="w-8 h-8 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-lg leading-none shadow"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.4, s - 0.25))}
            className="w-8 h-8 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-lg leading-none shadow"
          >
            −
          </button>
          <button
            type="button"
            onClick={resetView}
            className="w-8 h-8 rounded bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-medium shadow"
            title="Reset view"
          >
            ⌂
          </button>
        </div>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="block text-slate-700 dark:text-slate-300 cursor-crosshair"
          onWheel={handleWheel}
          onMouseDown={handleMapMouseDown}
          onMouseMove={handleMapMouseMove}
          onMouseUp={handleMapMouseUp}
        >
          <g transform={transform}>
          {pathContent}
          {startPoint && (
            <g transform={`translate(${startPoint.x}, ${startPoint.y})`}>
              <path d="M0,-10 L6,8 L-6,8 Z" fill="#16a34a" stroke="white" strokeWidth={1.5} className="dark:stroke-slate-800" />
            </g>
          )}
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
          </g>
        </svg>
      </div>

      <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-green-500 shrink-0" aria-hidden style={{ marginBottom: 2 }} />
          Start
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-500 border border-white dark:border-slate-800 shrink-0" aria-hidden />
          Timing points
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-slate-400 border border-white dark:border-slate-800 shrink-0" aria-hidden />
          Mile markers
        </span>
      </div>

      <div className="mt-4 w-full">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            Elevation ({elevationUnit}) vs distance ({distanceUnit}) — hover or wheel to zoom
          </span>
          {elevViewRange != null && (
            <button
              type="button"
              onClick={resetElevationView}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500"
              title="Reset elevation zoom"
            >
              ⌂ Reset
            </button>
          )}
        </div>
        <div
          ref={elevRef}
          className="w-full border border-slate-200 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-800/30 overflow-hidden relative select-none"
          onMouseDown={handleElevationMouseDown}
          onMouseMove={handleElevationMouseMove}
          onMouseUp={handleElevationMouseUp}
          onMouseLeave={handleElevationMouseLeave}
          onWheel={handleElevationWheel}
          style={{ height: ELEV_HEIGHT }}
        >
          <svg width="100%" height={ELEV_HEIGHT} viewBox={`0 0 ${ELEV_WIDTH} ${ELEV_HEIGHT}`} preserveAspectRatio="none" className="block cursor-crosshair">
            {showRange && (
              <rect
                x={Math.min(elevData.x(showRange.distMin), elevData.x(showRange.distMax))}
                y={0}
                width={Math.abs(elevData.x(showRange.distMax) - elevData.x(showRange.distMin))}
                height={ELEV_HEIGHT}
                fill="rgba(14,165,233,0.25)"
                className="pointer-events-none"
              />
            )}
            <path d={elevPath} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-sky-500 dark:text-sky-400" />
            {mileMarkers
              .filter((mi) => mi >= elevData.distMin && mi <= elevData.distMax)
              .map((mi) => {
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
          </svg>
          {hoverElevX != null && hoverElevY != null && (
            <>
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
                style={{ left: `${(hoverElevX / ELEV_WIDTH) * 100}%` }}
              />
              <div
                className="absolute w-3 h-3 rounded-full bg-red-500 border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2 dark:border-slate-800"
                style={{ left: `${(hoverElevX / ELEV_WIDTH) * 100}%`, top: `${(hoverElevY / ELEV_HEIGHT) * 100}%` }}
              />
            </>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          <span>{elevData.distMin.toFixed(2)}</span>
          {mileMarkers.slice(0, 5).map((mi) => (
            <span key={mi}>{mi} {distanceUnit}</span>
          ))}
          <span>{elevData.distMax.toFixed(2)} {distanceUnit}</span>
        </div>
        {selectionStats && (
          <div className="mt-2 px-2 py-1.5 rounded bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 text-[11px] text-slate-700 dark:text-slate-200 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>
              <span className="font-medium text-sky-700 dark:text-sky-300">Selection:</span>
              {" "}{selectionStats.distance.toFixed(3)} {selectionStats.distanceUnit}
            </span>
            <span>
              <span className="font-medium">Net:</span>
              {" "}{selectionStats.elevChange >= 0 ? "+" : ""}{selectionStats.elevChange.toFixed(0)} {selectionStats.elevationUnit}
              {" · "}avg grade {selectionStats.avgGradePct >= 0 ? "" : "−"}{Math.abs(selectionStats.avgGradePct).toFixed(1)}%
            </span>
            <span className="text-emerald-700 dark:text-emerald-400">
              ↑ {selectionStats.climbing.toFixed(0)} {selectionStats.elevationUnit} climbing
            </span>
            <span className="text-red-600 dark:text-red-400">
              ↓ {selectionStats.descending.toFixed(0)} {selectionStats.elevationUnit} descending
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const DEFAULT_VIZ: MapVizOptions = {
  courseColorBy: "none",
};

export function MapTab({ eventId, raceName }: MapTabProps) {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseIndex, setCourseIndex] = useState(0);
  const [vizOptions, setVizOptions] = useState<MapVizOptions>(DEFAULT_VIZ);

  const setCourseColorBy = useCallback((value: CourseColorBy) => {
    setVizOptions((p) => ({ ...p, courseColorBy: value }));
  }, []);

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
    <div className="py-4 w-full max-w-6xl flex gap-6">
      <div className="flex-1 min-w-0">
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
            vizOptions={vizOptions}
          />
        )}
      </div>

      <div className="w-48 shrink-0 flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Visualization</h3>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">Course color</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="radio"
              name="courseColorBy"
              checked={vizOptions.courseColorBy === "none"}
              onChange={() => setCourseColorBy("none")}
              className="border-slate-300 dark:border-slate-600"
            />
            None
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="radio"
              name="courseColorBy"
              checked={vizOptions.courseColorBy === "elevation"}
              onChange={() => setCourseColorBy("elevation")}
              className="border-slate-300 dark:border-slate-600"
            />
            Elevation
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
            <input
              type="radio"
              name="courseColorBy"
              checked={vizOptions.courseColorBy === "slope"}
              onChange={() => setCourseColorBy("slope")}
              className="border-slate-300 dark:border-slate-600"
            />
            Slope
          </label>
        </fieldset>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
          Click-drag on elevation chart to highlight a section on the map. Click to clear.
        </p>
      </div>
    </div>
  );
}
