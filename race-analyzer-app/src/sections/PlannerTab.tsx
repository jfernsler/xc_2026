import type { OvertakeResult, TeamScore } from "../types";

interface PlannerTabProps {
  teams: string[];
  tScores: TeamScore[];
  opTarget: string;
  opRival: string;
  opThreshold: number;
  selectedMoves: Set<number>;
  opResults: OvertakeResult | null;
  selectedSwing: number;
  scoringIds: Set<string>;
  setOpTarget: (v: string) => void;
  setOpRival: (v: string) => void;
  setOpThreshold: (v: number) => void;
  setHl: (v: string | null) => void;
  setSelectedMoves: React.Dispatch<React.SetStateAction<Set<number>>>;
  sendToScenario: () => void;
  generateReport: () => void;
  toggleMove: (i: number) => void;
}

function isSc(riderId: string, scoringIds: Set<string>) {
  return scoringIds.has(riderId);
}

export function PlannerTab({
  teams,
  tScores,
  opTarget,
  opRival,
  opThreshold,
  selectedMoves,
  opResults,
  selectedSwing,
  scoringIds,
  setOpTarget,
  setOpRival,
  setOpThreshold,
  setHl,
  setSelectedMoves,
  sendToScenario,
  generateReport,
  toggleMove,
}: PlannerTabProps) {
  const teamRankOrder = tScores.map((t) => t.team);
  const targetRank = opTarget ? teamRankOrder.indexOf(opTarget) : -1;
  const teamsAhead = targetRank > 0 ? teamRankOrder.slice(0, targetRank) : [];
  const teamsOther = opTarget
    ? teamRankOrder.filter((t) => t !== opTarget && !teamsAhead.includes(t))
    : teams.slice();

  return (
    <div>
      <div className="bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-600 p-4 mb-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">🎯 Overtake Planner</h2>
        <div className="flex gap-3 flex-wrap items-end mb-3">
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Your Team</label>
            <select
              value={opTarget}
              onChange={(e) => {
                setOpTarget(e.target.value);
                setHl(e.target.value || null);
                setSelectedMoves(new Set());
              }}
              className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1.5 text-xs text-slate-900 min-w-48"
            >
              <option value="">Select...</option>
              {teams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Rival Team</label>
            <select
              value={opRival}
              onChange={(e) => { setOpRival(e.target.value); setSelectedMoves(new Set()); }}
              className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1.5 text-xs text-slate-900 min-w-48"
            >
              <option value="">Select...</option>
              {opTarget ? (
                <>
                  {teamsAhead.length > 0 && (
                    <optgroup label="── Ahead of you ──">
                      {teamsAhead.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </optgroup>
                  )}
                  {teamsAhead.length > 0 && teamsOther.length > 0 && <option disabled>────────────</option>}
                  {teamsOther.length > 0 && (
                    <optgroup label="Other teams">
                      {teamsOther.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </optgroup>
                  )}
                </>
              ) : (
                teams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Overtake Threshold</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={opThreshold}
                onChange={(e) => setOpThreshold(parseInt(e.target.value, 10) || 0)}
                className="w-16 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1.5 text-xs text-slate-900"
              />
              <span className="text-xs text-slate-400 dark:text-slate-500">s</span>
            </div>
          </div>
        </div>

        {opResults && (
          <div>
            <div
              className={
                "flex items-center gap-4 p-3 rounded mb-4 " +
                (opResults.gap > 0 ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" : "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800")
              }
            >
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Point Gap</div>
                <div className={"text-2xl font-bold " + (opResults.gap > 0 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {opResults.gap > 0 ? "-" : "+"}
                  {Math.abs(opResults.gap)}
                </div>
              </div>
              <div className="text-xs space-y-1">
                <div>
                  <span className="text-sky-600 dark:text-sky-400">{opTarget}</span>:{" "}
                  <span className="font-mono font-bold">{opResults.tp}</span>
                </div>
                <div>
                  <span className="text-red-500 dark:text-red-400">{opRival}</span>:{" "}
                  <span className="font-mono font-bold">{opResults.rp2}</span>
                </div>
              </div>
              {selectedMoves.size > 0 && (
                <div className="ml-auto text-right">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Selected swing</div>
                  <div
                    className={
                      "text-xl font-bold " +
                      (selectedSwing >= opResults.gap && opResults.gap > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")
                    }
                  >
                    +{selectedSwing}
                  </div>
                  {selectedSwing >= opResults.gap && opResults.gap > 0 && (
                    <div className="text-emerald-600 dark:text-emerald-400 text-xs font-bold">✓ OVERTAKE</div>
                  )}
                </div>
              )}
              {opResults.gap <= 0 && (
                <div className="text-emerald-600 dark:text-emerald-400 text-sm font-bold ml-auto">✓ Already ahead!</div>
              )}
            </div>

            {selectedMoves.size > 0 && (
              <div className="flex gap-2 mb-3">
                <button
                  onClick={sendToScenario}
                  className="px-3 py-1.5 bg-purple-500 hover:bg-purple-400 text-white rounded text-sm font-medium"
                >
                  🔀 Send to Scenario
                </button>
                <button
                  onClick={() => setSelectedMoves(new Set())}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-sm"
                >
                  Clear Selection ({selectedMoves.size})
                </button>
                <button
                  onClick={generateReport}
                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white rounded text-sm"
                >
                  📋 Report
                </button>
              </div>
            )}

            {opResults.moves.length > 0 && (
              <div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mb-2" style={{ fontSize: "10px" }}>
                  Click rows to select. <span className="text-emerald-500">●</span> scoring{" "}
                  <span className="text-amber-600 dark:text-amber-400 ml-2">⚡</span> within {opThreshold}s
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-600">
                      <th className="py-1 px-1 w-6"></th>
                      <th className="py-1 px-1 text-left">Category</th>
                      <th className="py-1 px-1 text-left">Rider</th>
                      <th className="py-1 px-1 text-left">Move</th>
                      <th className="py-1 px-1 text-right">Time</th>
                      <th className="py-1 px-1 text-right">Gain</th>
                      <th className="py-1 px-1 text-right">Rival</th>
                      <th className="py-1 px-1 text-right">Net</th>
                      <th className="py-1 px-1 text-right">Eff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opResults.moves.map((m, i) => {
                      const sel = selectedMoves.has(i);
                      const hasSel = selectedMoves.size > 0;
                      const dimmed = hasSel && !sel;
                      return (
                        <tr
                          key={i}
                          onClick={() => toggleMove(i)}
                          className={
                            "border-b border-slate-100 dark:border-slate-700 cursor-pointer transition " +
                            (sel ? "bg-sky-100/80 dark:bg-sky-900/30 border-l-2 border-sky-400 dark:border-sky-500" : dimmed ? "opacity-30" : "hover:bg-slate-100/50 dark:hover:bg-slate-700/50")
                          }
                        >
                          <td className="py-1 px-1 text-center">
                            {sel ? <span className="text-sky-500 dark:text-sky-400">✓</span> : <span className="text-slate-300 dark:text-slate-600">○</span>}
                          </td>
                          <td className="py-1 px-1 text-slate-700 dark:text-slate-300">{m.cat}</td>
                          <td className="py-1 px-1">
                            {isSc(m.rider.id, scoringIds) && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-0.5" />
                            )}
                            <span className="text-sky-600">{m.rider.name}</span>
                            {m.type === "overtake_rival" && (
                              <span className="text-slate-400 dark:text-slate-500 ml-1">
                                →<span className="text-red-500 dark:text-red-400 ml-0.5">{m.target.name}</span>
                              </span>
                            )}
                          </td>
                          <td className="py-1 px-1 font-mono">P{m.posFrom}→P{m.posTo}</td>
                          <td
                            className={
                              "py-1 px-1 text-right font-mono " +
                              (m.withinThreshold ? "text-amber-600 dark:text-amber-400 font-bold" : "text-slate-400 dark:text-slate-500")
                            }
                          >
                            {m.timeNeeded.toFixed(1)}s{m.withinThreshold ? " ⚡" : ""}
                          </td>
                          <td className="py-1 px-1 text-right font-mono text-emerald-600 dark:text-emerald-400">+{m.gain}</td>
                          <td className="py-1 px-1 text-right font-mono text-red-500 dark:text-red-400">
                            {m.rivalLoss > 0 ? "-" + m.rivalLoss : "0"}
                          </td>
                          <td className="py-1 px-1 text-right font-mono font-bold text-slate-900 dark:text-slate-100">{m.netSwing}</td>
                          <td className="py-1 px-1 text-right font-mono text-slate-400 dark:text-slate-500">{m.efficiency.toFixed(1)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {selectedMoves.size > 0 && (
                  <div className="mt-4 bg-slate-100/50 dark:bg-slate-700/50 rounded p-3">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Selected Moves Impact</h3>
                    <div className="space-y-1">
                      {(() => {
                        let cum = 0;
                        const selMoves = opResults.moves.filter((_, i) => selectedMoves.has(i));
                        return selMoves.map((m, i) => {
                          cum += m.netSwing;
                          const ot = cum >= opResults.gap && opResults.gap > 0;
                          return (
                            <div
                              key={i}
                              className={"flex items-center gap-2 text-xs " + (ot ? "bg-emerald-50 dark:bg-emerald-900/20 rounded p-1" : "")}
                            >
                              <span className="w-24 truncate dark:text-slate-200">{m.rider.name}</span>
                              <span className="font-mono text-slate-400 dark:text-slate-500 w-12">{m.timeNeeded.toFixed(1)}s</span>
                              <div className="flex-1 h-3 bg-slate-200 dark:bg-slate-600 rounded relative">
                                <div
                                  className={"h-3 rounded " + (cum >= opResults.gap ? "bg-emerald-500" : "bg-sky-500")}
                                  style={{
                                    width: (opResults.gap > 0 ? Math.min((cum / opResults.gap) * 100, 100) : 100) + "%",
                                  }}
                                />
                              </div>
                              <span className="font-mono font-bold w-10 text-right dark:text-slate-100">
                                {cum >= 0 ? "+" : ""}
                                {cum}
                              </span>
                              <span className="text-slate-400 dark:text-slate-500 w-10 text-right">/{opResults.gap}</span>
                              {ot && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold" style={{ fontSize: "10px" }}>
                                  ✓
                                </span>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {opResults.moves.length === 0 && opResults.gap > 0 && (
              <div className="text-center py-6 text-slate-400 dark:text-slate-500">
                No moves found within {opThreshold}s. Try increasing the overtake threshold.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
