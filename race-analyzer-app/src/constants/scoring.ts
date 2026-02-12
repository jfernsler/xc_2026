/** Base points by category for NICA-style scoring (place-based decay) */

export const SCORING_POINTS: Record<string, number> = {
  varsity: 575,
  jv2: 540,
  jv1: 500,
  freshman: 500,
  ms: 500,
};

/** Team scoring: top N riders count, max this many per gender */
export const DEFAULT_MAX_RIDERS = 8;
export const DEFAULT_MAX_PER_GENDER = 6;

export interface TeamScoringOptions {
  maxRiders: number;
  maxPerGender: number;
}
