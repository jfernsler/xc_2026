import _ from "lodash";
import type { Rider, ScenarioRider, OvertakeMove, OvertakeResult } from "../types";
import { allTS } from "../scoring/teamScore";
import { racePoints } from "../scoring/points";

/** Build override map from scenario data */
function scenarioOverrides(scenarioData: Record<string, ScenarioRider[]>): Record<string, number> {
  const ov: Record<string, number> = {};
  Object.values(scenarioData).forEach((arr) => {
    arr.forEach((r) => { ov[r.id] = r.scenarioPlace; });
  });
  return ov;
}

/** Find overtake opportunities: target team vs rival within time threshold */
export function findMoves(
  rawData: Rider[],
  targetTeam: string,
  rivalTeam: string,
  overtakeThreshold: number,
  scenarioData: Record<string, ScenarioRider[]>
): OvertakeResult {
  const ov = scenarioOverrides(scenarioData);
  const scores = allTS(rawData, ov);
  const ts = scores.find((t) => t.team === targetTeam);
  const rs = scores.find((t) => t.team === rivalTeam);
  if (!ts || !rs) return { gap: 0, moves: [], tp: 0, rp2: 0 };
  const gap = rs.total - ts.total;
  const riders = rawData.filter((r) => r.totalTime != null);
  const byCat = _.groupBy(riders, "categoryRaw");
  const moves: OvertakeMove[] = [];
  for (const [cat, riders] of Object.entries(byCat)) {
    const sorted = _.sortBy(
      riders.map((r) => {
        const o = ov[r.id];
        return o != null ? { ...r, place: o } : r;
      }),
      "place"
    );
    for (let i = 0; i < sorted.length; i++) {
      const r = sorted[i]!;
      if (r.team !== targetTeam && r.team !== rivalTeam) continue;
      if (r.team === targetTeam) {
        for (let j = 0; j < i; j++) {
          const above = sorted[j]!;
          const tg = (r.totalTime ?? 0) - (above.totalTime ?? 0);
          if (tg > overtakeThreshold || tg <= 0) continue;
          const oldPts = racePoints(r.place, r.category);
          const newPts = racePoints(above.place, r.category);
          const gain = newPts - oldPts;
          if (gain <= 0) continue;
          let rivalLoss = 0;
          for (let k = j; k < i; k++) {
            if (sorted[k]!.team === rivalTeam) {
              rivalLoss += racePoints(sorted[k]!.place, sorted[k]!.category) - racePoints(sorted[k]!.place + 1, sorted[k]!.category);
            }
          }
          const net = gain + rivalLoss;
          if (net > 0) {
            moves.push({
              type: "advance",
              cat,
              rider: r,
              target: above,
              posFrom: r.place,
              posTo: above.place,
              timeNeeded: tg,
              gain,
              rivalLoss,
              netSwing: net,
              efficiency: net / Math.max(tg, 0.1),
              withinThreshold: tg <= overtakeThreshold,
              team: targetTeam,
              positions: i - j,
            });
          }
        }
      }
      if (r.team === rivalTeam) {
        for (let k2 = i + 1; k2 < sorted.length && k2 <= i + 8; k2++) {
          if (sorted[k2]!.team === targetTeam) {
            const tGap = (sorted[k2]!.totalTime ?? 0) - (r.totalTime ?? 0);
            if (tGap > overtakeThreshold || tGap <= 0) break;
            const tGain = racePoints(r.place, sorted[k2]!.category) - racePoints(sorted[k2]!.place, sorted[k2]!.category);
            const rLoss = racePoints(r.place, r.category) - racePoints(sorted[k2]!.place, r.category);
            if (tGain + rLoss > 0) {
              moves.push({
                type: "overtake_rival",
                cat,
                rider: sorted[k2]!,
                target: r,
                posFrom: sorted[k2]!.place,
                posTo: r.place,
                timeNeeded: tGap,
                gain: tGain,
                rivalLoss: rLoss,
                netSwing: tGain + rLoss,
                efficiency: (tGain + rLoss) / Math.max(tGap, 0.1),
                withinThreshold: tGap <= overtakeThreshold,
                team: targetTeam,
                positions: k2 - i,
              });
            }
            break;
          }
        }
      }
    }
  }
  const unique = _.uniqBy(_.sortBy(moves, (m) => -m.efficiency), (m) => m.rider.id + "-" + m.posTo);
  return { gap, moves: unique, tp: ts.total, rp2: rs.total };
}
