# Splits Tab – Plan

## Context

- **Base races** (e.g. 2025): columns like STATUS_GROUP, CATEGORY, BIB, ID, PLC, NAME, TEAM, LAPS, LAP1–LAP4, PEN, TIME.
- **Rich races** (e.g. 2026): same plus per-lap split columns, e.g.  
  `LAP1_SPLIT1_CHIP/GUN/SECTOR/TOD` … `LAP1_SPLIT4_*`, `LAP2_SPLIT1_*` … `LAP3_SPLIT4_*`, plus START_* / TIME_*.
- **SECTOR** = segment time (what we want for “split section” analysis). **TOD** = time of day (optional for ordering).
- Splits tab currently: placeholder; receives only `eventId` and `raceName`. Results tab uses `Filters` + `filtered` riders.

## 1. Data & filtering

- **Detect splits**: When loading a single-race CSV, detect if any column matches `LAP\d+_SPLIT\d+_SECTOR` (or similar). If so, treat as “race with splits.”
- **Parse splits**: Extend parsing (e.g. in `races.ts` or a dedicated `splits.ts`) so we have:
  - Same `Rider[]` as today (for filtering and join).
  - Optional **split data**: list of segment labels (e.g. `L1-S1`, `L1-S2`, … `L3-S4`) and per-rider segment times in seconds (keyed by rider `id` or equivalent).
- **Splits tab input**: Pass the same **filtering** as Results: `filtered` riders + filter state (or reuse `<Filters />`). Pass **split data only when present** (optional). If no split data, show: “This race has no split timing data.”

## 2. View structure (Splits tab)

- Reuse **Filters** (region, team, category, race, highlight) so the Splits view is “same cohort” as Results.
- **When splits data exists**:
  - **Analysis mode** (tabs or dropdown): e.g. “By rider”, “By segment”, “Compare”.
  - Content area depends on mode (see below).

## 3. Analysis / visualization options

### A. Rider-centric

1. **Split times table (by rider)**  
   - Rows: filtered riders (by category). Columns: Place, Name, Team, then each segment (e.g. L1-S1, L1-S2, …), then Lap1/Lap2/Lap3, Total.  
   - Use SECTOR for segment time. Sortable by any column.  
   - Same grouping by category as Results (e.g. Varsity Girls, Varsity Boys).

2. **Rider comparison**  
   - Select one or two riders (e.g. from table or search).  
   - Show segment times as **bar chart** (one bar per segment) or **line** (pace per segment).  
   - Option: “vs category median” or “vs another rider” as reference line.

3. **Segment rank per rider**  
   - For each rider, show **rank** in each segment (e.g. “3rd in L1-S2”).  
   - Table: Place, Name, Team, Rank L1-S1, Rank L1-S2, …  
   - Surfaces where time was gained or lost relative to the field.

### B. Segment-centric (overall stats within a split section)

4. **Segment stats table**  
   - One row per segment (L1-S1, L1-S2, …). Columns: Segment, Count, Min, Max, Median, Mean, StdDev (all in seconds or mm:ss).  
   - Optionally: same stats **by category** (e.g. Varsity Girls vs Varsity Boys per segment).

5. **Distribution per segment**  
   - For each segment: **histogram** or **box plot** of segment times (across filtered riders).  
   - Helps see spread, outliers, and pacing patterns (e.g. “everyone slow in L2-S3”).

6. **Where time was won/lost (vs median)**  
   - Table: riders × segments. Cell = segment time − category median for that segment.  
   - Color: green = faster than median, red = slower.  
   - Optional: same as **heatmap** (rows = riders, columns = segments).

### C. Optional / later

7. **Segment correlation**  
   - Scatter: segment A time vs segment B time (or vs total time) to see if fast in one segment correlates with another.

8. **Pace curve**  
   - For a single rider (or average): segment pace (e.g. min/km or min/mi if we have distance) along course order.

## 4. Implementation order (suggested)

1. **Data**: Extend race CSV parsing to detect and parse split columns; expose “has splits” + per-rider segment times (keyed by existing rider id); keep current `Rider` for filtering.
2. **Splits tab shell**: Add Filters (same as Results); when no splits data → message; when splits data → show a single default view first.
3. **First view**: Split times table by rider (grouped by category, sortable). Proves pipeline and UX.
4. **Segment stats**: One table of overall stats per segment (min/max/median/mean/count).
5. **Rider comparison**: Select rider(s), bar or line chart of segment times (optional vs median).
6. **Segment rank table** and **vs-median table/heatmap** as next steps.
7. **Distribution (histogram/box)** and **correlation** if time permits.

## 5. Technical notes

- **Time parsing**: Reuse existing `parseTime` for SECTOR (and TOD if needed). Handle empty/missing as `null`; exclude from stats and from “count” for that segment.
- **Segment naming**: Derive from column names, e.g. `LAP1_SPLIT2_SECTOR` → “L1-S2”. Lap 3 may have fewer splits (e.g. 4); detect from headers.
- **Performance**: For large fields, avoid re-parsing CSV on every filter change; parse once when race loads, then filter in memory (same as Results).

---

**Summary**: Same filtering as Results; parse and expose segment times when CSV has split columns; start with rider split table and segment stats table; add rider comparison and vs-median views; then optional rank table, heatmap, distributions, and correlations.
