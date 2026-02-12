import { SCORING_POINTS } from "../constants/scoring";

/** Points for a given place in a category (NICA-style decay) */
export function racePoints(place: number, category: string): number {
  const s = SCORING_POINTS[(category || "freshman").toLowerCase()] ?? 500;
  if (place < 1) return 0;
  let p = s;
  let d = 10;
  let c = 1;
  let m = 1;
  for (let i = 2; i <= place; i++) {
    p -= d;
    c++;
    if (c > m) {
      d = Math.max(d - 1, 1);
      m++;
      c = 1;
    }
  }
  return Math.max(p, 0);
}
