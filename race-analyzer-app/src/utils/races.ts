import type { Rider } from "../types";
import { REGION_MAP } from "../constants/regions";
import { detectCategory } from "./category";
import { parseTime } from "./time";

export interface RaceOption {
  id: number;
  name: string;
  file: string;
}

/** Row shape from scraper CSV (STATUS_GROUP, CATEGORY, BIB, PLC, NAME, TEAM, LAPS, LAP1..LAP4, PEN, TIME) */
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

/** Map CSV rows to Rider[] for a given race id. */
function csvRowsToRiders(rows: CsvRow[], raceId: number): Rider[] {
  return rows.map((row, i) => {
    const catRaw = (row.CATEGORY ?? "").trim();
    const team = (row.TEAM ?? "").trim();
    const grade = catRaw.match(/\bGrade\s*[678]\b/i) ? "ms" : "hs";
    return {
      id: `${raceId}-${row.BIB ?? ""}-${row.ID ?? ""}-${i}`,
      race: raceId,
      grade,
      category: detectCategory(catRaw),
      categoryRaw: catRaw,
      gender: catRaw.toLowerCase().includes("girl") ? "girls" : "boys",
      place: parseInt(row.PLC ?? "", 10) || 999,
      number: (row.BIB ?? "").trim(),
      name: (row.NAME ?? "").trim(),
      team,
      teamUpper: team.toUpperCase(),
      region: REGION_MAP[team.toUpperCase()] ?? "Other",
      lapsCompleted: (row.LAPS ?? "").trim(),
      lap1: parseTime(row.LAP1),
      lap2: parseTime(row.LAP2),
      lap3: parseTime(row.LAP3),
      totalTime: parseTime(row.TIME),
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

export async function loadRaceCsv(race: RaceOption): Promise<Rider[]> {
  const res = await fetch(`${base}races/${race.file}`);
  if (!res.ok) throw new Error(`Could not load ${race.file}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<!"))
    throw new Error(`races/${race.file} not found. Add the CSV to public/races/`);
  const rows = parseSocalCsv(text);
  return csvRowsToRiders(rows, race.id);
}
