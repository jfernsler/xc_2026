import type { Rider } from "../types";
import { REGION_MAP } from "../constants/regions";
import { detectCategory } from "./category";
import { parseTime } from "./time";

/** Parse NICA-style race results CSV into Rider rows */
export function parseCSV(text: string): Rider[] {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  let skipIndex = 0;
  if (lines[0].toLowerCase().includes("race") && lines[0].toLowerCase().includes("name")) skipIndex = 1;
  const rows: Rider[] = [];
  for (let i = skipIndex; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < 10) continue;
    const grade = (c[1] ?? "").trim().toLowerCase();
    const catRaw = (c[2] ?? "").trim();
    const cat = grade === "ms" ? "ms" : detectCategory(catRaw);
    const team = (c[6] ?? "").trim();
    rows.push({
      id: c[0] + "-" + c[3] + "-" + c[4] + "-" + i,
      race: parseInt(c[0], 10) || 1,
      grade,
      category: cat,
      categoryRaw: catRaw,
      gender: catRaw.toLowerCase().includes("girl") ? "girls" : "boys",
      place: parseInt(c[3], 10) || 999,
      number: (c[4] ?? "").trim(),
      name: (c[5] ?? "").trim(),
      team,
      teamUpper: team.toUpperCase(),
      region: REGION_MAP[team.toUpperCase()] ?? "Other",
      lapsCompleted: (c[8] ?? "").trim(),
      lap1: parseTime(c[9]),
      lap2: parseTime(c[10]),
      lap3: parseTime(c[11]),
      totalTime: parseTime(c[14]),
      penalty: (c[13] ?? "").trim(),
    });
  }
  return rows;
}
