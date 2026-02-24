import { useState, useMemo, useEffect } from "react";
import _ from "lodash";
import type { Rider, ScenarioRider, ScenarioChange } from "./types";
import { getSchoolLevel } from "./constants/schoolLevel";
import { DEFAULT_MAX_PER_GENDER, DEFAULT_MAX_RIDERS } from "./constants/scoring";
import { fetchRacesManifest, loadRaceCsv, loadAllRaces, type RaceOption } from "./utils/races";
import { allTS } from "./scoring/teamScore";
import { racePoints } from "./scoring/points";
import { findMoves } from "./moves/findMoves";
import { TABS, CUMULATIVE_TABS } from "./constants/tabs";
import { Filters } from "./components/Filters";
import { ResultsTab } from "./sections/ResultsTab";
import { TeamsTab } from "./sections/TeamsTab";
import { PlannerTab } from "./sections/PlannerTab";
import { ScenarioTab } from "./sections/ScenarioTab";
import { AnalysisTab } from "./sections/AnalysisTab";
import { ReportTab } from "./sections/ReportTab";
import { CumulativeTeamsTab, type CumulativeTeamRow } from "./sections/CumulativeTeamsTab";
import { PlacementOverTimeTab } from "./sections/PlacementOverTimeTab";

const REGIONS = ["North", "Central", "South", "Other"];

export default function App() {
  const [rawData, setRawData] = useState<Rider[]>([]);
  const [tab, setTab] = useState("results");
  const [fR, setFR] = useState("All");
  const [fT, setFT] = useState("All");
  const [fC, setFC] = useState("All");
  const [fRace, setFRace] = useState("All");
  const [fSchool, setFSchool] = useState("All");
  const [threshold, setThreshold] = useState(30);
  const [maxRiders, setMaxRiders] = useState(DEFAULT_MAX_RIDERS);
  const [maxPerGender, setMaxPerGender] = useState(DEFAULT_MAX_PER_GENDER);
  const [hl, setHl] = useState<string | null>(null);
  const [sCats, setSCats] = useState<string[]>([]);
  const [sData, setSData] = useState<Record<string, ScenarioRider[]>>({});
  const [sRegion, setSRegion] = useState("All");
  const [opTarget, setOpTarget] = useState("");
  const [opRival, setOpRival] = useState("");
  const [opThreshold, setOpThreshold] = useState(10);
  const [selectedMoves, setSelectedMoves] = useState<Set<number>>(new Set());
  const [reportText, setReportText] = useState("");
  const [raceOptions, setRaceOptions] = useState<RaceOption[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastSentCategories, setLastSentCategories] = useState<string[]>([]);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem("race-analyzer-dark");
      return stored !== "false";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      localStorage.setItem("race-analyzer-dark", String(darkMode));
    } catch {}
  }, [darkMode]);

  useEffect(() => {
    fetchRacesManifest()
      .then(setRaceOptions)
      .catch(() => setRaceOptions([]));
  }, []);

  const loadRace = (race: RaceOption) => {
    setLoadError(null);
    setLoading(true);
    loadRaceCsv(race)
      .then((riders) => {
        setRawData(riders);
        setTab("results");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load race"))
      .finally(() => setLoading(false));
  };

  const loadAll = () => {
    setLoadError(null);
    setLoading(true);
    loadAllRaces(raceOptions)
      .then((riders) => {
        setRawData(riders);
        setTab("cumulative-teams");
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load all races"))
      .finally(() => setLoading(false));
  };

  const handleRaceSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedRaceId(id);
    if (id === "all") {
      loadAll();
    } else {
      const race = raceOptions.find((r) => String(r.id) === id);
      if (race) loadRace(race);
    }
  };

  const hsData = useMemo(() => rawData.filter((r) => getSchoolLevel(r) === "hs"), [rawData]);
  const gf = useMemo(() => {
    if (fSchool === "All") return rawData;
    const level = fSchool === "High School" ? "hs" : "ms";
    return rawData.filter((r) => getSchoolLevel(r) === level);
  }, [rawData, fSchool]);
  const teams = useMemo(() => _.sortBy(_.uniq(gf.map((r) => r.team)).filter(Boolean)), [gf]);
  const hsTeams = useMemo(() => _.sortBy(_.uniq(hsData.map((r) => r.team)).filter(Boolean)), [hsData]);
  const cats = useMemo(() => _.sortBy(_.uniq(gf.map((r) => r.categoryRaw)).filter(Boolean)), [gf]);
  const races = useMemo(() => _.sortBy(_.uniq(gf.map((r) => r.race))), [gf]);

  const filtered = useMemo(() => {
    let d = gf;
    if (fR !== "All") d = d.filter((r) => r.region === fR);
    if (fT !== "All") d = d.filter((r) => r.team === fT);
    if (fC !== "All") d = d.filter((r) => r.categoryRaw === fC);
    if (fRace !== "All") d = d.filter((r) => r.race === parseInt(fRace, 10));
    return _.sortBy(d, ["race", "categoryRaw", "place"]);
  }, [gf, fR, fT, fC, fRace]);

  const scenOv = useMemo(() => {
    const o: Record<string, number> = {};
    Object.values(sData).forEach((arr) => arr.forEach((r) => { o[r.id] = r.scenarioPlace; }));
    return o;
  }, [sData]);

  const scoringOpts = useMemo(() => ({ maxRiders, maxPerGender }), [maxRiders, maxPerGender]);
  const tScores = useMemo(() => allTS(hsData, scenOv, scoringOpts), [hsData, scenOv, scoringOpts]);
  const scoringIds = useMemo(() => {
    const s = new Set<string>();
    tScores.forEach((t) => t.rosterIds.forEach((id) => s.add(id)));
    return s;
  }, [tScores]);
  const origScores = useMemo(() => allTS(hsData, undefined, scoringOpts), [hsData, scoringOpts]);
  const origMap = useMemo(() => {
    const m: Record<string, number> = {};
    origScores.forEach((t) => { m[t.team] = t.total; });
    return m;
  }, [origScores]);

  const cumulativeTeamRows = useMemo((): CumulativeTeamRow[] => {
    if (races.length < 2) return [];
    const byRace = _.groupBy(hsData, "race");
    const raceIds = _.sortBy(Object.keys(byRace).map(Number));
    const teamMap: Record<string, { team: string; region: string; total: number; byRace: Record<number, number> }> = {};
    raceIds.forEach((raceId) => {
      const riders = byRace[String(raceId)] ?? [];
      const ts = allTS(riders, undefined, scoringOpts);
      ts.forEach((t) => {
        if (!teamMap[t.team]) teamMap[t.team] = { team: t.team, region: t.region, total: 0, byRace: {} };
        teamMap[t.team].total += t.total;
        teamMap[t.team].byRace[raceId] = t.total;
      });
    });
    return _.sortBy(Object.values(teamMap), (r) => -r.total);
  }, [hsData, races.length, scoringOpts]);

  const toggleCat = (cat: string) => {
    if (sCats.includes(cat)) {
      setSCats((p) => p.filter((c) => c !== cat));
      setSData((p) => { const n = { ...p }; delete n[cat]; return n; });
    } else {
      const riders = rawData.filter((r) => r.categoryRaw === cat && r.totalTime != null);
      const sorted = _.sortBy(riders, "place").map((r, i) => ({
        ...r,
        scenarioPlace: i + 1,
        originalPlace: r.place,
        originalPoints: racePoints(r.place, r.category),
        scenarioPoints: racePoints(i + 1, r.category),
      })) as ScenarioRider[];
      setSCats((p) => p.concat([cat]));
      setSData((p) => ({ ...p, [cat]: sorted }));
    }
  };

  const moveRider = (cat: string, idx: number, dir: number) => {
    const riders = (sData[cat] ?? []).slice();
    const ti = idx + dir;
    if (ti < 0 || ti >= riders.length) return;
    [riders[idx], riders[ti]] = [riders[ti]!, riders[idx]!];
    riders.forEach((r, i) => {
      r.scenarioPlace = i + 1;
      r.scenarioPoints = racePoints(i + 1, r.category);
    });
    setSData((p) => ({ ...p, [cat]: riders }));
  };

  const resetScenario = () => {
    setSCats([]);
    setSData({});
    setLastSentCategories([]);
  };

  const currentChanges = useMemo((): ScenarioChange[] => {
    const changes: ScenarioChange[] = [];
    Object.entries(sData).forEach(([cat, riders]) => {
      riders.forEach((r) => {
        if (r.scenarioPlace !== r.originalPlace) {
          let makeup: number | null = null;
          if (r.scenarioPlace < r.originalPlace) {
            const orig = rawData.filter((x) => x.categoryRaw === cat && x.totalTime != null);
            const sorted = _.sortBy(orig, "place");
            const targetR = sorted[r.scenarioPlace - 1];
            if (targetR && r.totalTime != null && targetR.totalTime != null) makeup = r.totalTime - targetR.totalTime;
          }
          changes.push({
            cat,
            name: r.name,
            team: r.team,
            from: r.originalPlace,
            to: r.scenarioPlace,
            delta: r.scenarioPoints - r.originalPoints,
            makeup,
          });
        }
      });
    });
    return changes;
  }, [sData, rawData]);

  const opResults = useMemo(() => {
    if (!opTarget || !opRival || opTarget === opRival) return null;
    return findMoves(hsData, opTarget, opRival, opThreshold, sData, scoringOpts);
  }, [hsData, opTarget, opRival, opThreshold, sData, scoringOpts]);

  const selectedSwing = useMemo(() => {
    if (!opResults) return 0;
    return opResults.moves
      .filter((_, i) => selectedMoves.has(i))
      .reduce((s, m) => s + m.netSwing, 0);
  }, [opResults, selectedMoves]);

  const toggleMove = (i: number) => {
    setSelectedMoves((p) => {
      if (!opResults) return p;
      const riderId = opResults.moves[i].rider.id;
      const withoutSameRider = [...p].filter((j) => opResults.moves[j].rider.id !== riderId);
      if (p.has(i)) return new Set(withoutSameRider.filter((j) => j !== i));
      return new Set([...withoutSameRider, i]);
    });
  };

  const sendToScenario = () => {
    if (!opResults) return;
    const selected = opResults.moves.filter((_, i) => selectedMoves.has(i));
    if (!selected.length) return;
    const catMoves: Record<string, typeof selected> = {};
    selected.forEach((m) => {
      if (!catMoves[m.cat]) catMoves[m.cat] = [];
      catMoves[m.cat].push(m);
    });
    const sentCats = Object.keys(catMoves);
    let newSData = { ...sData };
    const newSCats = sCats.slice();
    Object.entries(catMoves).forEach(([cat, moves]) => {
      if (!newSCats.includes(cat)) {
        const riders = rawData.filter((r) => r.categoryRaw === cat && r.totalTime != null);
        const sorted = _.sortBy(riders, "place").map((r, i) => ({
          ...r,
          scenarioPlace: i + 1,
          originalPlace: r.place,
          originalPoints: racePoints(r.place, r.category),
          scenarioPoints: racePoints(i + 1, r.category),
        })) as ScenarioRider[];
        newSData[cat] = sorted;
        newSCats.push(cat);
      }
      let catRiders = newSData[cat].slice();
      moves.forEach((m) => {
        const fromIdx = catRiders.findIndex((r) => r.id === m.rider.id);
        const toIdx = catRiders.findIndex((r) => r.scenarioPlace === m.posTo);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
        const [moved] = catRiders.splice(fromIdx, 1);
        catRiders.splice(toIdx, 0, moved!);
        catRiders.forEach((r, i) => {
          r.scenarioPlace = i + 1;
          r.scenarioPoints = racePoints(i + 1, r.category);
        });
      });
      newSData[cat] = catRiders;
    });
    setLastSentCategories(sentCats);
    if (sentCats.length > 0) setFC(sentCats[0]!);
    setSCats(newSCats);
    setSData(newSData);
    setTab("scenario");
  };

  const generateReport = () => {
    const L: string[] = [];
    L.push("# Race Scenario Analysis Report");
    L.push("Threshold: " + threshold + "s | Overtake threshold: " + opThreshold + "s");
    if (sCats.length) L.push("Scenario categories: " + sCats.join(", "));
    if (currentChanges.length) {
      L.push("\n## Scenario Changes (" + currentChanges.length + "):");
      currentChanges.forEach((c) => {
        L.push(
          "- [" + c.cat + "] " + c.name + " (" + c.team + ") P" + c.from + "->P" + c.to + " | " + (c.delta >= 0 ? "+" : "") + c.delta + "pts" + (c.makeup != null ? " | Makeup: " + c.makeup.toFixed(1) + "s" : "")
        );
      });
    }
    L.push("\n## Team Standings:");
    const display = sRegion !== "All" ? tScores.filter((t) => t.region === sRegion) : tScores;
    display.forEach((t, i) => {
      const op = origMap[t.team] ?? 0;
      const d = t.total - op;
      L.push((i + 1) + ". " + t.team + " (" + t.region + "): " + t.total + "pts" + (d ? " (" + (d > 0 ? "+" : "") + d + ")" : "") + " [" + t.bc + "B+" + t.gc + "G]");
    });
    if (opResults && opTarget && opRival) {
      L.push("\n## Overtake Plan: " + opTarget + " vs " + opRival);
      L.push("Gap: " + opResults.gap + "pts (" + opResults.tp + " vs " + opResults.rp2 + ")");
      const sel = opResults.moves.filter((_, i) => selectedMoves.has(i));
      if (sel.length) {
        L.push("\nSelected moves (" + sel.length + "):");
        sel.forEach((m, i) => L.push((i + 1) + ". [" + m.cat + "] " + m.rider.name + " P" + m.posFrom + "->P" + m.posTo + " | " + m.timeNeeded.toFixed(1) + "s | +" + m.gain + " gain, -" + m.rivalLoss + " rival | net " + m.netSwing));
        L.push("Total selected swing: " + selectedSwing + "pts " + (selectedSwing >= opResults.gap ? "OVERTAKE" : "(gap: " + opResults.gap + ")"));
      }
      L.push("\nAll ranked moves:");
      opResults.moves.slice(0, 20).forEach((m, i) => L.push((i + 1) + ". [" + m.cat + "] " + m.rider.name + " P" + m.posFrom + "->P" + m.posTo + " | " + m.timeNeeded.toFixed(1) + "s | net " + m.netSwing + "pts | eff " + m.efficiency.toFixed(2) + "pts/s"));
    }
    L.push("\n---\nPaste into LLM with team strategy goals.");
    setReportText(L.join("\n"));
    setTab("report");
  };

  const reportCopy = () => navigator.clipboard?.writeText(reportText);
  const reportDownload = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([reportText], { type: "text/markdown" }));
    a.download = "race-analysis.md";
    a.click();
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100" style={{ fontFamily: "system-ui,sans-serif" }}>
      {/* ── Compact 40px header ── */}
      <div className="h-10 flex items-center gap-0 px-3 bg-white border-b border-slate-200 dark:bg-slate-800 dark:border-slate-700 shrink-0">
        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 mr-4 whitespace-nowrap shrink-0">🚴 Race Analyzer</span>

        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          className="mr-2 p-1.5 rounded border border-slate-200 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 text-xs"
          title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {darkMode ? "☀️" : "🌙"}
        </button>

        {rawData.length > 0 && (
          <>
            {selectedRaceId === "all" ? (
              <>
                {CUMULATIVE_TABS.map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={
                      "px-3 h-10 text-xs font-medium whitespace-nowrap border-b-2 transition " +
                      (tab === k
                        ? "border-sky-500 text-sky-600 dark:border-sky-400 dark:text-sky-300"
                        : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600")
                    }
                  >
                    {v}
                  </button>
                ))}
              </>
            ) : (
              <>
                {TABS.map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={
                      "px-3 h-10 text-xs font-medium whitespace-nowrap border-b-2 transition " +
                      (tab === k
                        ? "border-sky-500 text-sky-600 dark:border-sky-400 dark:text-sky-300"
                        : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600")
                    }
                  >
                    {v}
                  </button>
                ))}
                {races.length > 1 && (
                  <>
                    <span className="px-2 h-6 border-l border-slate-300 dark:border-slate-600 self-center" aria-hidden />
                    {CUMULATIVE_TABS.map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => setTab(k)}
                        className={
                          "px-3 h-10 text-xs font-medium whitespace-nowrap border-b-2 transition " +
                          (tab === k
                            ? "border-sky-500 text-sky-600 dark:border-sky-400 dark:text-sky-300"
                            : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600")
                        }
                      >
                        {v}
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2 shrink-0 pl-4">
          <label className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 whitespace-nowrap">
            Threshold
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 0)}
              className="w-12 bg-slate-100 border border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 rounded px-1.5 py-0.5 text-slate-900 text-[11px]"
            />
            s
          </label>
          <label className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 whitespace-nowrap">
            Top
            <input
              type="number"
              min={1}
              value={maxRiders}
              onChange={(e) => setMaxRiders(Math.max(1, parseInt(e.target.value, 10) || 0))}
              className="w-9 bg-slate-100 border border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 rounded px-1.5 py-0.5 text-slate-900 text-[11px]"
            />
          </label>
          <label className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 whitespace-nowrap">
            Max/G
            <input
              type="number"
              min={1}
              value={maxPerGender}
              onChange={(e) => setMaxPerGender(Math.max(1, parseInt(e.target.value, 10) || 0))}
              className="w-9 bg-slate-100 border border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 rounded px-1.5 py-0.5 text-slate-900 text-[11px]"
            />
          </label>
          {selectedRaceId === "all" ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">All races</span>
              <select
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) handleRaceSelect({ target: { value: id } } as React.ChangeEvent<HTMLSelectElement>);
                }}
                disabled={loading || !raceOptions.length}
                className="bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1 text-[11px] text-slate-900 w-44 disabled:opacity-50"
                defaultValue=""
              >
                <option value="">Switch to single race…</option>
                {raceOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <select
              value={selectedRaceId}
              onChange={handleRaceSelect}
              disabled={loading || !raceOptions.length}
              className="bg-slate-100 border border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 rounded px-2 py-1 text-[11px] text-slate-900 w-52 disabled:opacity-50"
            >
              <option value="">Select race…</option>
              {raceOptions.length > 1 && (
                <option value="all">All races (cumulative)</option>
              )}
              {raceOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          {loading && <span className="text-[11px] text-slate-400 dark:text-slate-500">Loading…</span>}
          {loadError && <span className="text-[11px] text-red-500 dark:text-red-400">{loadError}</span>}
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 py-3">
          {!rawData.length && (
            <div className="text-center py-20 text-slate-400 dark:text-slate-500">
              <p className="text-lg mb-2">
                {raceOptions.length ? "Select a race above to load results" : "Add races to public/races/ and manifest.json"}
              </p>
            </div>
          )}

          {tab === "results" && rawData.length > 0 && (
            <div>
              <Filters
                regions={REGIONS}
                teams={teams}
                cats={cats}
                races={races}
                fSchool={fSchool}
                fR={fR}
                fT={fT}
                fC={fC}
                fRace={fRace}
                hl={hl}
                onFSchool={setFSchool}
                onFR={setFR}
                onFT={setFT}
                onFC={setFC}
                onFRace={setFRace}
                onHl={setHl}
              />
              <ResultsTab
                filtered={filtered}
                threshold={threshold}
                hl={hl}
                scoringIds={scoringIds}
                onToggleCat={toggleCat}
                onGoScenario={() => setTab("scenario")}
              />
            </div>
          )}

          {tab === "teams" && (
            <TeamsTab
              tScores={tScores}
              fR={fR}
              hl={hl}
              teams={hsTeams}
              maxRiders={maxRiders}
              maxPerGender={maxPerGender}
              onFR={setFR}
              onHl={setHl}
              onSelectTeam={(team) => {
                setHl(team);
                setOpTarget(team);
              }}
            />
          )}

          {tab === "planner" && (
            <PlannerTab
              teams={hsTeams}
              tScores={tScores}
              opTarget={opTarget}
              opRival={opRival}
              opThreshold={opThreshold}
              selectedMoves={selectedMoves}
              opResults={opResults}
              selectedSwing={selectedSwing}
              scoringIds={scoringIds}
              setOpTarget={setOpTarget}
              setOpRival={setOpRival}
              setOpThreshold={setOpThreshold}
              setHl={setHl}
              setSelectedMoves={setSelectedMoves}
              sendToScenario={sendToScenario}
              generateReport={generateReport}
              toggleMove={toggleMove}
            />
          )}

          {tab === "scenario" && (
            <div>
              <Filters
                regions={REGIONS}
                teams={teams}
                cats={cats}
                races={races}
                fSchool={fSchool}
                fR={fR}
                fT={fT}
                fC={fC}
                fRace={fRace}
                hl={hl}
                onFSchool={setFSchool}
                onFR={setFR}
                onFT={setFT}
                onFC={setFC}
                onFRace={setFRace}
                onHl={setHl}
              />
              <ScenarioTab
                cats={cats}
                sCats={sCats}
                sData={sData}
                sRegion={sRegion}
                tScores={tScores}
                origScores={origScores}
                origMap={origMap}
                currentChanges={currentChanges}
                rawData={rawData}
                threshold={threshold}
                hl={hl}
                teams={teams}
                scoringIds={scoringIds}
                lastSentCategories={lastSentCategories}
                onToggleCat={toggleCat}
                moveRider={moveRider}
                resetScenario={resetScenario}
                setSRegion={setSRegion}
                setHl={setHl}
                generateReport={generateReport}
              />
            </div>
          )}

          {tab === "analysis" && rawData.length > 0 && (
            <div>
              <Filters
                regions={REGIONS}
                teams={teams}
                cats={cats}
                races={races}
                fSchool={fSchool}
                fR={fR}
                fT={fT}
                fC={fC}
                fRace={fRace}
                hl={hl}
                onFSchool={setFSchool}
                onFR={setFR}
                onFT={setFT}
                onFC={setFC}
                onFRace={setFRace}
                onHl={setHl}
              />
              <AnalysisTab filtered={filtered} threshold={threshold} hl={hl} scoringIds={scoringIds} />
            </div>
          )}

          {tab === "report" && (
            <ReportTab reportText={reportText} onCopy={reportCopy} onDownload={reportDownload} />
          )}

          {tab === "cumulative-teams" && races.length > 1 && (
            <CumulativeTeamsTab
              rows={cumulativeTeamRows}
              raceOptions={raceOptions}
              fR={fR}
              hl={hl}
              teams={hsTeams}
              onFR={setFR}
              onHl={setHl}
            />
          )}

          {tab === "placement" && races.length > 1 && (
            <PlacementOverTimeTab
              filtered={filtered}
              races={races}
              raceOptions={raceOptions}
              fR={fR}
              fT={fT}
              fC={fC}
              fRace={fRace}
              fSchool={fSchool}
              teams={teams}
              cats={cats}
              hl={hl}
              onFR={setFR}
              onFT={setFT}
              onFC={setFC}
              onFRace={setFRace}
              onFSchool={setFSchool}
              onHl={setHl}
            />
          )}
        </div>
      </div>
    </div>
  );
}
