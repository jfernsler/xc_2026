# Race data (static CSVs)

1. Run the Python scraper to download results.
2. Rename the CSV (e.g. `Lake_Perris-Beach_to_Boulders-2026.csv`) and put it here.
3. Add an entry to `manifest.json`: `{ "id": 376410, "name": "Display Name", "file": "Your_File.csv" }`.

Use any numeric `id` per race (unique); the app uses it for filtering.
