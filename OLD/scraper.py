"""
Scrape participant data from SoCal Youth Cycling League results.
Uses the RACE RESULT API (raceresult.com).

Column names are derived from the list API (DataFields / Fields) so the CSV
keeps BIB, ID, PLC, NAME, TEAM, LAP1–LAP4, PEN, TIME for app compatibility.
If the league adds more fields to the published list (e.g. gun time, chip time,
split times), they will be included as extra columns; the app ignores unknown
columns. To get Time.Gun / Time.Chip / split times, the event must add those
fields to the "Individual Results - ALL" list in RACE RESULT, or expose a
Custom API (data/list?&fields=...) with the desired fields.
"""

import json
import os
import re
import time
from typing import Optional

import requests
import pandas as pd


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
        """Fetch event configuration including API key and available lists."""
        url = f"https://my.raceresult.com/{self.event_id}/RRPublish/data/config"
        params = {"lang": "en", "page": "results", "noVisitor": "1", "v": "1"}
        
        response = requests.get(url, params=params, headers=self.headers)
        response.raise_for_status()
        self.config = response.json()
        
        self.key = self.config.get("key")
        self.server = self.config.get("server", "my3.raceresult.com")
        
        return self.config
    
    def get_results_raw(self, list_name: str = None) -> dict:
        """Fetch raw results data from API. If list_name is None, uses first available list from config."""
        if not self.key:
            self.get_config()
        
        if list_name is None:
            lists = self.config.get("lists", [])
            # Normalize: config may have list of strings or list of dicts with name/listname
            list_names = []
            for item in lists:
                if isinstance(item, str):
                    list_names.append(item)
                elif isinstance(item, dict):
                    list_names.append(item.get("Name") or item.get("name") or item.get("listname") or str(item))
            if not list_names:
                list_name = "02 - Result Lists|01-Individual Results - ALL"  # fallback
            else:
                list_name = None
                for name in list_names:
                    if "Individual" in name or "ALL" in name or "Results" in name:
                        list_name = name
                        break
                if list_name is None:
                    list_name = list_names[0]
        
        url = f"https://{self.server}/{self.event_id}/RRPublish/data/list"
        params = {
            "key": self.key,
            "listname": list_name,
            "page": "results",
            "contest": "0",
            "r": "all"  # "all" instead of "leaders" to get all participants
        }
        
        response = requests.get(url, params=params, headers=self.headers)
        response.raise_for_status()
        return response.json()

    def get_participant_splits(self, pid: int) -> Optional[dict]:
        """Fetch splits for one participant (pid). Returns dict with TIME_GUN, TIME_CHIP, LAP1_GUN, LAP1_CHIP, etc., or None on error."""
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
        self._last_splits_raw = splits_list  # for logging Names when fetch_splits runs
        return self._parse_splits_response(splits_list)

    @staticmethod
    def _sanitize_split_name(name: str) -> str:
        """Turn split name into a safe CSV column prefix: 'Lap1 Split2' -> LAP1_SPLIT2."""
        s = (name or "").strip().upper()
        s = re.sub(r"[^A-Z0-9]+", "_", s).strip("_")
        return s or "SPLIT"

    @staticmethod
    def _parse_splits_response(splits: list) -> dict:
        """Extract Gun/Chip/TOD/Sector from every split (including call-outs) into flat dict for CSV."""
        out = {}
        norm = lambda x: (x or "").strip().lower().replace(" ", "")

        for sp in splits:
            name = sp.get("Name") or ""
            if not name:
                continue
            # Add columns for every split name; use empty when Exists is false so schema is consistent
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

            # Every split (Start, Lap1 Split1, Announcer, etc.) gets call-out columns
            if prefix and prefix != "FINISH":
                out[f"{prefix}_GUN"] = gun
                out[f"{prefix}_CHIP"] = chip
                if tod:
                    out[f"{prefix}_TOD"] = tod
                if sector:
                    out[f"{prefix}_SECTOR"] = sector

        return out

    # Known DataFields expression -> CSV header (for app compatibility). Order matches typical API.
    _DATA_FIELD_NAMES = [
        "BIB", "ID", "PLC", "NAME", "TEAM", "PTS", "LAPS",
        "LAP1", "LAP2", "LAP3", "LAP4", "PEN", "TIME",
    ]
    _DROP_PATTERN = re.compile(
        r"^(isLeaderDF|ShowPoints|Lap[1-4]Color|LapStatusColor.*|WarningColor|C_.*|iif_.*|ColSpan|ColOffset|DynamicFormat)$"
    )

    def _get_column_names(self, raw_data: dict, max_index: int) -> list[str]:
        """
        Resolve column names for each row index from API (DataFields / list.Fields).
        Uses canonical names for known fields so CSV stays compatible with the app.
        Any extra columns (e.g. TIME_GUN, split times) are included if the list adds them.
        """
        data_fields = raw_data.get("DataFields") or []
        list_meta = raw_data.get("list") or {}
        list_fields = list_meta.get("Fields") or []
        # Label by index from list Fields (display order); fallback to DataFields expression
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
                    # Sanitize expression to a short column name (e.g. for future Time.Gun, splits)
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
        """
        Parse the nested results structure into a flat DataFrame.

        Structure is: data -> status_group -> category -> [rows]
        Each row is a list of values; column order matches DataFields from the API.
        Uses dynamic column names so any extra fields (e.g. gun/chip/split times)
        added to the published list in RACE RESULT will be included in the CSV.
        """
        data = raw_data.get("data", {})
        # Infer max columns from first row
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

        if not df.empty:
            if "NAME" in df.columns:
                df["NAME"] = df["NAME"].str.replace(r"\s*\(PTS LEADER\)", "", regex=True)

        return df
    
    def _enrich_with_splits(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fetch splits per participant (by ID) and add TIME_GUN, TIME_CHIP, LAP*_GUN, LAP*_CHIP columns. Rate-limited."""
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
            if (i + 1) % 50 == 0 or i == 0:
                print(f"  Fetching splits {i + 1}/{n}...")
            data = self.get_participant_splits(pid)
            pid_to_splits[pid] = data
            if i == 0:
                raw_names = [sp.get("Name") for sp in getattr(self, "_last_splits_raw", [])]
                print(f"  Splits API returned (Names): {raw_names}")
                if data:
                    cols_preview = ", ".join(sorted(data.keys())[:20])
                    if len(data) > 20:
                        cols_preview += f", ... (+{len(data) - 20} more)"
                    print(f"  Capture columns (first participant): {cols_preview}")
            time.sleep(1.1)

        # Collect all split column names (lap-level + call-outs like LAP1_SPLIT1_GUN, START_GUN, etc.)
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
        """
        Main method: scrape all results for an event.

        Args:
            output_file: Optional CSV path to save results
            fetch_splits: If True, call data/splits per participant and add TIME_GUN, TIME_CHIP, LAP* columns

        Returns:
            DataFrame with all participant data
        """
        print(f"Fetching config for event {self.event_id}...")
        self.get_config()
        print(f"  Event: {self.config.get('eventname', 'Unknown')}")
        print(f"  API Key: {self.key}")
        print(f"  Server: {self.server}")
        
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
    
    def get_available_lists(self) -> list:
        """Get all available result list names."""
        if not self.config:
            self.get_config()
        return self.config.get("lists", [])
    
    def get_contests(self) -> dict:
        """Get all race categories/contests."""
        if not self.config:
            self.get_config()
        return self.config.get("contests", {})

    def get_event_name(self) -> str:
        """Race name from API (includes year, e.g. 'Race 2 - Vail Lake Challenge 2026')."""
        if not self.config:
            self.get_config()
        return self.config.get("eventname", "Unknown")

    def get_event_filename(self, extension: str = ".csv", directory: str = "") -> str:
        """Safe filename from event name and year (from API eventname)."""
        name = self.get_event_name()
        # Sanitize: spaces -> underscores, drop chars unsafe in filenames
        safe = re.sub(r'[\s]+', '_', name)
        safe = re.sub(r'[\\/:*?"<>|]', '', safe)
        safe = re.sub(r'_+', '_', safe).strip('_') or "race_results"
        if directory:
            return os.path.join(directory, safe + extension)
        return safe + extension


def scrape_event(event_id: int, output_file: str = None, fetch_splits: bool = False) -> pd.DataFrame:
    """
    Convenience function to scrape an event.

    Args:
        event_id: RACE RESULT event ID (from URL, e.g., 376410)
        output_file: Optional CSV path
        fetch_splits: If True, fetch per-participant splits (TIME_GUN, TIME_CHIP, etc.)

    Returns:
        DataFrame with all results
    """
    scraper = RaceResultScraper(event_id)
    return scraper.scrape(output_file=output_file, fetch_splits=fetch_splits)


def scrape_all_events(
    event_ids: list[int],
    output_dir: str,
    skip_existing: bool = True,
    fetch_splits: bool = False,
) -> list[dict]:
    """
    Scrape each event, save CSVs into output_dir with event-based filenames,
    and write manifest.json there. If skip_existing, events already in manifest
    are skipped. If fetch_splits, calls data/splits per participant to add TIME_GUN, TIME_CHIP, etc.
    Returns full manifest (id, name, year, file).
    """
    os.makedirs(output_dir, exist_ok=True)
    manifest_path = os.path.join(output_dir, "manifest.json")
    existing_by_id = {}
    if skip_existing and os.path.isfile(manifest_path):
        with open(manifest_path) as f:
            for entry in json.load(f):
                existing_by_id[entry["id"]] = entry
        print(f"  Loaded manifest: {len(existing_by_id)} events already captured")
    to_scrape = [eid for eid in event_ids if eid not in existing_by_id]
    if to_scrape:
        print(f"  Scraping {len(to_scrape)} new event(s): {to_scrape}")
    else:
        print("  No new events to scrape")
    new_entries = []
    for eid in to_scrape:
        scraper = RaceResultScraper(eid)
        csv_path = scraper.get_event_filename(extension=".csv", directory=output_dir)
        scraper.scrape(output_file=csv_path, fetch_splits=fetch_splits)
        name = scraper.get_event_name()
        year_match = re.search(r"\b(19|20)\d{2}\b", name)
        year = int(year_match.group(0)) if year_match else None
        new_entries.append({
            "id": eid,
            "name": name,
            "year": year,
            "file": os.path.basename(csv_path),
        })
    # Merge: order by event_ids; use existing entry or new entry
    manifest = []
    for eid in event_ids:
        if eid in existing_by_id:
            manifest.append(existing_by_id[eid])
        else:
            manifest.append(next(e for e in new_entries if e["id"] == eid))
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  Wrote {manifest_path} ({len(manifest)} total)")
    return manifest


# --- Edit these; run: python3 scraper.py -------------------------------------
EVENT_IDS = [
    # 270161,
    # 280111,
    # 282832,
    # 284709,
    # 288055,
    # 327767,
    # 330110,
    # 332683,
    # 337399,
    # 338294,
    376410,   # Lake Perris, Beach to Boulders - 2026
    383847,   # Vail Lake, Vail Lake Challenge - 2026
]
OUTPUT_DIR = "race-analyzer-app/public/races"
OVERWRITE_EXISTING = True  # Set True to re-pull all EVENT_IDS and overwrite CSVs/manifest
FETCH_SPLITS = True  # Set True to fetch data/splits per participant (TIME_GUN, TIME_CHIP, LAP*_GUN, LAP*_CHIP); ~1.1s per rider
# -----------------------------------------------------------------------------


if __name__ == "__main__":
    print("Scraping events:", EVENT_IDS, "overwrite=", OVERWRITE_EXISTING, "fetch_splits=", FETCH_SPLITS)
    manifest = scrape_all_events(
        EVENT_IDS, OUTPUT_DIR,
        skip_existing=not OVERWRITE_EXISTING,
        fetch_splits=FETCH_SPLITS,
    )
    print("\nManifest:")
    for m in manifest:
        print(f"  {m['id']}: {m['name']} -> {m['file']}")