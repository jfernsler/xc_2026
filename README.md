# XC 2026 — Race Scenario Analyzer

NICA-style high school mountain bike race analysis: load race results from static data, view standings, run “what-if” scenarios, and plan overtakes to close point gaps. **Team points and the overtake planner use only high school riders** (varsity, JV1, JV2, freshman); middle school categories are excluded from scoring.

## Project layout

| Path | Role |
|------|------|
| **`scraper.py`** | Python scraper for RACE RESULT API: fetches event results and writes CSV. Run locally to refresh race data. |
| **`race-analyzer-app/`** | React + TypeScript + Vite app: static site, no backend. |
| **`race-analyzer-app/public/races/`** | Race data: `manifest.json` (list of races) and one CSV per race. Add scraped CSVs here. |
| **`OLD/`** | Legacy single-file UI (reference only). |

## Race Analyzer App (`race-analyzer-app/`)

| Area | Role |
|------|------|
| **`src/constants/`** | Regions, scoring, school level (HS = varsity/jv1/jv2/freshman; “Level” = MS), tabs. |
| **`src/types/`** | `Rider`, `ScenarioRider`, `TeamScore`, `OvertakeMove`, `ScenarioChange`. |
| **`src/utils/`** | Time, category detection, **races** (load manifest + CSV from `public/races/`), region styles. |
| **`src/scoring/`** | Place-based points, team scoring (caller passes HS-only data). |
| **`src/moves/`** | Overtake discovery (HS riders only). |
| **`src/components/`** | `Filters`, `GapChart`, `LapAnalysis`, `HLBar`, `ScoringDot`. |
| **`src/sections/`** | Results, Teams, Overtake Planner, Scenario, Analysis, Report. |

### Run locally

```bash
cd race-analyzer-app
npm install
npm run dev
```

Open http://localhost:5173, choose a race from the dropdown. No backend; data comes from `public/races/` (manifest + CSVs).

### Data: adding a race

1. Run the **scraper** (from repo root):  
   `python scraper.py` (or use `scrape_event(376410, "output.csv")`).  
   Scraper hits the RACE RESULT API and writes a CSV with columns like `STATUS_GROUP`, `CATEGORY`, `BIB`, `PLC`, `NAME`, `TEAM`, `LAPS`, `LAP1`–`LAP4`, `PEN`, `TIME`.
2. Rename the CSV (e.g. `Lake_Perris-Beach_to_Boulders-2026.csv`) and put it in **`race-analyzer-app/public/races/`**.
3. Add an entry to **`public/races/manifest.json`**:  
   `{ "id": 376410, "name": "Lake Perris, Beach to Boulders - 2026", "file": "Lake_Perris-Beach_to_Boulders-2026.csv" }`  
   Use a unique numeric `id` per race.

See **`public/races/README.md`** for the same steps.

### Build and deploy

```bash
cd race-analyzer-app
npm run build
```

Output is in `dist/` (static files). For **GitHub Pages**, see **`race-analyzer-app/DEPLOY.md`** (base path, Actions workflow, and repo setup).

### Docker (optional)

```bash
cd race-analyzer-app
docker build -t race-analyzer .
docker run -p 8080:80 race-analyzer
```

Open http://localhost:8080 (use the base path if configured, e.g. `/xc_2026/`).

## Features

- **Results** — Filter by school (All Grades / High School / Middle School), region, team, category, race. Gap chart; place/points/laps per category.
- **Teams** — Team standings from **high school riders only** (top 8, max 6 per gender). Region filter and highlight.
- **Overtake planner** — Your team vs rival; moves within a time threshold. **One move per rider** (selecting another for the same rider deselects the first). HS riders only. Send selected moves to Scenario or generate report.
- **Scenario** — Same filters as Results. Reorder riders by category (▲/▼); live standings and point deltas; export for reports.
- **Analysis** — Achievable gains and defensive threats within threshold; lap stats.
- **Report** — Markdown (scenario changes, standings, overtake plan); copy or download.

## Tech stack

- **App:** React 18, TypeScript, Vite, Tailwind, Lodash. Static site; no backend.
- **Data:** Python scraper (requests) for RACE RESULT API; CSVs in `public/races/`.
- **Deploy:** GitHub Actions → GitHub Pages (see `race-analyzer-app/DEPLOY.md`). Docker (nginx) optional.
