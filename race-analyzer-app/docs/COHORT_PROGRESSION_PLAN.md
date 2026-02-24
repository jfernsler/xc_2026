# Cohort Progression — Plan (overview)

## Idea

Total Placement already shows **place among all MS or all HS** per race. Many riders move in **groups**: e.g. the “5th–12th” pack might stay together and improve as a block. **Cohort Progression** is a way to:

1. **Define cohorts** (groups of riders by placement band in a given race).
2. **Assign each rider a cohort per race** (e.g. “Top 10”, “11–20”, “21–30” or percentile-based).
3. **Add metrics and visuals** so users see:
   - Which cohort a rider is in over time.
   - Whether they’re moving up/down cohorts or staying with the same pack.
   - How their trajectory compares to others in their cohort or to the cohort as a whole.

No code is built yet; this is an overview and design plan.

---

## 1. Defining cohorts

**Cohort** = a placement band in one race (same Total Placement pool: all MS or all HS in that race).

Options:

| Approach | Description | Pros / cons |
|----------|-------------|-------------|
| **Fixed size** | Cohort 1 = places 1–10, Cohort 2 = 11–20, … | Simple; comparable across races if field size similar. Breaks down when N is small or very large. |
| **Percentile** | Cohort 1 = top 25%, 2 = next 25%, … (e.g. quartiles) | Adapts to field size; “top quartile” is comparable across races. Slightly more logic. |
| **Configurable** | User sets “cohort size” (e.g. 10 or 15) or “number of cohorts” (e.g. 4) | Flexible; can match how coaches think (“top 10”, “next 10”). |

**Recommendation:** Start with **fixed cohort size** (e.g. 10) with a clear rule for the last cohort (“21–27” if 27 riders). Optionally add a second mode: “Quartiles” (4 cohorts by percentile). Configurable size (e.g. 5 / 10 / 15) can come later.

**Per-race vs anchor:** Cohorts can be computed **per race** (so “cohort 2” in race 1 might be places 11–20, in race 2 might be 11–18 if field is smaller). Alternative: “anchor” cohorts from race 1 and track how those same riders move in later races (different product: “where did the race-1 top 10 finish in race 2?”). For “progression together,” **per-race cohorts** are the natural first step.

---

## 2. Cohort-based metrics

All use the same Total Placement data (place among all MS or all HS, with Level‑3 edge case). We only add cohort labels and derived stats.

- **Cohort index (per race)**  
  For each race, rider has `totalPlace` (already). Compute `cohortIndex = ceil(totalPlace / cohortSize)` (e.g. 1–10 → 1, 11–20 → 2). So: 1 = first cohort (top N), 2 = second, etc.  
  Stored per point as `cohortIndex` (and optionally `cohortLabel`, e.g. `"1–10"`).

- **Cohort improvement**  
  Same idea as placement improvement, but in cohort space: e.g. `firstCohortIndex - lastCohortIndex` (positive = moved up cohorts).  
  Can be shown in list/tooltip: “Moved up 1 cohort” or “Stayed in same cohort.”

- **Position within cohort (place-in-cohort)**  
  Within the same cohort in that race, rank by place: e.g. place 12 in “11–20” → 2nd in cohort. Stored per point as `placeInCohort` (1 = best in that band). Core for the single-rider “vs cohort” view below.

- **Cohort stability**  
  Count of races where the rider’s cohort index equals their previous race’s cohort index. Or “number of cohort jumps” (up or down). Gives a simple “stayed with pack” vs “moved between packs” summary.

These can live alongside Total Placement: we still show **place (1, 2, 3, …)** as the main Y-axis; cohort is an extra dimension (band, color, or second chart).

---

## 3. Visualizations (to illuminate “progress together”)

- **Cohort bands on existing chart**  
  Horizontal bands on the Total Placement chart: e.g. 1–10, 11–20, 21–30 with light background or horizontal lines. So the main chart stays “place over time,” but you see which band each rider is in and whether lines cross band boundaries (cohort changes).

- **Cohort-over-time chart (second view)**  
  Same X (races). Y = **cohort index** (1 at top, 2, 3, … below). Each rider’s line is “which cohort am I in this race?”. Riders improving together sit on the same horizontal band; someone moving up drops to a lower band number (or we invert so “up” is visually up). Toggle or tab: “Place” vs “Cohort” so users can switch.

- **Color by cohort (optional)**  
  In the list or in the chart legend, color riders by **current** (or first-race) cohort so “this group is cohort 1, this is cohort 2.” Helps see “who is in my cohort” without changing the Y-axis.

- **List / tooltip**  
  Add columns or tooltip lines: “Cohort: 2 (11–20)”, “Cohort change: +1” (moved up one cohort). Optionally “Place in cohort: 3” (3rd within the 11–20 band).

- **Summary line**  
  One sentence per rider: “Moved from cohort 3 to cohort 2” or “Stayed in top cohort (1) for all 4 races.” Good for quick scan.

---

## 4. Single-rider view: within-cohort performance (“Am I outperforming my pack?”)

**Goal:** Let a user pick one rider and see whether they’re **outperforming** or **underperforming** the group they ride with in each race — with a clear metric and a focused view.

### 4.1 Who is “the group they ride with”?

- **Per-race cohort (recommended):** In each race, “their group” = everyone in the same placement band (e.g. places 11–20). So we compare the rider to others in that band **in that race** via place-in-cohort: 1st in the band = outperforming, last in the band = underperforming.
- **Anchor cohort (optional):** “Riders they rode with in race 1” — same cohort in the first race. In later races, compare this rider’s **total place** to the **average (or median) total place** of that fixed set of riders. Answers: “Am I beating the people I started with?” Implement after per-race cohort.

### 4.2 Within-cohort metric (out vs under performing)

- **Place-in-cohort** (raw): 1 = best in cohort, N = last in cohort (N = cohort size, or smaller for the last band). Simple and interpretable.
- **Cohort percentile** (single number, 0–100):  
  `cohortPct = 100 * (1 - (placeInCohort - 1) / cohortSize)`  
  So 100 = 1st in cohort, 0 = last. **Outperforming** = high percentile (e.g. &gt; 60); **underperforming** = low (e.g. &lt; 40); ~50 = middle of pack. Works across different cohort sizes (including last cohort with fewer riders if we use actual cohort size).
- **Summary stat for the rider:**  
  **Average cohort percentile** (or average place-in-cohort) across their races. One line: “Averaging 72nd percentile in cohort (outperforming)” or “Averaging 4.2 of 10 in cohort (top half).”  
  Optional: **Trend** — “Improving within cohort” (percentile going up over time) vs “Declining within cohort.”

### 4.3 “Pick a rider” UX

- **Selection:** User selects a single rider (e.g. from list or chart click). Rest of UI can dim or hide other riders, or show them faintly for context.
- **Focused content:**
  - **Place-in-cohort over time:** Small chart or sparkline: X = races, Y = place-in-cohort (1 at top) or Y = cohort percentile (100 at top). Shows whether they’re moving up or down **within** their band each year.
  - **Cohort band each race:** List or tooltip: “Race 1: cohort 2 (11–20), 3rd in cohort (70th %ile). Race 2: cohort 2 (11–20), 1st in cohort (100th %ile).”
  - **Single metric callout:** “Outperforming cohort — avg 68th percentile” or “Underperforming cohort — avg 35th percentile” (with a threshold, e.g. 55/45 or 60/40 for “out” vs “under”).
- **Reference line (optional):** On the place-in-cohort chart, draw a horizontal line at “cohort median” (e.g. 5.5 for size-10 cohort, or 50th percentile). Above the line = outperforming that race, below = underperforming.

### 4.4 Optional: “Vs race-1 cohort” (anchor group)

- Define **race-1 cohort** = set of riders in the same placement band as this rider in the first race.
- In each later race: compute **median (or mean) total place** of that set (only those who raced). Compare rider’s total place to that median: above median = outperforming “the people you started with,” below = underperforming.
- Can show as a second small chart: “Your place” vs “Race-1 cohort median place” over time, or a single “Beat race-1 cohort in 3 of 4 races.”

---

## 5. Implementation order (when we build)

1. **Data**  
   In the same place we compute `totalPlace`, compute `cohortIndex` and **`placeInCohort`** per point; derive **cohort percentile** from placeInCohort and cohort size. Add cohort size (e.g. 10) as constant or UI setting. Extend `RiderProgressionPoint` with `cohortIndex`, `cohortLabel`, `placeInCohort`, and optionally `cohortPct`.

2. **Bands on current chart**  
   Draw horizontal bands (e.g. 1–10, 11–20, …) on the existing Total Placement chart.

3. **List + tooltip**  
   Show cohort, cohort change, and **place-in-cohort** (and optionally cohort %) in list and tooltip.

4. **Second chart: Cohort over time**  
   Tab/toggle: X = races, Y = cohort index. Same line-per-rider, same selection.

5. **Single-rider “within cohort” view**  
   When one rider is selected: (a) focused view with place-in-cohort (or cohort percentile) over time; (b) **average cohort percentile** (or avg place-in-cohort) and a clear **outperforming / underperforming** label (e.g. &gt;55% = outperforming, &lt;45% = underperforming); (c) optional reference line at cohort median (50th %ile). Other riders can be dimmed or hidden.

6. **Optional**  
   Cohort stability; color-by-cohort; configurable cohort size; “vs race-1 cohort” (anchor group) comparison.

---

## 6. Summary

- **Cohort** = placement band per race (e.g. 1–10, 11–20) using the same Total Placement pool (all MS or all HS, with Level‑3 rule).
- **Metrics:** cohort index, cohort improvement, **place-in-cohort**, **cohort percentile** (0–100), **average cohort percentile** (single-rider summary), and optional cohort stability.
- **Single-rider view:** Pick a rider → see place-in-cohort (or cohort %) over time and a single “outperforming” / “underperforming” metric vs the group they ride with each race (per-race cohort); optional “vs race-1 cohort” later.
- **Visuals:** cohort bands on place chart, cohort-over-time chart, list/tooltip with cohort and place-in-cohort, focused single-rider view with within-cohort chart and callout.
- **Build order:** data (incl. placeInCohort & cohort %) → bands → list/tooltip → cohort chart → single-rider within-cohort view → optional (stability, anchor cohort, etc.).

This keeps Total Placement as the source of truth and adds a “cohort” layer so it’s clear when riders are progressing together in the same band and when they’re moving between bands.
