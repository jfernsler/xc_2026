/** Normalize raw category string to canonical key (varsity, jv2, jv1, freshman, ms) */
export function detectCategory(raw: string | null | undefined): string {
  if (!raw) return "freshman";
  const l = raw.toLowerCase();
  if (l.includes("varsity")) return "varsity";
  if (l.includes("jv2") || l.includes("jv 2")) return "jv2";
  if (l.includes("jv1") || l.includes("jv 1")) return "jv1";
  return "freshman";
}
