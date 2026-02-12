import type { Rider } from "../types";

/** Category names that count as high school (all others are middle school). */
export const HIGH_SCHOOL_CATEGORIES = ["varsity", "jv2", "jv1", "freshman"] as const;

export type SchoolLevel = "hs" | "ms";

/** Anything with "Level" in the category name is middle school; else varsity/jv2/jv1/freshman = high school. */
export function getSchoolLevel(r: Rider): SchoolLevel {
  const raw = (r.categoryRaw ?? "").toLowerCase();
  if (raw.includes("level")) return "ms";
  return HIGH_SCHOOL_CATEGORIES.includes(r.category as (typeof HIGH_SCHOOL_CATEGORIES)[number])
    ? "hs"
    : "ms";
}
