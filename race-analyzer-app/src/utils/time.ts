/**
 * Parse "M:SS.s" or "H:MM:SS.s" to seconds.
 * Returns null for DNF/DNS or invalid input.
 */
export function parseTime(s: string | null | undefined): number | null {
  if (s == null || typeof s !== "string") return null;
  s = s.trim();
  if (!s || s.toUpperCase() === "DNF" || s.toUpperCase() === "DNS") return null;
  const p = s.split(":");
  let r = 0;
  if (p.length === 3) r = parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2]);
  else if (p.length === 2) r = parseFloat(p[0]) * 60 + parseFloat(p[1]);
  else r = parseFloat(p[0]);
  return isNaN(r) ? null : r;
}

/** Parse time-of-day "H:MM:SS.s" or "H:MM:SS:ff" (4 parts) to seconds. For comparing who was on course at same clock time. */
export function parseTimeOfDay(s: string | null | undefined): number | null {
  if (s == null || typeof s !== "string") return null;
  s = s.trim();
  if (!s) return null;
  const p = s.split(":");
  if (p.length === 3) return parseTime(s);
  if (p.length === 4) {
    const h = parseFloat(p[0]);
    const m = parseFloat(p[1]);
    const sec = parseFloat(p[2]);
    const frac = parseFloat(p[3]);
    if ([h, m, sec, frac].some((n) => isNaN(n))) return null;
    return h * 3600 + m * 60 + sec + frac / 100;
  }
  return null;
}

/** Format seconds as "M:SS.s" or "H:MM:SS.s" */
export function formatTime(s: number | null | undefined): string {
  if (s == null) return "--";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = (s % 60).toFixed(1);
  if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + sc.padStart(4, "0");
  return m + ":" + sc.padStart(4, "0");
}

/** Format delta as "+M:SS.s" or "-M:SS.s" */
export function formatDelta(s: number | null | undefined): string {
  if (s == null) return "--";
  return (s >= 0 ? "+" : "-") + formatTime(Math.abs(s));
}
