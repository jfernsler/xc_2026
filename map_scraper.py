"""
Scrape course/map data from E-Timing Tracking API (etracking-server.fly.dev).
No racer data — only event metadata, course coordinates, elevation profile,
and split waypoints (timing points) with coords and distance.

Input: list of { "event_id": <raceresult_id>, "map_id": <etracking_event_id> }.
Output: one JSON file per map in public/maps plus manifest.json.
"""

import json
import os
import re
from typing import Any, Optional

import requests

BASE_URL = "https://etracking-server.fly.dev"

# API always returns distance and elevation in meters (see readme). We convert to imperial when event.units is "imperial".
M_TO_MI = 1 / 1609.344
M_TO_FT = 3.28084


def _parse_json_string(s: str) -> Any:
    """Parse a JSON string; if it contains nested JSON strings, parse inner arrays."""
    if not s or not s.strip():
        return []
    data = json.loads(s)
    if isinstance(data, list) and data and isinstance(data[0], str):
        return [json.loads(x) for x in data]
    return data


def get_event(map_id: int) -> Optional[dict]:
    """GET /events/get?eventID={id}. Returns first event object or None."""
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
    """GET /courses/get?eventID={id}. Returns list of course objects with parsed coordinates, timingPoints, elevations."""
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
        # Normalize timingPoints: API gives [lat, lng]; keep as { lat, lng, distance } for clarity
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
    """
    API always gives distance and elevation in meters. Convert to imperial when event.units == "imperial".
    Returns (converted_courses, distance_unit, elevation_unit) with unit strings "m"|"mi", "m"|"ft".
    """
    use_imperial = (event_units or "").strip().lower() == "imperial"
    dist_factor = M_TO_MI if use_imperial else 1.0
    elev_factor = M_TO_FT if use_imperial else 1.0
    distance_unit = "mi" if use_imperial else "m"
    elevation_unit = "ft" if use_imperial else "m"

    converted = []
    for c in courses:
        course = dict(c)
        # timingPoints: distance in meters -> convert
        tp = course.get("timingPoints") or []
        course["timingPoints"] = [
            {**p, "distance": p["distance"] * dist_factor if p.get("distance") is not None else None}
            for p in tp
        ]
        # elevations: [distance_m, elevation_m] -> convert both
        elev = course.get("elevations") or []
        course["elevations"] = [
            [pt[0] * dist_factor, pt[1] * elev_factor]
            for pt in elev
            if isinstance(pt, (list, tuple)) and len(pt) >= 2
        ]
        converted.append(course)
    return converted, distance_unit, elevation_unit


def scrape_map(event_id: int, map_id: int, output_dir: str) -> Optional[dict]:
    """
    Fetch event + courses for one map_id, save JSON, return manifest entry.
    Uses event_id only for linking (e.g. to race results); API uses map_id.
    """
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
    return {
        "event_id": event_id,
        "map_id": map_id,
        "name": event_name,
        "file": filename,
    }


def scrape_all_maps(
    items: list[dict],
    output_dir: str,
    skip_existing: bool = True,
) -> list[dict]:
    """
    items: list of { "event_id": int, "map_id": int }
    Writes one JSON per map and manifest.json. Returns full manifest.
    """
    os.makedirs(output_dir, exist_ok=True)
    manifest_path = os.path.join(output_dir, "manifest.json")
    existing_by_map_id = {}
    if skip_existing and os.path.isfile(manifest_path):
        with open(manifest_path) as f:
            for entry in json.load(f):
                existing_by_map_id[entry["map_id"]] = entry
        print(f"  Loaded manifest: {len(existing_by_map_id)} map(s) already present")

    new_entries = []
    for item in items:
        event_id = item["event_id"]
        map_id = item["map_id"]
        if skip_existing and map_id in existing_by_map_id:
            continue
        entry = scrape_map(event_id, map_id, output_dir)
        if entry:
            new_entries.append(entry)

    # Manifest: one entry per input item, in order; use new entry if scraped else existing
    manifest = []
    for item in items:
        map_id = item["map_id"]
        entry = next((e for e in new_entries if e["map_id"] == map_id), None)
        if not entry and map_id in existing_by_map_id:
            entry = existing_by_map_id[map_id]
        if entry:
            manifest.append(entry)

    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  Wrote {manifest_path} ({len(manifest)} total)")
    return manifest


# --- Configure and run -------------------------------------------------------
# event_id = Race Result event ID (for linking to race CSVs). map_id = E-Tracking event ID.
MAP_IDS = [
    {"event_id": 376410, "map_id": 16},   # Beach to Boulders 2026 (example; replace with real map_id)
    {"event_id": 383847, "map_id": 17},   # Vail Lake Challenge 2026
]
OUTPUT_DIR = "race-analyzer-app/public/maps"
SKIP_EXISTING = True
# -----------------------------------------------------------------------------


if __name__ == "__main__":
    print("Scraping maps:", MAP_IDS)
    manifest = scrape_all_maps(MAP_IDS, OUTPUT_DIR, skip_existing=SKIP_EXISTING)
    print("\nManifest:")
    for m in manifest:
        print(f"  event_id={m['event_id']} map_id={m['map_id']}: {m['name']} -> {m['file']}")
