/**
 * Sync public/races/manifest.json with all CSV files in public/races/.
 * - Keeps existing manifest entries (matched by "file"); preserves their id/name/year.
 * - Adds any CSV in the folder that isn't in the manifest (generates id and name from filename).
 * Run from repo root: node race-analyzer-app/scripts/sync-races-manifest.cjs
 */

const fs = require("fs");
const path = require("path");

const RACES_DIR = path.join(__dirname, "../public/races");
const MANIFEST_PATH = path.join(RACES_DIR, "manifest.json");

function listCsvFiles(dir) {
  const names = fs.readdirSync(dir);
  return names.filter((n) => n.endsWith(".csv")).sort();
}

function parseFilename(file) {
  const base = file.replace(/\.csv$/i, "");
  const yearMatch = base.match(/(\d{4})$/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
  const name = base.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return { name, year };
}

function main() {
  const csvFiles = listCsvFiles(RACES_DIR);
  let existing = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
  }

  const byFile = new Map(existing.map((e) => [e.file, e]));
  const usedIds = new Set(existing.map((e) => e.id));

  let nextId = 400000;
  function getNextId() {
    while (usedIds.has(nextId)) nextId++;
    usedIds.add(nextId);
    return nextId++;
  }

  const out = [];
  for (const file of csvFiles) {
    const entry = byFile.get(file);
    if (entry) {
      out.push(entry);
      continue;
    }
    const { name, year } = parseFilename(file);
    out.push({
      id: getNextId(),
      name: name || file,
      year: year ?? undefined,
      file,
    });
  }

  out.sort((a, b) => {
    const yA = a.year ?? 0;
    const yB = b.year ?? 0;
    if (yA !== yB) return yB - yA;
    return (a.name || "").localeCompare(b.name || "");
  });

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote", MANIFEST_PATH, "with", out.length, "race(s).");
}

main();
