# E-Timing Tracking API — Scraping Reference

**Backend:** `https://etracking-server.fly.dev`  
**Frontend:** `https://e-timing.eu/tracking/map?event=17&group=1`  
**Auth:** No user authentication required. Static API keys embedded in the app (documented below).

---

## API Keys

Two static keys are in use — neither rotates, neither requires a session:

| Key | Used For |
|---|---|
| `3d19e006-3f7f-44ec-bedd-bd9ab6e825c5` | Event data, athlete positions, course data |
| `cda65147-ac25-4429-94da-da5563757756` | Alternate polling key (same endpoints, same access) |
| `4wL6HPqnXzgEzYIPj6nf` | Map tiles only (not needed for data scraping) |

> The Firebase JWT in the `mapstyle` request is ephemeral (1hr TTL, anonymous auth) and only controls map rendering — not data access. Ignore it for scraping purposes.

---

## Endpoints

### 1. Event Metadata
**`GET /events/get?eventID={id}`**

No API key required.

```
GET https://etracking-server.fly.dev/events/get?eventID=17
```

**Returns:** Single-element array with event config.

```json
[
  {
    "id": 17,
    "eventName": "Vail Lake Challenge 2026",
    "eventDate": "2026-02-21T22:00:00Z",
    "userID": "v1DttVbD6XhFA4AzzBDEgiEXOl93",
    "published": true,
    "units": "imperial",
    "logoName": "",
    "dataURL": "https://api.raceresult.com/383847/ZT2YLMIK97QX6HOLV2S1TM0RSDZMSJRA",
    "groups": "[...]"   // JSON string — must be parsed separately
  }
]
```

**`groups` field** (JSON string, parse it):
```json
[
  { "id": 1, "name": "MS-Wave1", "courseID": 2, "lapMode": true, "maxLap": 2 },
  { "id": 2, "name": "MS-Wave2", "courseID": 2, "lapMode": true, "maxLap": 2 },
  { "id": 3, "name": "MS-Wave3", "courseID": 2, "lapMode": true, "maxLap": 2 },
  { "id": 4, "name": "HS-Wave1", "courseID": 1, "lapMode": true, "maxLap": 2 },
  { "id": 5, "name": "HS-Wave2", "courseID": 1, "lapMode": true, "maxLap": 2 },
  { "id": 6, "name": "HS-Wave3", "courseID": 1, "lapMode": true, "maxLap": 3 },
  { "id": 7, "name": "HS-Wave4", "courseID": 1, "lapMode": true, "maxLap": 3 }
]
```

**Key fields:**
- `courseID` — links each group to a course (use with `/courses/get`)
- `lapMode` + `maxLap` — how many times the course is ridden
- `dataURL` — external race result system (raceresult.com), separate API

---

### 2. Course Data (Route + Splits + Elevation)
**`GET /courses/get?eventID={id}`**

No API key required.

```
GET https://etracking-server.fly.dev/courses/get?eventID=17
```

**Returns:** Array of course objects (one per course). For event 17: courseID 1 = HS, courseID 2 = MS.

```json
[
  {
    "id": 45,
    "courseID": 1,
    "eventID": 17,
    "name": "HS",
    "center": "[\"33.47559\",\"-116.9997225\"]",
    "coordinates": "[...]",     // JSON string — parse it
    "timingPoints": "[...]",    // JSON string — parse it
    "elevations": "[...]"       // JSON string — parse it
  }
]
```

> All three data fields (`coordinates`, `timingPoints`, `elevations`) are **JSON strings** that must be parsed — they are not native arrays.

---

#### 2a. `coordinates` — Route Polyline

A JSON string containing an array of stringified `[longitude, latitude]` pairs.

**Parse chain:** `JSON.parse(course.coordinates)` → array of strings → each string is `JSON.parse`-able to `[lng, lat]`

**Format:** `[longitude, latitude]` — GeoJSON convention (lng first)

**Example points:**
```
[-116.99354515536292, 33.47474777009327]
[-116.99376788828687, 33.47468287166001]
...
```

**Volume:** Thousands of coordinate pairs per course — full high-density GPS trace.

**⚠️ Note:** No elevation is embedded in these coordinates. Elevation comes separately from the `elevations` field.

---

#### 2b. `timingPoints` — Split Marker Locations

A JSON string containing an array of timing point objects.

**Parse:** `JSON.parse(course.timingPoints)`

**Format:**
```json
[
  {
    "type": "timingPoint",
    "coordinates": [33.473297715198, -116.99308580863898],
    "distance": 1810.9462241415222
  },
  {
    "type": "timingPoint",
    "coordinates": [33.47221670224047, -117.00023735967146],
    "distance": 4068.3608794184747
  },
  {
    "type": "timingPoint",
    "coordinates": [33.47915794183025, -117.00521844449503],
    "distance": 5764.7721301037745
  },
  {
    "type": "timingPoint",
    "coordinates": [33.47591438026555, -116.99764903395037],
    "distance": 7493.680946093764
  }
]
```

**Key fields:**
- `coordinates` — `[latitude, longitude]` order (**opposite of `coordinates` field above**)
- `distance` — meters from start along the course

**⚠️ Coordinate order inconsistency:** `timingPoints.coordinates` is `[lat, lng]` but the route `coordinates` array is `[lng, lat]`. Normalize on ingest.

**Linking to athlete data:** The `Last` and `Next` fields in `/data/get` athlete records are distance values in meters that correspond directly to these `distance` values, identifying which split a rider last crossed.

---

#### 2c. `elevations` — Course Elevation Profile

A JSON string containing an array of stringified `[distance, elevation]` pairs.

**Parse chain:** `JSON.parse(course.elevations)` → array of strings → each string `JSON.parse`-able to `[distance_m, elevation_m]`

**Format:** `[distance_along_course_meters, elevation_meters]`

**Example:**
```
[0.00, 477.0]
[21.88, 478.0]
[26.46, 479.0]
...
[9403.xx, 477.x]   // end of course
```

**⚠️ Units note:** Despite the event having `"units": "imperial"`, elevation values are in **meters**, not feet. Distance values are also in **meters**.

**Volume:** Several hundred data points per course — sufficient resolution for a smooth elevation profile chart.

---

### 3. Athlete / Live Position Data
**`GET /data/get?eventID={id}&key={key}`**

```
GET https://etracking-server.fly.dev/data/get?eventID=17&key=3d19e006-3f7f-44ec-bedd-bd9ab6e825c5
```

**Returns:** Array of athlete objects, sorted by current standing.

```json
{
  "Data": [
    {
      "Bib": 1,
      "Group": 7,
      "ID": 1,
      "Name": "LEONARDO GUTIERREZ\r\nGREAT OAK HIGH SCHOOL",
      "RTitle": "Leonardo Gutierrez",
      "Sex": "m",
      "RTime": "1:00:24.7",
      "Label": "Time: 1:00:24.7",
      "RSub": "Finish",
      "Last": 28205.3628,
      "Next": 28205.3628,
      "Speed": "",
      "Time": "2026-02-22T22:15:26.889Z"
    }
  ]
}
```

**Key fields:**

| Field | Description |
|---|---|
| `Bib` | Bib number |
| `ID` | Internal athlete ID |
| `Group` | Group ID — links to group definitions in `/events/get` |
| `Name` | Full name + team, newline-separated (`\r\n`) |
| `RTitle` | Clean display name |
| `Sex` | `"m"` or `"f"` |
| `RTime` | Formatted finish/elapsed time string |
| `RSub` | Current status — `"Finish"` when done, otherwise a split label |
| `Last` | Distance in meters of last timing point crossed |
| `Next` | Distance in meters of next timing point (same as `Last` if finished) |
| `Speed` | Current speed string (empty string when not live) |
| `Time` | ISO 8601 UTC timestamp of last recorded event |

**Polling behavior:** The app polls this endpoint on a short interval during live events. For completed events, data is static.

**Parsing `Name`:** Split on `\r\n` — index 0 is athlete name, index 1 is team name.

**Linking `Last`/`Next` to splits:** Match these meter values against `timingPoints[n].distance` from `/courses/get` to identify which split point a rider is at. Values equal to the course total distance indicate a finish.

---

## Data Relationships

```
/events/get
  └── groups[].courseID ──────────────────────┐
  └── groups[].id ──── athlete.Group          │
                                              ▼
/courses/get                          course.courseID
  └── coordinates   → route polyline
  └── timingPoints  → split lat/lng + distance
  └── elevations    → elevation profile

/data/get
  └── athlete.Group → group.id → group.courseID
  └── athlete.Last/Next → timingPoint.distance
```

---

## Known Quirks & Gotchas

1. **Double-encoded JSON:** `coordinates`, `timingPoints`, `elevations`, and `groups` are all JSON strings inside JSON — you must call `JSON.parse()` twice on the inner arrays.

2. **Coordinate order inconsistency:**
   - Route `coordinates`: `[longitude, latitude]` (GeoJSON standard)
   - `timingPoints.coordinates`: `[latitude, longitude]` (reversed)
   - Normalize everything to `[lat, lng]` or `[lng, lat]` on ingest — don't mix.

3. **Elevation units:** Meters, despite `units: "imperial"` on the event.

4. **`Name` field:** Contains `\r\n` — split to separate athlete name from team name.

5. **`Last`/`Next` = course total distance** means the athlete has finished. For event 17: `28205.3628`m = HS finish (3 laps), `18803.5752`m = MS finish (2 laps).

6. **No API key needed for `/events/get` and `/courses/get`** — only `/data/get` requires the key parameter, and that key is static and hardcoded.

7. **Course data is static** — load once. Athlete data changes during live events.

---

## Minimal Scrape Checklist

To capture everything for an event:

- [ ] `GET /events/get?eventID={id}` → parse `groups` field
- [ ] `GET /courses/get?eventID={id}` → for each course object, parse `coordinates`, `timingPoints`, `elevations`
- [ ] `GET /data/get?eventID={id}&key={key}` → parse `Data` array, split `Name` on `\r\n`
- [ ] Cross-reference `athlete.Group` → `group.courseID` to know which course each athlete is on
- [ ] Cross-reference `athlete.Last` → `timingPoint.distance` to know which split they last crossed

---

## Example: Changing Event IDs

The `eventID` parameter is the only thing that changes between events. Based on the URL pattern `?event=17&group=1`, both the frontend and API use the same numeric event ID. Other events would be `eventID=1`, `eventID=2`, etc. The `group` param on the frontend is for UI filtering only — it does not affect what the API returns.
