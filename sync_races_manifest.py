"""
Sync race-analyzer-app/public/races/manifest.json with all CSV files in that directory.
- Keeps existing manifest entries (matched by "file"); preserves their id/name/year.
- Adds any CSV in the folder that isn't in the manifest (generates id and name from filename).

Run from repo root: python sync_races_manifest.py
Can be called from other scripts (e.g. scraper) after writing new CSVs.
"""

import json
import re
from pathlib import Path
from typing import Optional

# Paths relative to this script (repo root)
SCRIPT_DIR = Path(__file__).resolve().parent
RACES_DIR = SCRIPT_DIR / "race-analyzer-app" / "public" / "races"
MANIFEST_PATH = RACES_DIR / "manifest.json"

MIN_NEW_ID = 400000


def list_csv_files(dir_path: Path) -> list[str]:
    if not dir_path.is_dir():
        return []
    return sorted(f.name for f in dir_path.iterdir() if f.suffix.lower() == ".csv")


def parse_filename(filename: str) -> tuple[Optional[str], Optional[int]]:
    base = filename[:-4] if filename.lower().endswith(".csv") else filename
    year_match = re.search(r"(\d{4})$", base)
    year = int(year_match.group(1)) if year_match else None
    name = base.replace("_", " ").strip()
    while "  " in name:
        name = name.replace("  ", " ")
    return name or None, year


def sync_manifest() -> list[dict]:
    csv_files = list_csv_files(RACES_DIR)
    existing: list[dict] = []
    if MANIFEST_PATH.exists():
        try:
            raw = json.loads(MANIFEST_PATH.read_text())
            existing = raw if isinstance(raw, list) else []
        except (json.JSONDecodeError, OSError):
            existing = []

    by_file = {e["file"]: e for e in existing}
    used_ids = {e["id"] for e in existing}

    def next_id() -> int:
        n = MIN_NEW_ID
        while n in used_ids:
            n += 1
        used_ids.add(n)
        return n

    out: list[dict] = []
    for file in csv_files:
        if file in by_file:
            out.append(by_file[file])
            continue
        name, year = parse_filename(file)
        out.append({
            "id": next_id(),
            "name": name or file,
            "year": year,
            "file": file,
        })

    out.sort(key=lambda e: (-(e.get("year") or 0), e.get("name") or ""))

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(out, indent=2) + "\n")
    return out


if __name__ == "__main__":
    result = sync_manifest()
    print(f"Wrote {MANIFEST_PATH} with {len(result)} race(s).")
