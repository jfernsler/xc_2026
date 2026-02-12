/** Parsed row from race CSV */
export interface Rider {
  id: string;
  race: number;
  grade: string;
  category: string;
  categoryRaw: string;
  gender: "boys" | "girls";
  place: number;
  number: string;
  name: string;
  team: string;
  teamUpper: string;
  region: string;
  lapsCompleted: string;
  lap1: number | null;
  lap2: number | null;
  lap3: number | null;
  totalTime: number | null;
  penalty: string;
}

/** Rider with scenario overrides (reordered places) */
export interface ScenarioRider extends Rider {
  scenarioPlace: number;
  originalPlace: number;
  originalPoints: number;
  scenarioPoints: number;
}

/** Team standings entry */
export interface TeamScore {
  team: string;
  region: string;
  total: number;
  roster: Array<Rider & { pts: number; effPlace: number }>;
  bc: number;
  gc: number;
  riderCount: number;
  rosterIds: Set<string>;
}

/** Single overtake opportunity */
export interface OvertakeMove {
  type: "advance" | "overtake_rival";
  cat: string;
  rider: Rider;
  target: Rider;
  posFrom: number;
  posTo: number;
  timeNeeded: number;
  gain: number;
  rivalLoss: number;
  netSwing: number;
  efficiency: number;
  withinThreshold: boolean;
  team: string;
  positions: number;
}

/** Result of overtake analysis */
export interface OvertakeResult {
  gap: number;
  moves: OvertakeMove[];
  tp: number;
  rp2: number;
}

/** Summary of a scenario place change */
export interface ScenarioChange {
  cat: string;
  name: string;
  team: string;
  from: number;
  to: number;
  delta: number;
  makeup: number | null;
}
