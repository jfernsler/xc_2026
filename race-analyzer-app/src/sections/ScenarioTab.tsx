import _ from "lodash";
import type { Rider, ScenarioRider, TeamScore, ScenarioChange } from "../types";
import { HLBar } from "../components/HLBar";
import { ScoringDot } from "../components/ScoringDot";
import { formatTime } from "../utils/time";
import { regionTextClass } from "../utils/regionStyles";

function isHL(hl: string | null, r: Rider) {
  return hl != null && r.team === hl;
}

interface ScenarioTabProps {
  cats: string[];
  sCats: string[];
  sData: Record<string, ScenarioRider[]>;
  sRegion: string;
  tScores: TeamScore[];
  origScores: TeamScore[];
  origMap: Record<string, number>;
  currentChanges: ScenarioChange[];
  rawData: Rider[];
  threshold: number;
  hl: string | null;
  teams: string[];
  scoringIds: Set<string>;
  onToggleCat: (cat: string) => void;
  moveRider: (cat: string, idx: number, dir: number) => void;
  resetScenario: () => void;
  setSRegion: (v: string) => void;
  setHl: (v: string | null) => void;
  generateReport: () => void;
}

export function ScenarioTab({
  cats,
  sCats,
  sData,
  sRegion,
  tScores,
  origScores,
  origMap,
  currentChanges,
  rawData,
  threshold,
  hl,
  teams,
  scoringIds,
  onToggleCat,
  moveRider,
  resetScenario,
  setSRegion,
  setHl,
  generateReport,
}: ScenarioTabProps) {
  const displayScores = sRegion !== "All" ? tScores.filter((t) => t.region === sRegion) : tScores;
  const origDisplay = sRegion !== "All" ? origScores.filter((t) => t.region === sRegion) : origScores;
  const origRank: Record<string, number> = {};
  origDisplay.forEach((t, i) => { origRank[t.team] = i + 1; });

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs text-slate-500">Categories:</span>
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => onToggleCat(c)}
            className={
              "text-xs px-2 py-1 rounded transition " +
              (sCats.includes(c) ? "bg-purple-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200")
            }
          >
            {c}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-slate-500">Region:</span>
        {["All", "North", "Central", "South"].map((r) => (
          <button
            key={r}
            onClick={() => setSRegion(r)}
            className={"text-xs px-2 py-1 rounded " + (sRegion === r ? "bg-slate-300 text-slate-900" : "bg-slate-100 text-slate-400")}
          >
            {r}
          </button>
        ))}
        <div className="flex-1" />
        <HLBar hl={hl} teams={teams} onHlChange={setHl} />
        {sCats.length > 0 && (
          <span>
            <button onClick={resetScenario} className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded mr-1">
              Reset
            </button>
            <button onClick={generateReport} className="text-xs px-2 py-1 bg-sky-500 hover:bg-sky-400 text-white rounded">
              📋 Report
            </button>
          </span>
        )}
      </div>

      {!sCats.length && (
        <div className="text-center py-10 text-slate-400">
          Select categories or use Overtake Planner → Send to Scenario
        </div>
      )}

      {sCats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-1 space-y-3">
            <div className="bg-white rounded border border-slate-200 p-3">
              <div className="text-xs font-bold text-slate-700 mb-2">
                🏆 Teams {sRegion !== "All" ? `(${sRegion})` : ""}
              </div>
              <div className="mb-1" style={{ fontSize: "10px" }}>
                <span className="text-emerald-500">●</span>
                <span className="text-slate-400"> = scoring rider</span>
              </div>
              <div className="space-y-1">
                {displayScores.map((t, i) => {
                  const or2 = origRank[t.team] ?? 999;
                  const op = origMap[t.team] ?? 0;
                  const rkC = or2 - (i + 1);
                  const ptD = t.total - op;
                  const h = hl === t.team;
                  return (
                    <div
                      key={t.team}
                      onClick={() => setHl(h ? null : t.team)}
                      className={
                        "flex items-center gap-1 text-xs p-1 rounded cursor-pointer transition " +
                        (h ? "bg-sky-100 border border-sky-400" : "hover:bg-slate-100")
                      }
                    >
                      <span className="w-4 text-right font-bold text-slate-400">{i + 1}</span>
                      {rkC !== 0 ? (
                        <span className={"w-5 " + (rkC > 0 ? "text-emerald-600" : "text-red-500")} style={{ fontSize: "10px" }}>
                          {rkC > 0 ? "▲" : "▼"}
                          {Math.abs(rkC)}
                        </span>
                      ) : (
                        <span className="w-5" />
                      )}
                      <span className={"flex-1 truncate " + (h ? "text-sky-600 font-bold" : regionTextClass(t.region))}>
                        {t.team}
                      </span>
                      <span className="font-mono font-bold">{t.total}</span>
                      {ptD !== 0 && (
                        <span className={"font-mono " + (ptD > 0 ? "text-emerald-600" : "text-red-500")} style={{ fontSize: "10px" }}>
                          {ptD > 0 ? "+" : ""}
                          {ptD}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {currentChanges.length > 0 && (
              <div className="bg-white rounded border border-slate-200 p-2">
                <div className="text-xs font-semibold text-slate-500 mb-1">Changes ({currentChanges.length})</div>
                <div className="space-y-0.5 max-h-48 overflow-y-auto" style={{ fontSize: "10px" }}>
                  {currentChanges.map((c, i) => (
                    <div key={i} className="flex gap-1 flex-wrap">
                      <span className="text-slate-400">[{c.cat.split(" ")[0]}]</span>
                      <span>{c.name}</span>
                      <span className="text-slate-400">P{c.from}→P{c.to}</span>
                      <span className={c.delta > 0 ? "text-emerald-600" : c.delta < 0 ? "text-red-500" : "text-slate-400"}>
                        {c.delta > 0 ? "+" : ""}
                        {c.delta}pts
                      </span>
                      {c.makeup != null && <span className="text-amber-600">{c.makeup.toFixed(1)}s</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-3 space-y-4">
            {sCats.map((cat) => {
              const riders = sData[cat] ?? [];
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-sm font-bold text-slate-900">{cat}</h2>
                    <button onClick={() => onToggleCat(cat)} className="text-slate-400 hover:text-slate-700" style={{ fontSize: "10px" }}>
                      ✕
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-200">
                          <th className="py-1 px-0.5 w-12">Mv</th>
                          <th className="py-1 px-0.5 text-left">P</th>
                          <th className="py-1 px-0.5 text-left">Og</th>
                          <th className="py-1 px-0.5 text-left">Name</th>
                          <th className="py-1 px-0.5 text-left">Team</th>
                          <th className="py-1 px-0.5 text-center">G</th>
                          <th className="py-1 px-0.5 text-right">Pts</th>
                          <th className="py-1 px-0.5 text-right">Og</th>
                          <th className="py-1 px-0.5 text-right">Δ</th>
                          <th className="py-1 px-0.5 text-right">Time</th>
                          <th className="py-1 px-0.5 text-right">Gap↑</th>
                          <th className="py-1 px-0.5 text-right">Makeup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {riders.map((r, i) => {
                          const delta = r.scenarioPoints - r.originalPoints;
                          const moved = r.scenarioPlace !== r.originalPlace;
                          const ga = i > 0 && riders[i - 1]!.totalTime != null && r.totalTime != null
                            ? r.totalTime - riders[i - 1]!.totalTime!
                            : null;
                          let makeup: number | null = null;
                          if (moved && r.scenarioPlace < r.originalPlace) {
                            const origR = rawData.filter((x) => x.categoryRaw === cat && x.totalTime != null);
                            const origS = _.sortBy(origR, "place");
                            const tgtR = origS[r.scenarioPlace - 1];
                            if (tgtR && r.totalTime != null && tgtR.totalTime != null) makeup = r.totalTime - tgtR.totalTime;
                          }
                          const bgClass = isHL(hl, r)
                            ? "bg-sky-100/60"
                            : moved
                              ? delta > 0
                                ? "bg-emerald-50"
                                : delta < 0
                                  ? "bg-red-50"
                                  : "bg-amber-50"
                              : "hover:bg-slate-50";
                          return (
                            <tr key={r.id} className={"border-b border-slate-100 " + bgClass}>
                              <td className="py-0.5 px-0.5 text-center whitespace-nowrap">
                                <button
                                  onClick={() => moveRider(cat, i, -1)}
                                  disabled={i === 0}
                                  className="px-0.5 hover:text-slate-900 disabled:text-slate-200 text-slate-400"
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => moveRider(cat, i, 1)}
                                  disabled={i === riders.length - 1}
                                  className="px-0.5 hover:text-slate-900 disabled:text-slate-200 text-slate-400"
                                >
                                  ▼
                                </button>
                              </td>
                              <td className="py-0.5 px-0.5 font-mono font-bold">{r.scenarioPlace}</td>
                              <td className={"py-0.5 px-0.5 font-mono " + (moved ? "text-amber-600" : "text-slate-300")}>
                                {r.originalPlace}
                              </td>
                              <td className={"py-0.5 px-0.5 font-medium " + (isHL(hl, r) ? "text-sky-600 font-bold" : "")}>
                                <ScoringDot r={r} isScoring={scoringIds.has(r.id)} />
                                {r.name}
                              </td>
                              <td className={"py-0.5 px-0.5 max-w-20 truncate " + (isHL(hl, r) ? "text-sky-600" : regionTextClass(r.region))} title={r.team}>
                                {r.team || "—"}
                              </td>
                              <td className={"py-0.5 px-0.5 text-center " + (r.gender === "girls" ? "text-pink-500" : "text-sky-500")}>
                                {r.gender[0].toUpperCase()}
                              </td>
                              <td className="py-0.5 px-0.5 text-right font-mono font-bold">{r.scenarioPoints}</td>
                              <td className="py-0.5 px-0.5 text-right font-mono text-slate-400">{r.originalPoints}</td>
                              <td className={"py-0.5 px-0.5 text-right font-mono font-bold " + (delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-300")}>
                                {delta !== 0 ? (delta > 0 ? "+" : "") + delta : "·"}
                              </td>
                              <td className="py-0.5 px-0.5 text-right font-mono text-slate-400">{formatTime(r.totalTime)}</td>
                              <td className="py-0.5 px-0.5 text-right font-mono">
                                {ga != null && ga > 0 ? (
                                  <span className={ga <= threshold ? "text-amber-600 font-bold" : "text-slate-400"}>
                                    {ga.toFixed(1)}s
                                  </span>
                                ) : (
                                  ""
                                )}
                              </td>
                              <td className="py-0.5 px-0.5 text-right font-mono">
                                {makeup != null ? <span className="text-orange-500">-{makeup.toFixed(1)}s</span> : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
