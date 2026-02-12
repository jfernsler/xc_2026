import type { Rider } from "../types";

interface ScoringDotProps {
  r: Rider;
  isScoring: boolean;
}

export function ScoringDot({ r: _r, isScoring }: ScoringDotProps) {
  return isScoring ? (
    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-0.5" title="Scoring" />
  ) : null;
}
