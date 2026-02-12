# XC 2026 — Race Scenario Analyzer

NICA-style high school mountain bike race analysis: load CSV results, view standings, run “what-if” scenarios, and plan overtakes to close point gaps.

## Project layout

- **`race-analyzer.tsx`** — Original single-file React UI (kept for reference).
- **`race-analyzer-app/`** — Refactored app: modular React + TypeScript + Vite, runnable in Docker.

## Race Analyzer App (`race-analyzer-app/`)

The app is split by responsibility (SOLID-oriented):

| Area | Role |
|------|------|
| **`src/constants/`** | Regions (North/Central/South), scoring base points, tab config. |
| **`src/types/`** | Shared types: `Rider`, `ScenarioRider`, `TeamScore`, `OvertakeMove`, `ScenarioChange`. |
| **`src/utils/`** | Time parse/format, category detection, CSV parsing, region CSS helpers. |
| **`src/scoring/`** | Place-based points (`racePoints`), team scoring and standings (`computeTeamScore`, `allTS`). |
| **`src/moves/`** | Overtake discovery: `findMoves` (target vs rival within time threshold). |
| **`src/components/`** | Reusable UI: `GapChart`, `LapAnalysis`, `Filters`, `HLBar`, `ScoringDot`. |
| **`src/sections/`** | Tab content: Results, Teams, Overtake Planner, Scenario, Analysis, Report. |
| **`src/App.tsx`** | Top-level state and composition; no business logic. |

### Run locally

```bash
cd race-analyzer-app
npm install
npm run dev
```

Open http://localhost:5173 and load a race CSV.

### Run with Docker

```bash
cd race-analyzer-app
docker build -t race-analyzer .
docker run -p 8080:80 race-analyzer
```

Open http://localhost:8080.

### Build only

```bash
cd race-analyzer-app
npm run build
```

Output is in `dist/` (static files for any HTTP server).

## Features

- **Results** — Filter by grade/region/team/category/race; gap chart and place/points/laps per category.
- **Teams** — Team standings (top 8, max 6 per gender), region, scoring roster.
- **Overtake planner** — Pick your team and a rival; see achievable moves within a time threshold; select moves and “Send to Scenario” or generate report.
- **Scenario** — Reorder riders by category (▲/▼); live team standings and point deltas; export changes for reports.
- **Analysis** — Achievable gains and defensive threats within threshold; consistent/fade/negative-split lap stats.
- **Report** — Markdown summary (scenario changes, standings, overtake plan); copy or download for LLM/strategy use.

## Data

Expects a NICA-style CSV (e.g. from race result exports) with columns such as race #, grade, category, place, bib, name, team, laps, lap times, total time. The parser skips a header row when it detects “race” and “name”.

## Tech stack

- React 18, TypeScript, Vite
- Tailwind CSS
- Lodash (sort/group/uniq)
- Docker: multi-stage build (Node build → nginx serve)
