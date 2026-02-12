import _ from "lodash";
import type { Rider } from "../types";
import type { TeamScore } from "../types";
import { REGION_MAP } from "../constants/regions";
import { DEFAULT_MAX_PER_GENDER, DEFAULT_MAX_RIDERS, type TeamScoringOptions } from "../constants/scoring";
import { racePoints } from "./points";

type RiderWithPlace = Rider & { place: number };
type ScoredRider = RiderWithPlace & { pts: number; effPlace: number };

const defaultOpts: TeamScoringOptions = {
  maxRiders: DEFAULT_MAX_RIDERS,
  maxPerGender: DEFAULT_MAX_PER_GENDER,
};

/** Best team score for one team; top maxRiders, max maxPerGender per gender; optional place overrides */
export function computeTeamScore(
  riders: RiderWithPlace[],
  placeOverrides?: Record<string, number>,
  opts: TeamScoringOptions = defaultOpts
): { total: number; roster: ScoredRider[]; bc: number; gc: number } {
  const { maxRiders, maxPerGender } = opts;
  const ov = placeOverrides ?? {};
  const scored: ScoredRider[] = riders
    .filter((r) => r.team && r.totalTime != null)
    .map((r) => {
      const pl = ov[r.id] != null ? ov[r.id]! : r.place;
      return { ...r, pts: racePoints(pl, r.category), effPlace: pl } as ScoredRider;
    })
    .filter((r) => r.pts > 0);
  const boys = _.sortBy(scored.filter((r) => r.gender === "boys"), (r) => -r.pts);
  const girls = _.sortBy(scored.filter((r) => r.gender === "girls"), (r) => -r.pts);
  let best: { total: number; roster: ScoredRider[]; bc: number; gc: number } = {
    total: 0,
    roster: [],
    bc: 0,
    gc: 0,
  };
  for (let nb = 0; nb <= Math.min(maxRiders, boys.length, maxPerGender); nb++) {
    const ng = Math.min(maxRiders - nb, girls.length, maxPerGender);
    const pick = boys.slice(0, nb).concat(girls.slice(0, ng));
    const total = _.sumBy(pick, "pts");
    if (total > best.total) best = { total, roster: pick, bc: nb, gc: ng };
  }
  return best;
}

/** All team standings sorted by total points; optional place overrides and scoring options */
export function allTS(
  data: Rider[],
  placeOverrides?: Record<string, number>,
  opts: TeamScoringOptions = defaultOpts
): TeamScore[] {
  const ov = placeOverrides ?? {};
  const withTeam = data.filter((r) => r.team);
  const groups = _.groupBy(withTeam, "team");
  return _.sortBy(
    Object.entries(groups).map(([team, teamRiders]) => {
      const res = computeTeamScore(teamRiders, ov, opts);
      const ids = new Set(res.roster.map((r) => r.id));
      return {
        team,
        region: REGION_MAP[team.toUpperCase()] ?? "Other",
        total: res.total,
        roster: res.roster,
        bc: res.bc,
        gc: res.gc,
        riderCount: teamRiders.length,
        rosterIds: ids,
      };
    }),
    (r) => -r.total
  );
}
