# Races & maps manifests

- **public/races/manifest.json** — Lists every race/course. Add one entry per race: `{"id": <number>, "name": "...", "year": <number>, "file": "Race_X_....csv"}`. The dropdown shows all races from this file.
- **public/maps/manifest.json** — Lists races that have map data (course + elevation). Entries use `event_id` (must match a race `id` in races manifest), plus `map_id`, `name`, `file`. Races with map data show a map icon in the dropdown and can use the Map and Splits tabs.

To add a new race: add the CSV to `public/races/` and add an entry to `public/races/manifest.json`.  
To add map data for a race: run the map scraper (see repo root), then ensure `public/maps/manifest.json` has an entry with `event_id` equal to that race’s `id`.
