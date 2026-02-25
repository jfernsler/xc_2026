import type { Rider, SplitData, RiderSplits } from "../types";
import { REGION_MAP } from "../constants/regions";
import { detectCategory } from "./category";
import { parseTime, parseTimeOfDay } from "./time";

export interface RaceOption {
  id: number;
  name: string;
  file: string;
  year?: number;
}

/** Row shape from scraper CSV (STATUS_GROUP, CATEGORY, BIB, PLC, NAME, TEAM, LAPS, LAP1..LAP4, PEN, TIME). Some years use CATEGORY=All and put group in STATUS_GROUP. */
interface CsvRow {
  STATUS_GROUP?: string;
  CATEGORY?: string;
  BIB?: string;
  ID?: string;
  PLC?: string;
  NAME?: string;
  TEAM?: string;
  PTS?: string;
  LAPS?: string;
  LAP1?: string;
  LAP2?: string;
  LAP3?: string;
  LAP4?: string;
  PEN?: string;
  TIME?: string;
}

/** Parse scraper-output CSV (header row + comma-separated) into row objects. */
function parseSocalCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const obj: CsvRow = {};
    headers.forEach((h, j) => {
      (obj as Record<string, string>)[h] = values[j]?.trim() ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

const DNF_MARKERS = /^(PULLED|DNF|DNS|DQ)$/i;

/** True if row has PULLED/DNF etc. — rider did not finish; total time must not be used for placement. */
function isDnfOrPulled(row: CsvRow): boolean {
  const v = (s: string | undefined) => (s ?? "").trim().toUpperCase();
  return (
    DNF_MARKERS.test(v(row.TIME)) ||
    DNF_MARKERS.test(v(row.LAP1)) ||
    DNF_MARKERS.test(v(row.LAP2)) ||
    DNF_MARKERS.test(v(row.LAP3)) ||
    DNF_MARKERS.test(v(row.LAP4))
  );
}

/** Derive total time from TIME column or sum of lap times (handles 2024-style CSVs where TIME is empty). Excludes PULLED/DNF. */
function deriveTotalTime(row: CsvRow): number | null {
  if (isDnfOrPulled(row)) return null;
  const fromTime = parseTime(row.TIME);
  if (fromTime != null) return fromTime;
  const lapTimes = [row.LAP1, row.LAP2, row.LAP3, row.LAP4]
    .map(parseTime)
    .filter((t): t is number => t != null && t >= 60);
  if (lapTimes.length === 0) return null;
  return lapTimes.reduce((a, b) => a + b, 0);
}

const SPLIT_SECTOR_RE = /^LAP(\d+)_SPLIT(\d+)_SECTOR$/;

/** Build segment labels and keys in lap/split order from CSV headers. */
function getSegmentKeys(rows: CsvRow[]): { labels: string[]; sectorKeys: string[]; chipKeys: string[]; todKeys: string[] } {
  const headers = Object.keys((rows[0] ?? {}) as Record<string, string>);
  const sectorKeys = headers
    .filter((h) => SPLIT_SECTOR_RE.test(h))
    .sort((a, b) => {
      const ma = a.match(SPLIT_SECTOR_RE)!;
      const mb = b.match(SPLIT_SECTOR_RE)!;
      const lapA = parseInt(ma[1], 10);
      const lapB = parseInt(mb[1], 10);
      if (lapA !== lapB) return lapA - lapB;
      return parseInt(ma[2], 10) - parseInt(mb[2], 10);
    });
  if (sectorKeys.length === 0) return { labels: [], sectorKeys: [], chipKeys: [], todKeys: [] };
  const labels = sectorKeys.map((k) => {
    const m = k.match(SPLIT_SECTOR_RE)!;
    return `L${m[1]}-S${m[2]}`;
  });
  const chipKeys = sectorKeys.map((k) => k.replace(/_SECTOR$/, "_CHIP"));
  const todKeys = sectorKeys.map((k) => k.replace(/_SECTOR$/, "_TOD"));
  return { labels, sectorKeys, chipKeys, todKeys };
}

/** Build SplitData from CSV rows (same row order as csvRowsToRiders). */
function buildSplitsFromRows(rows: CsvRow[], raceId: number): SplitData | null {
  const { labels, sectorKeys, chipKeys, todKeys } = getSegmentKeys(rows);
  if (labels.length === 0) return null;
  const byRiderId: Record<string, RiderSplits> = {};
  const getRow = (row: CsvRow) => row as Record<string, string>;
  rows.forEach((row, i) => {
    const riderId = `${raceId}-${row.BIB ?? ""}-${row.ID ?? ""}-${i}`;
    const sector = sectorKeys.map((k) => parseTime(getRow(row)[k]));
    const chip = chipKeys.map((k) => parseTime(getRow(row)[k]));
    const tod = todKeys.map((k) => parseTimeOfDay(getRow(row)[k]));
    byRiderId[riderId] = { sector, chip, tod };
  });
  return { segmentLabels: labels, byRiderId };
}

/** Map CSV rows to Rider[] for a given race id. */
function csvRowsToRiders(rows: CsvRow[], raceId: number): Rider[] {
  return rows.map((row, i) => {
    const categoryVal = (row.CATEGORY ?? "").trim();
    const statusGroup = (row.STATUS_GROUP ?? "").trim();
    const catRaw = categoryVal === "All" && statusGroup ? statusGroup : categoryVal || statusGroup;
    const team = (row.TEAM ?? "").trim().toUpperCase();
    const grade = catRaw.match(/\bGrade\s*[678]\b/i) ? "ms" : "hs";
    const placeStr = (row.PLC ?? "").trim();
    const place = placeStr === "*" || placeStr === "" ? 999 : parseInt(placeStr, 10) || 999;
    return {
      id: `${raceId}-${row.BIB ?? ""}-${row.ID ?? ""}-${i}`,
      race: raceId,
      grade,
      category: detectCategory(catRaw),
      categoryRaw: catRaw,
      gender: catRaw.toLowerCase().includes("girl") ? "girls" : "boys",
      place,
      number: (row.BIB ?? "").trim(),
      name: (row.NAME ?? "").trim(),
      team,
      teamUpper: team.toUpperCase(),
      region: REGION_MAP[team.toUpperCase()] ?? "Other",
      lapsCompleted: (row.LAPS ?? "").trim(),
      lap1: parseTime(row.LAP1),
      lap2: parseTime(row.LAP2),
      lap3: parseTime(row.LAP3),
      totalTime: deriveTotalTime(row),
      penalty: (row.PEN ?? "").trim(),
    };
  });
}

const base = (import.meta.env.BASE_URL ?? "/").replace(/\/*$/, "") + "/";

export async function fetchRacesManifest(): Promise<RaceOption[]> {
  const res = await fetch(`${base}races/manifest.json`);
  if (!res.ok) throw new Error("Could not load races list.");
  const text = await res.text();
  if (text.trimStart().startsWith("<!"))
    throw new Error("races/manifest.json not found. Add public/races/manifest.json.");
  const list = JSON.parse(text) as RaceOption[];
  return Array.isArray(list) ? list : [];
}

export interface LoadRaceResult {
  riders: Rider[];
  splits: SplitData | null;
}

export async function loadRaceCsv(race: RaceOption): Promise<LoadRaceResult> {
  const res = await fetch(`${base}races/${race.file}`);
  if (!res.ok) throw new Error(`Could not load ${race.file}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<!"))
    throw new Error(`races/${race.file} not found. Add the CSV to public/races/`);
  const rows = parseSocalCsv(text);
  const riders = csvRowsToRiders(rows, race.id);
  const splits = buildSplitsFromRows(rows, race.id);
  return { riders, splits };
}

/** Load races from a list and return concatenated riders (splits not returned). */
export async function loadRaces(races: RaceOption[]): Promise<Rider[]> {
  if (!races.length) return [];
  const results = await Promise.all(races.map((r) => loadRaceCsv(r)));
  return results.flatMap((r) => r.riders);
}

/** Load all races for a given year. */
export async function loadRacesForYear(raceOptions: RaceOption[], year: number): Promise<Rider[]> {
  const forYear = raceOptions.filter((r) => r.year === year);
  return loadRaces(forYear);
}

/** Load all races from manifest (all years). */
export async function loadAllRaces(races: RaceOption[]): Promise<Rider[]> {
  return loadRaces(races);
}
