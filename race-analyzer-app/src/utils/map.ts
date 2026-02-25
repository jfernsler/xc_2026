import type { MapData } from "../types";

const base = (import.meta.env.BASE_URL ?? "/").replace(/\/*$/, "") + "/";

export interface MapsManifestEntry {
  event_id: number;
  map_id: number;
  name: string;
  file: string;
}

/** Fetch maps manifest: lists all races that have map data (event_id = race id in races manifest). */
export async function fetchMapsManifest(): Promise<MapsManifestEntry[]> {
  const res = await fetch(`${base}maps/manifest.json`);
  if (!res.ok) return [];
  const list = (await res.json()) as MapsManifestEntry[];
  return Array.isArray(list) ? list : [];
}

/** Fetch map JSON by race event_id (matches event_id in maps manifest). */
export async function fetchMapByEventId(eventId: number): Promise<MapData | null> {
  const manifest = await fetchMapsManifest();
  const entry = manifest.find((m) => m.event_id === eventId);
  if (!entry) return null;
  const mapRes = await fetch(`${base}maps/${entry.file}`);
  if (!mapRes.ok) return null;
  return mapRes.json() as Promise<MapData>;
}

/** Order courses for display: High School first, then Middle School. */
export function orderCoursesForDisplay(courses: MapData["courses"]): MapData["courses"] {
  const hs = courses.find((c) => c.name.toUpperCase() === "HS");
  const ms = courses.find((c) => c.name.toUpperCase() === "MS");
  const rest = courses.filter((c) => c !== hs && c !== ms);
  return [hs, ms, ...rest].filter(Boolean) as MapData["courses"];
}

/** Approx miles per degree at a given latitude. */
const MILES_PER_DEG_LAT = 69;
function milesPerDegLng(latDeg: number): number {
  return 69 * Math.cos((latDeg * Math.PI) / 180);
}

/** Cumulative distance in miles at each coordinate index (same unit as elevation data when imperial). */
export function cumulativeDistancesMiles(coords: [number, number][]): number[] {
  if (coords.length === 0) return [];
  const out: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const [lng0, lat0] = coords[i - 1]!;
    const [lng1, lat1] = coords[i]!;
    const dLat = (lat1 - lat0) * MILES_PER_DEG_LAT;
    const dLng = (lng1 - lng0) * milesPerDegLng((lat0 + lat1) / 2);
    out.push(out[i - 1]! + Math.sqrt(dLat * dLat + dLng * dLng));
  }
  return out;
}

/** Given distance in miles along route, return [lng, lat] by interpolating coords. */
export function distanceToCoord(
  coords: [number, number][],
  distMiles: number,
  cumulativeMiles: number[]
): [number, number] | null {
  if (coords.length === 0 || cumulativeMiles.length === 0) return null;
  const total = cumulativeMiles[cumulativeMiles.length - 1]!;
  if (total <= 0) return coords[0] ?? null;
  let d = Math.max(0, Math.min(distMiles, total));
  let i = 0;
  for (; i < cumulativeMiles.length - 1; i++) {
    if (cumulativeMiles[i + 1]! >= d) break;
  }
  if (i >= cumulativeMiles.length - 1) return coords[coords.length - 1] ?? null;
  const d0 = cumulativeMiles[i]!;
  const d1 = cumulativeMiles[i + 1]!;
  const t = d1 > d0 ? (d - d0) / (d1 - d0) : 0;
  const [lng0, lat0] = coords[i]!;
  const [lng1, lat1] = coords[i + 1]!;
  return [lng0 + t * (lng1 - lng0), lat0 + t * (lat1 - lat0)];
}

/** Closest point on segment; returns param t in [0,1] and squared distance. */
function closestOnSegment(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): { t: number; d2: number } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 <= 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x0 + t * dx;
  const qy = y0 + t * dy;
  const d2 = (px - qx) ** 2 + (py - qy) ** 2;
  return { t, d2 };
}

/** Given SVG (x,y) and project function from (lng,lat)->(x,y), find closest distance along route. */
export function svgPointToDistance(
  svgX: number,
  svgY: number,
  coords: [number, number][],
  cumulativeMiles: number[],
  project: (lng: number, lat: number) => { x: number; y: number }
): number | null {
  if (coords.length < 2 || cumulativeMiles.length < 2) return null;
  let bestT = 0;
  let bestI = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = project(coords[i]![0], coords[i]![1]);
    const b = project(coords[i + 1]![0], coords[i + 1]![1]);
    const { t, d2 } = closestOnSegment(svgX, svgY, a.x, a.y, b.x, b.y);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestT = t;
      bestI = i;
    }
  }
  const d0 = cumulativeMiles[bestI]!;
  const d1 = cumulativeMiles[bestI + 1]!;
  return d0 + bestT * (d1 - d0);
}

/** Elevation at distance (linear interpolation between samples). */
export function elevationAtDistance(
  elevations: [number, number][],
  distance: number
): number | null {
  if (!elevations.length) return null;
  const dists = elevations.map((e) => e[0]);
  if (distance <= dists[0]!) return elevations[0]![1];
  if (distance >= dists[dists.length - 1]!) return elevations[elevations.length - 1]![1];
  for (let i = 0; i < elevations.length - 1; i++) {
    const d0 = elevations[i]![0];
    const d1 = elevations[i + 1]![0];
    if (distance >= d0 && distance <= d1) {
      const t = (distance - d0) / (d1 - d0 || 1);
      return elevations[i]![1] + t * (elevations[i + 1]![1] - elevations[i]![1]);
    }
  }
  return null;
}

/** Per-segment slope (elev gain / distance) and elevation for coloring. Segment i = from coord i to i+1. */
export function segmentSlopeAndElev(
  coords: [number, number][],
  cumulativeMiles: number[],
  elevations: [number, number][]
): { slope: number; elev: number; distStart: number; distEnd: number }[] {
  const out: { slope: number; elev: number; distStart: number; distEnd: number }[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const d0 = cumulativeMiles[i] ?? 0;
    const d1 = cumulativeMiles[i + 1] ?? d0;
    const run = (d1 - d0) * 5280 || 0.0001; // miles -> ft for slope as ft/ft
    const e0 = elevationAtDistance(elevations, d0) ?? 0;
    const e1 = elevationAtDistance(elevations, d1) ?? e0;
    const rise = e1 - e0;
    const slope = run !== 0 ? rise / run : 0;
    out.push({ slope, elev: (e0 + e1) / 2, distStart: d0, distEnd: d1 });
  }
  return out;
}

/** Index of segment with max upward slope (most punchy). */
export function punchySegmentIndex(segments: { slope: number }[]): number {
  if (!segments.length) return -1;
  let best = 0;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i]!.slope > segments[best]!.slope) best = i;
  }
  return best;
}

/** Index of segment with largest elevation gain (most climbing). */
export function mostClimbingSegmentIndex(segments: { slope: number; distStart: number; distEnd: number }[]): number {
  if (!segments.length) return -1;
  let best = 0;
  let bestGain = -Infinity;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const gain = s.slope * ((s.distEnd - s.distStart) * 5280);
    if (gain > bestGain) {
      bestGain = gain;
      best = i;
    }
  }
  return best;
}

/** Index of segment with smallest elevation gain / most descent (least climbing). */
export function leastClimbingSegmentIndex(segments: { slope: number; distStart: number; distEnd: number }[]): number {
  if (!segments.length) return -1;
  let best = 0;
  let bestGain = Infinity;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const gain = s.slope * ((s.distEnd - s.distStart) * 5280);
    if (gain < bestGain) {
      bestGain = gain;
      best = i;
    }
  }
  return best;
}
