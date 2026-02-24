"""
Scrape participant data from SoCal Youth Cycling League results.
Uses the RACE RESULT API (raceresult.com)
"""

import json
import os
import re
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
    
    def parse_results(self, raw_data: dict) -> pd.DataFrame:
        """
        Parse the nested results structure into a flat DataFrame.
        
        Structure is: data -> status_group -> category -> [rows]
        Each row is a list of values matching the column order.
        """
        # Column labels from the Fields definition
        columns = ["BIB", "ID", "PLC", "NAME", "TEAM", "PTS", "LAPS", 
                   "LAP1", "LAP2", "LAP3", "LAP4", "PEN", "TIME",
                   "isLeaderDF", "ShowPoints", "Lap1Color", "Lap2Color", 
                   "Lap3Color", "Lap4Color", "WarningColor"]
        
        all_rows = []
        # Data is at top level, not inside "list"
        data = raw_data.get("data", {})
        
        for status_group, categories in data.items():
            # Clean status group name (e.g., "#1_PROTEST PERIOD" -> "PROTEST PERIOD")
            status = re.sub(r'^#\d+_', '', status_group)
            # Newer API: categories is dict (category_key -> rows). Older API: categories is list of rows.
            if isinstance(categories, list):
                category_blocks = [("", categories)]
            else:
                category_blocks = [
                    (re.sub(r'^#\d+_', '', k), rows)
                    for k, rows in categories.items()
                ]
            for category_name, rows in category_blocks:
                category = category_name or "All"
                for row in rows:
                    # Skip summary rows (single integer = count of remaining)
                    if isinstance(row, int):
                        continue
                    if isinstance(row, list) and len(row) == 1 and isinstance(row[0], int):
                        continue
                    
                    # Build row dict
                    row_dict = {"STATUS_GROUP": status, "CATEGORY": category}
                    for i, val in enumerate(row):
                        if i < len(columns):
                            row_dict[columns[i]] = val
                    
                    all_rows.append(row_dict)
        
        df = pd.DataFrame(all_rows)
        
        # Clean up the data
        if not df.empty:
            # Clean NAME field (remove leader indicator)
            if "NAME" in df.columns:
                df["NAME"] = df["NAME"].str.replace(r'\s*\(PTS LEADER\)', '', regex=True)
            
            # Drop internal formatting columns
            drop_cols = ["isLeaderDF", "ShowPoints", "Lap1Color", "Lap2Color", 
                        "Lap3Color", "Lap4Color", "WarningColor"]
            df = df.drop(columns=[c for c in drop_cols if c in df.columns], errors='ignore')
        
        return df
    
    def scrape(self, output_file: str = None) -> pd.DataFrame:
        """
        Main method: scrape all results for an event.
        
        Args:
            output_file: Optional CSV path to save results
            
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


def scrape_event(event_id: int, output_file: str = None) -> pd.DataFrame:
    """
    Convenience function to scrape an event.
    
    Args:
        event_id: RACE RESULT event ID (from URL, e.g., 376410)
        output_file: Optional CSV path
        
    Returns:
        DataFrame with all results
    
    Example:
        df = scrape_event(376410, "results.csv")
    """
    scraper = RaceResultScraper(event_id)
    return scraper.scrape(output_file)


def scrape_all_events(
    event_ids: list[int],
    output_dir: str,
    skip_existing: bool = True,
) -> list[dict]:
    """
    Scrape each event, save CSVs into output_dir with event-based filenames,
    and write manifest.json there. If skip_existing, events already in manifest
    are skipped and new events are appended. Returns full manifest (id, name, year, file).
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
        scraper.scrape(output_file=csv_path)
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
    270161,
    280111,
    282832,
    284709,
    288055,
    327767,
    330110,
    332683,
    337399,
    338294,
    376410,   # Lake Perris, Beach to Boulders - 2026
    383847,   # Vail Lake, Vail Lake Challenge - 2026
]
OUTPUT_DIR = "race-analyzer-app/public/races"
# -----------------------------------------------------------------------------


if __name__ == "__main__":
    print("Scraping events:", EVENT_IDS)
    manifest = scrape_all_events(EVENT_IDS, OUTPUT_DIR)
    print("\nManifest:")
    for m in manifest:
        print(f"  {m['id']}: {m['name']} -> {m['file']}")