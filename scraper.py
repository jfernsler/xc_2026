"""
Scrape participant data from SoCal Youth Cycling League results.
Uses the RACE RESULT API (raceresult.com)
"""

import requests
import pandas as pd
import re


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
    
    def get_results_raw(self, list_name: str = "02 - Result Lists|01-Individual Results - ALL") -> dict:
        """Fetch raw results data from API."""
        if not self.key:
            self.get_config()
        
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
            
            for category_key, rows in categories.items():
                # Clean category name (e.g., "#1_Varsity Boys" -> "Varsity Boys")
                category = re.sub(r'^#\d+_', '', category_key)
                
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


if __name__ == "__main__":
    # Example usage
    EVENT_ID = 376410
    
    df = scrape_event(EVENT_ID, output_file="socal_results.csv")
    
    print("\n" + "="*60)
    print("RESULTS PREVIEW")
    print("="*60)
    
    # Show columns
    print(f"\nColumns: {list(df.columns)}")
    
    # Show sample data
    print(f"\nFirst 10 rows:")
    if not df.empty:
        print(df[["PLC", "NAME", "TEAM", "CATEGORY", "TIME"]].head(10).to_string())
    else:
        print("No data found!")
    
    # Summary by category
    print(f"\nParticipants by category:")
    print(df.groupby("CATEGORY").size().sort_values(ascending=False))