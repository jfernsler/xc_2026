# Progression Tab: Better Metrics & UX Plan

## Why the current view feels misleading

1. **Raw seconds = course-dominated**  
   Gap-to-winner in seconds scales with course length and conditions. A 90s gap on a 25min course is very different from 90s on a 45min course. When everyone’s gap goes up in one race, the chart is mostly showing “harder/longer race,” not who actually got better or worse.

2. **Improvement = last − first gap (seconds)**  
   That single number mixes (a) real fitness/category improvement with (b) course difficulty. A rider can “improve” in seconds because the last race was shorter, or “regress” because the last race was longer—even if they moved up in the field.

3. **Placement is invisible**  
   Going from 2nd to 5th (worse) can look like “improvement” if the winner in the later race was slower. We don’t show place or peer-relative position, so the story is incomplete.

4. **“Among peers” is implicit**  
   We already compare within category (or All MS / All HS). The missing piece is making the **metric** peer-relative and course-normalized so the Y-axis and summary stats reflect “how they did vs peers in this race” and “how that changed over time.”

---

## Proposed direction: multiple metrics + peer-relative view

Keep the same peer groups (category or Grade Level Progression). Add **metric choice** and **richer per-rider stats** so progression is clearer and less dominated by course.

### 1. Metric selector (what we graph on Y)

Let the user pick what the line and “improvement” mean:

| Option | Y-axis meaning | “Improvement” | Pros |
|--------|----------------|---------------|------|
| **Gap %** (recommended default) | (rider_time − winner_time) / winner_time × 100 | First-race gap % − last-race gap % (positive = improved) | Course-normalized; comparable across races. |
| **Place %** | 1 − (place − 1) / field_size, or percentile rank in category | Place % last − place % first (positive = improved) | “Beat X% of peers”; reflects moving up/down in the field. |
| **Composite** | Weighted combo of gap % and place % into a 0–100 “performance index” per race | Index last − index first | Single number that balances time and placement. |
| **Gap (sec)** | Current: seconds behind winner | Current formula (negative = improved) | Keep as option for those who want raw time. |

- **Gap %**  
  - `winnerTime` = winner in same baseline group (category or All MS / All HS).  
  - `gapPct = (riderTime - winnerTime) / winnerTime * 100`.  
  - Same 2+ races rule; “improvement” = first-race gap % − last-race gap % (so positive = closed the gap).

- **Place %**  
  - Within same baseline group per race: place 1 of N → 100%, place N of N → 0% (e.g. `(N - place + 1) / N * 100`).  
  - “Improvement” = place % at last race − place % at first race (positive = moved up relative to peers).

- **Composite (performance index)**  
  - Per race, within peer group: combine gap % and place % into one 0–100 score (e.g. 50% weight “inverse of gap %” and 50% “place %”, normalized).  
  - Graph that score over time; “improvement” = index last − index first.

Implementation: extend `RiderProgressionPoint` with `gapPct`, `place`, `fieldSize`, `placePct`, and optionally `performanceIndex`. Compute these in the same loop where we compute `gapToWinner`, using the same `winnerTimeByRaceCat` and baseline grouping. One chart, one dropdown: “Metric: Gap % | Place % | Composite | Gap (sec)”.

### 2. Richer summary per rider (below chart or in list)

So “how is this rider doing among the group?” is explicit:

- **Races improved**  
  Count of races (after the first) where the chosen metric improved vs their previous race (e.g. “Improved in 3 of 4 races (gap %)”).

- **Best / worst**  
  “Best: 2nd, Race 2 (gap % 2.1%)” and “Worst: 8th, Race 1 (gap % 8.5%).”

- **Trend**  
  Short phrase: “Improving” / “Stable” / “Declining” based on slope of chosen metric (e.g. linear regression over race index) or simple first-to-last comparison.

- **Peer context**  
  “Among [JV2 Boys / All MS / …]” so it’s clear which group the metric is relative to.

These can live in the existing rider list (e.g. expandable row or tooltip) and/or in the tooltip when hovering the line.

### 3. Optional second chart (place over time)

A small secondary chart or same chart with a second Y: **Place (1, 2, 3, …)** or **Place %** on Y, races on X.  
- Makes “I moved from 5th to 2nd” visible even when gap % is similar.  
- Can be a toggle: “Show placement chart” so we don’t clutter by default.

### 4. Y-axis and copy clarity

- **Axis label**  
  Reflect chosen metric: “Gap to winner (%)”, “Place % (vs peers)”, “Performance index”, or “Gap to winner (sec)”.

- **Improvement line**  
  One short sentence under the chart or in the list:  
  “Improvement = change in [metric] from first to last race (positive = better).”

- **Peer group**  
  One line in the controls: “Peers: [Category] or [All MS / All HS (excl. varsity)]” depending on “Combine regions” and “Grade Level Progression.”

---

## Suggested implementation order

1. **Add Gap % (and keep Gap sec)**  
   - Add `gapPct` to points; add metric dropdown; graph and “improvement” use selected metric.  
   - Default to Gap % so the main view is course-normalized immediately.

2. **Add Place %**  
   - Add `place`, `fieldSize`, `placePct` per point; add “Place %” to metric dropdown and to improvement.

3. **Per-rider summary**  
   - “Improved in X of Y races”, “Best / Worst” race by chosen metric, and “Trend” (Improving/Stable/Declining).

4. **Composite index (optional)**  
   - Define formula (e.g. 50/50 gap% and place%), add to points and dropdown.

5. **Optional second chart**  
   - Toggle for a small “Place over time” chart so placement is visible at a glance.

---

## Summary

- **Problem:** Current view is dominated by course difficulty; raw seconds and a single “improvement” number are misleading; placement and “among peers” are understated.  
- **Approach:** Add **Gap %** (default), **Place %**, and optionally **Composite** as selectable metrics; add **per-rider summary** (races improved, best/worst, trend) and clearer **axis labels + copy**.  
- **Result:** Same peer groups and filters, but the chart and numbers reflect “how they did vs peers” and “how that changed over time” instead of mostly “how long/hard the course was.”

If this direction works for you, next step is implementing (1) Gap % + metric selector and (2) the per-rider summary text; then we can add Place % and the rest in order.
