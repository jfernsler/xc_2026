"""
Unified race and map scraper.

- Race data: RACE RESULT API (event_id) → CSV in races dir + manifest sync.
- Map data: E-Timing API (map_id) → JSON in maps dir + manifest (optional; map_id may be null).

Input: list of { "event_id": int, "map_id": int | None }.
Options: --overwrite, --fetch-splits, --fetch-maps, --maps-only (skip race CSV, only fetch maps).
"""

import argparse
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Optional

import pandas as pd
import requests

# -----------------------------------------------------------------------------
# Paths
# -----------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
RACES_DIR = SCRIPT_DIR / "race-analyzer-app" / "public" / "races"
MAPS_DIR = SCRIPT_DIR / "race-analyzer-app" / "public" / "maps"
MIN_NEW_ID = 400000

# E-Timing
BASE_URL = "https://etracking-server.fly.dev"
M_TO_MI = 1 / 1609.344
M_TO_FT = 3.28084


# =============================================================================
# Races manifest sync (from sync_races_manifest)
# =============================================================================

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


def sync_races_manifest(races_dir: Optional[Path] = None) -> list[dict]:
    """Sync manifest.json with CSV files in races_dir. Preserves existing id/name/year by file."""
    races_dir = races_dir or RACES_DIR
    manifest_path = races_dir / "manifest.json"
    csv_files = list_csv_files(races_dir)
    existing: list[dict] = []
    if manifest_path.exists():
        try:
            raw = json.loads(manifest_path.read_text())
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
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(out, indent=2) + "\n")
    return out


# =============================================================================
# RACE RESULT scraper (from scraper.py)
# =============================================================================

class RaceResultScraper:
    """Scraper for RACE RESULT timing system data."""

    def __init__(self, event_id: int):
        self.event_id = event_id
        self.config = None
        self.key = None
        self.server = "my3.raceresult.com"
        self.headers = {
            "accept": "*/*",
            "origin": "https://www.socalyouthcycling.org",
            "referer": "https://www.socalyouthcycling.org/",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }

    def get_config(self) -> dict:
        url = f"https://my.raceresult.com/{self.event_id}/RRPublish/data/config"
        params = {"lang": "en", "page": "results", "noVisitor": "1", "v": "1"}
        response = requests.get(url, params=params, headers=self.headers)
        response.raise_for_status()
        self.config = response.json()
        self.key = self.config.get("key")
        self.server = self.config.get("server", "my3.raceresult.com")
        return self.config

    def get_results_raw(self, list_name: str = None) -> dict:
        if not self.key:
            self.get_config()
        if list_name is None:
            lists = self.config.get("lists", [])
            list_names = []
            for item in lists:
                if isinstance(item, str):
                    list_names.append(item)
                elif isinstance(item, dict):
                    list_names.append(item.get("Name") or item.get("name") or item.get("listname") or str(item))
            if not list_names:
                list_name = "02 - Result Lists|01-Individual Results - ALL"
            else:
                list_name = None
                for name in list_names:
                    if "Individual" in name or "ALL" in name or "Results" in name:
                        list_name = name
                        break
                if list_name is None:
                    list_name = list_names[0]
        url = f"https://{self.server}/{self.event_id}/RRPublish/data/list"
        params = {"key": self.key, "listname": list_name, "page": "results", "contest": "0", "r": "all"}
        response = requests.get(url, params=params, headers=self.headers)
        response.raise_for_status()
        return response.json()

    def get_participant_splits(self, pid: int) -> Optional[dict]:
        if not self.key:
            self.get_config()
        url = f"https://{self.server}/{self.event_id}/RRPublish/data/splits"
        params = {"key": self.key, "pid": pid}
        try:
            response = requests.get(url, params=params, headers=self.headers, timeout=15)
            response.raise_for_status()
            data = response.json()
        except Exception:
            return None
        splits_list = data.get("Splits") or []
        self._last_splits_raw = splits_list
        return self._parse_splits_response(splits_list)

    @staticmethod
    def _sanitize_split_name(name: str) -> str:
        s = (name or "").strip().upper()
        s = re.sub(r"[^A-Z0-9]+", "_", s).strip("_")
        return s or "SPLIT"

    @staticmethod
    def _parse_splits_response(splits: list) -> dict:
        out = {}
        norm = lambda x: (x or "").strip().lower().replace(" ", "")
        for sp in splits:
            name = sp.get("Name") or ""
            if not name:
                continue
            gun = sp.get("Gun") or ""
            chip = sp.get("Chip") or ""
            tod = sp.get("TOD") or ""
            sector = sp.get("Sector") or ""
            if not sp.get("Exists"):
                gun = chip = tod = sector = ""
            prefix = RaceResultScraper._sanitize_split_name(name)
            if norm(name) == "finish":
                out["TIME_GUN"] = gun
                out["TIME_CHIP"] = chip
                out["TIME_TOD"] = tod
            elif norm(name) == "lap1":
                out["LAP1_GUN"] = gun
                out["LAP1_CHIP"] = chip
            elif norm(name) == "lap2":
                out["LAP2_GUN"] = gun
                out["LAP2_CHIP"] = chip
            elif norm(name) == "lap3":
                out["LAP3_GUN"] = gun
                out["LAP3_CHIP"] = chip
            elif norm(name) == "lap4":
                out["LAP4_GUN"] = gun
                out["LAP4_CHIP"] = chip
            if prefix and prefix != "FINISH":
                out[f"{prefix}_GUN"] = gun
                out[f"{prefix}_CHIP"] = chip
                if tod:
                    out[f"{prefix}_TOD"] = tod
                if sector:
                    out[f"{prefix}_SECTOR"] = sector
        return out

    _DATA_FIELD_NAMES = [
        "BIB", "ID", "PLC", "NAME", "TEAM", "PTS", "LAPS",
        "LAP1", "LAP2", "LAP3", "LAP4", "PEN", "TIME",
    ]
    _DROP_PATTERN = re.compile(
        r"^(isLeaderDF|ShowPoints|Lap[1-4]Color|LapStatusColor.*|WarningColor|C_.*|iif_.*|ColSpan|ColOffset|DynamicFormat)$"
    )

    def _get_column_names(self, raw_data: dict, max_index: int) -> list[str]:
        data_fields = raw_data.get("DataFields") or []
        list_meta = raw_data.get("list") or {}
        list_fields = list_meta.get("Fields") or []
        label_by_pos = {}
        for i, f in enumerate(list_fields):
            label = (f.get("Label") or "").strip()
            if label:
                label_by_pos[i] = "BIB" if label == "NO" else label
        names = []
        for i in range(max_index):
            if i < len(self._DATA_FIELD_NAMES):
                names.append(self._DATA_FIELD_NAMES[i])
            elif i in label_by_pos:
                names.append(label_by_pos[i])
            elif i < len(data_fields):
                expr = data_fields[i]
                if isinstance(expr, str):
                    if "TimeOrStatus" in expr or "Time." in expr:
                        name = "TIME_DISPLAY" if "TimeOrStatus" in expr else re.sub(r"[^A-Za-z0-9]", "_", expr)[:32]
                    else:
                        name = re.sub(r"[^A-Za-z0-9]", "_", expr)[:32].strip("_") or f"COL{i}"
                else:
                    name = f"COL{i}"
                names.append(name)
            else:
                names.append(f"COL{i}")
        return names

    def parse_results(self, raw_data: dict) -> pd.DataFrame:
        data = raw_data.get("data", {})
        max_cols = 0
        for categories in data.values():
            rows = categories if isinstance(categories, list) else next(iter(categories.values()), [])
            if rows and isinstance(rows[0], list):
                max_cols = max(max_cols, len(rows[0]))
                break
        if max_cols == 0:
            max_cols = len(self._DATA_FIELD_NAMES) + 8
        columns = self._get_column_names(raw_data, max_cols)
        all_rows = []
        for status_group, categories in data.items():
            status = re.sub(r"^#\d+_", "", status_group)
            if isinstance(categories, list):
                category_blocks = [("", categories)]
            else:
                category_blocks = [
                    (re.sub(r"^#\d+_", "", k), rows)
                    for k, rows in categories.items()
                ]
            for category_name, rows in category_blocks:
                category = category_name or "All"
                for row in rows:
                    if isinstance(row, int):
                        continue
                    if isinstance(row, list) and len(row) == 1 and isinstance(row[0], int):
                        continue
                    row_dict = {"STATUS_GROUP": status, "CATEGORY": category}
                    for i, val in enumerate(row):
                        if i < len(columns):
                            name = columns[i]
                            if not self._DROP_PATTERN.match(name):
                                row_dict[name] = val
                    all_rows.append(row_dict)
        df = pd.DataFrame(all_rows)
        if not df.empty and "NAME" in df.columns:
            df["NAME"] = df["NAME"].str.replace(r"\s*\(PTS LEADER\)", "", regex=True)
        return df

    def _enrich_with_splits(self, df: pd.DataFrame) -> pd.DataFrame:
        try:
            pid_col = df["ID"].astype(str).str.strip()
            pids = pid_col.dropna().replace("", pd.NA).dropna().astype(int).unique().tolist()
        except Exception:
            return df
        if not pids:
            return df
        n = len(pids)
        pid_to_splits = {}
        for i, pid in enumerate(pids):
            print(f"  Fetching splits {i + 1}/{n}...", end="\r", flush=True)
            data = self.get_participant_splits(pid)
            pid_to_splits[pid] = data
            if i == 0:
                print()  # newline after first progress line
                raw_names = [sp.get("Name") for sp in getattr(self, "_last_splits_raw", [])]
                print(f"  Splits API returned (Names): {raw_names}")
                if data:
                    cols_preview = ", ".join(sorted(data.keys())[:20])
                    if len(data) > 20:
                        cols_preview += f", ... (+{len(data) - 20} more)"
                    print(f"  Capture columns (first participant): {cols_preview}")
            time.sleep(1.1)
        print(f"  Fetching splits {n}/{n}... done")  # final newline/confirmation
        all_keys = set()
        for data in pid_to_splits.values():
            if data:
                all_keys |= set(data.keys())
        split_cols = sorted(all_keys)
        print(f"  Capture columns total: {len(split_cols)} — {', '.join(split_cols)}")

        def row_splits(pid_val):
            try:
                pid = int(str(pid_val).strip())
            except (ValueError, TypeError):
                return {c: "" for c in split_cols}
            data = pid_to_splits.get(pid) or {}
            return {c: data.get(c, "") for c in split_cols}

        rows = df.to_dict("records")
        for r in rows:
            s = row_splits(r.get("ID"))
            for k, v in s.items():
                r[k] = v
        return pd.DataFrame(rows)

    def scrape(self, output_file: str = None, fetch_splits: bool = False) -> pd.DataFrame:
        print(f"Fetching config for event {self.event_id}...")
        self.get_config()
        print(f"  Event: {self.config.get('eventname', 'Unknown')}")
        print("Fetching results...")
        raw = self.get_results_raw()
        print("Parsing data...")
        df = self.parse_results(raw)
        print(f"  Found {len(df)} participants")
        if fetch_splits and "ID" in df.columns:
            df = self._enrich_with_splits(df)
        if output_file is None:
            output_file = self.get_event_filename()
        if output_file:
            df.to_csv(output_file, index=False)
            print(f"  Saved to {output_file}")
        return df

    def get_event_name(self) -> str:
        if not self.config:
            self.get_config()
        return self.config.get("eventname", "Unknown")

    def get_event_filename(self, extension: str = ".csv", directory: str = "") -> str:
        name = self.get_event_name()
        safe = re.sub(r'[\s]+', '_', name)
        safe = re.sub(r'[\\/:*?"<>|]', '', safe)
        safe = re.sub(r'_+', '_', safe).strip('_') or "race_results"
        if directory:
            return os.path.join(directory, safe + extension)
        return safe + extension


# =============================================================================
# E-Timing map scraper (from map_scraper.py)
# =============================================================================

def _parse_json_string(s: str) -> Any:
    if not s or not s.strip():
        return []
    data = json.loads(s)
    if isinstance(data, list) and data and isinstance(data[0], str):
        return [json.loads(x) for x in data]
    return data


def get_event(map_id: int) -> Optional[dict]:
    url = f"{BASE_URL}/events/get"
    params = {"eventID": map_id}
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        arr = r.json()
        if not arr:
            return None
        ev = arr[0]
        if isinstance(ev.get("groups"), str):
            ev["groups"] = json.loads(ev["groups"])
        return ev
    except Exception as e:
        print(f"  get_event({map_id}): {e}")
        return None


def get_courses(map_id: int) -> Optional[list]:
    url = f"{BASE_URL}/courses/get"
    params = {"eventID": map_id}
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        courses = r.json()
        if not isinstance(courses, list):
            return None
    except Exception as e:
        print(f"  get_courses({map_id}): {e}")
        return None
    out = []
    for c in courses:
        parsed = dict(c)
        for key in ("coordinates", "timingPoints", "elevations"):
            raw = c.get(key)
            if isinstance(raw, str):
                parsed[key] = _parse_json_string(raw)
            else:
                parsed[key] = raw or []
        tp = parsed.get("timingPoints") or []
        if tp and isinstance(tp[0], dict):
            parsed["timingPoints"] = [
                {
                    "type": p.get("type", "timingPoint"),
                    "lat": p["coordinates"][0],
                    "lng": p["coordinates"][1],
                    "distance": p.get("distance"),
                }
                for p in tp
            ]
        out.append(parsed)
    return out


def _convert_courses_to_unified_units(courses: list, event_units: str) -> tuple:
    use_imperial = (event_units or "").strip().lower() == "imperial"
    dist_factor = M_TO_MI if use_imperial else 1.0
    elev_factor = M_TO_FT if use_imperial else 1.0
    distance_unit = "mi" if use_imperial else "m"
    elevation_unit = "ft" if use_imperial else "m"
    converted = []
    for c in courses:
        course = dict(c)
        tp = course.get("timingPoints") or []
        course["timingPoints"] = [
            {**p, "distance": p["distance"] * dist_factor if p.get("distance") is not None else None}
            for p in tp
        ]
        elev = course.get("elevations") or []
        course["elevations"] = [
            [pt[0] * dist_factor, pt[1] * elev_factor]
            for pt in elev
            if isinstance(pt, (list, tuple)) and len(pt) >= 2
        ]
        converted.append(course)
    return converted, distance_unit, elevation_unit


def sync_maps_manifest(maps_dir: Optional[Path] = None) -> list[dict]:
    """Sync manifest.json with map JSON files in maps_dir. Reads metadata from each file."""
    maps_dir = maps_dir or MAPS_DIR
    manifest_path = maps_dir / "manifest.json"
    existing: list[dict] = []
    if manifest_path.exists():
        try:
            raw = json.loads(manifest_path.read_text())
            existing = raw if isinstance(raw, list) else []
        except (json.JSONDecodeError, OSError):
            existing = []

    by_map_id = {e["map_id"]: e for e in existing if "map_id" in e}

    for path in sorted(maps_dir.glob("*.json")):
        if path.name == "manifest.json":
            continue
        try:
            data = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        mid = data.get("map_id")
        eid = data.get("event_id")
        name = data.get("eventName")
        if mid is None or eid is None:
            continue
        if mid not in by_map_id:
            by_map_id[mid] = {"event_id": eid, "map_id": mid, "name": name, "file": path.name}

    out = sorted(by_map_id.values(), key=lambda e: e.get("map_id", 0))
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(out, indent=2) + "\n")
    return out


def scrape_map(event_id: int, map_id: int, output_dir: str) -> Optional[dict]:
    print(f"  map_id={map_id} (event_id={event_id})...")
    ev = get_event(map_id)
    if not ev:
        return None
    courses = get_courses(map_id)
    if not courses:
        return None
    event_name = ev.get("eventName") or f"Event_{map_id}"
    safe_name = re.sub(r'[\s]+', '_', event_name)
    safe_name = re.sub(r'[\\/:*?"<>|]', '', safe_name).strip('_') or f"map_{map_id}"
    courses_unified, distance_unit, elevation_unit = _convert_courses_to_unified_units(
        courses, ev.get("units")
    )
    payload = {
        "event_id": event_id,
        "map_id": map_id,
        "eventName": event_name,
        "eventDate": ev.get("eventDate"),
        "distanceUnit": distance_unit,
        "elevationUnit": elevation_unit,
        "courses": courses_unified,
    }
    os.makedirs(output_dir, exist_ok=True)
    filename = f"{safe_name}_{map_id}.json"
    path = os.path.join(output_dir, filename)
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"    -> {filename} ({len(courses)} course(s))")
    return {"event_id": event_id, "map_id": map_id, "name": event_name, "file": filename}


# =============================================================================
# Unified run
# =============================================================================

def run(
    events: list[dict],
    races_dir: Path,
    maps_dir: Path,
    *,
    overwrite: bool = False,
    fetch_splits: bool = False,
    fetch_maps: bool = True,
    maps_only: bool = False,
) -> tuple[list[dict], list[dict]]:
    """
    events: list of { "event_id": int, "map_id": int | None }
    Returns (races_manifest_entries, maps_manifest_entries).
    """
    races_dir = Path(races_dir)
    maps_dir = Path(maps_dir)
    races_manifest_path = races_dir / "manifest.json"
    maps_manifest_path = maps_dir / "manifest.json"

    # --- Races (unless maps_only) ---
    races_manifest = []
    if not maps_only:
        existing_by_id = {}
        if not overwrite and races_manifest_path.exists():
            with open(races_manifest_path) as f:
                for e in json.load(f):
                    existing_by_id[e["id"]] = e
        scraped_by_id = {}
        to_scrape = [e for e in events if overwrite or e["event_id"] not in existing_by_id]
        for item in to_scrape:
            eid = item["event_id"]
            scraper = RaceResultScraper(eid)
            csv_path = scraper.get_event_filename(extension=".csv", directory=str(races_dir))
            scraper.scrape(output_file=csv_path, fetch_splits=fetch_splits)
            name = scraper.get_event_name()
            year_match = re.search(r"\b(19|20)\d{2}\b", name)
            year = int(year_match.group(0)) if year_match else None
            scraped_by_id[eid] = {"id": eid, "name": name, "year": year, "file": os.path.basename(csv_path)}
        # Build full manifest in event order, then write and sync
        full_races = []
        for item in events:
            eid = item["event_id"]
            full_races.append(scraped_by_id.get(eid) or existing_by_id.get(eid))
        full_races = [e for e in full_races if e]
        full_races.sort(key=lambda e: (-(e.get("year") or 0), e.get("name") or ""))
        races_dir.mkdir(parents=True, exist_ok=True)
        with open(races_manifest_path, "w") as f:
            json.dump(full_races, f, indent=2)
        races_manifest = sync_races_manifest(races_dir)
    else:
        if races_manifest_path.exists():
            with open(races_manifest_path) as f:
                races_manifest = json.load(f)

    # --- Maps (only items with map_id; only if fetch_maps) ---
    maps_manifest = []
    if fetch_maps:
        existing_by_map_id = {}
        if not overwrite and maps_manifest_path.exists():
            with open(maps_manifest_path) as f:
                for e in json.load(f):
                    existing_by_map_id[e["map_id"]] = e
        for item in events:
            map_id = item.get("map_id")
            if map_id is None:
                continue
            if not overwrite and map_id in existing_by_map_id:
                maps_manifest.append(existing_by_map_id[map_id])
                continue
            entry = scrape_map(item["event_id"], map_id, str(maps_dir))
            if entry:
                maps_manifest.append(entry)
            elif map_id in existing_by_map_id:
                maps_manifest.append(existing_by_map_id[map_id])
        maps_dir.mkdir(parents=True, exist_ok=True)
        maps_manifest = sync_maps_manifest(maps_dir)
        print(f"  Wrote {maps_manifest_path} ({len(maps_manifest)} total)")

    return races_manifest, maps_manifest


# --- Config: event_id / map_id pairings (map_id None = no map) -----------------
EVENTS = [
    # {"event_id": 376410, "map_id": 16},   # Beach to Boulders 2026
    # {"event_id": 383847, "map_id": 17},   # Vail Lake Challenge 2026
    # {"event_id": 387799, "map_id": 18},   # Cachuma 2026
    # {"event_id": 389743, "map_id": 19},   # Victory at Vail 2026
    {"event_id": 392174, "map_id": 20},   # keysville 2026
    # {"event_id": 123456, "map_id": None},  # Example: race with no map
]
# --------------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="Scrape race results and/or maps from event_id/map_id list.")
    parser.add_argument("--overwrite", action="store_true", help="Re-fetch and overwrite existing CSVs/maps")
    parser.add_argument("--fetch-splits", action="store_true", help="Fetch per-participant splits (TIME_GUN, LAP*_GUN, etc.)")
    parser.add_argument("--fetch-maps", action="store_true", default=True, help="Fetch map JSON for items with map_id (default: True)")
    parser.add_argument("--no-fetch-maps", action="store_false", dest="fetch_maps", help="Do not fetch maps")
    parser.add_argument("--maps-only", action="store_true", help="Only fetch maps; do not scrape race CSVs")
    parser.add_argument("--races-dir", type=Path, default=RACES_DIR, help="Races output directory")
    parser.add_argument("--maps-dir", type=Path, default=MAPS_DIR, help="Maps output directory")
    args = parser.parse_args()

    print("Events:", EVENTS)
    print("overwrite=", args.overwrite, "fetch_splits=", args.fetch_splits, "fetch_maps=", args.fetch_maps, "maps_only=", args.maps_only)
    races_manifest, maps_manifest = run(
        EVENTS,
        args.races_dir,
        args.maps_dir,
        overwrite=args.overwrite,
        fetch_splits=args.fetch_splits,
        fetch_maps=args.fetch_maps,
        maps_only=args.maps_only,
    )
    print("\nRaces manifest:", len(races_manifest), "entries")
    for m in races_manifest:
        print(f"  {m.get('id')}: {m.get('name')} -> {m.get('file')}")
    print("\nMaps manifest:", len(maps_manifest), "entries")
    for m in maps_manifest:
        print(f"  event_id={m.get('event_id')} map_id={m.get('map_id')}: {m.get('name')} -> {m.get('file')}")


if __name__ == "__main__":
    main()
