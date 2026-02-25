import type { MapData } from "../types";

const base = (import.meta.env.BASE_URL ?? "/").replace(/\/*$/, "") + "/";

/** Fetch map JSON by race event_id (matches event_id in maps manifest). */
export async function fetchMapByEventId(eventId: number): Promise<MapData | null> {
  const res = await fetch(`${base}maps/manifest.json`);
  if (!res.ok) return null;
  const manifest = (await res.json()) as Array<{ event_id: number; file: string }>;
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
