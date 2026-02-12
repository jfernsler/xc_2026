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
