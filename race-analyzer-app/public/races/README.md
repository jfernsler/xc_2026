# Races & maps manifests

- **public/races/manifest.json** — Lists every race/course. The dropdown shows all races from this file. Races with map data show a map icon.
- **public/maps/manifest.json** — Lists races that have map data (course + elevation). `event_id` must match a race `id` in the races manifest.

**To include all CSV races in the dropdown:** from the repo root (xc_2026) run:
```bash
python sync_races_manifest.py
```
You can also call `sync_manifest()` from your scraping pipeline after writing new CSVs. The script adds any CSV in `public/races/` that isn’t already in the manifest (existing entries keep their id/name/year). New entries get a generated id and name from the filename.

**To add map data for a race:** run the map scraper (see repo root), then ensure `public/maps/manifest.json` has an entry with `event_id` equal to that race’s `id`.
