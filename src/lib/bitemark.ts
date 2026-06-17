// Bitemark = a user's average bite-uniqueness percentile, snapshotted per
// bite at placement time (see BiteCanvas.tsx) rather than recomputed live --
// so it reflects what the crowd looked like when they bit, not now.
export const MIN_BITES_FOR_BITEMARK = 5;

export type Persona = "Maverick" | "Free Spirit" | "Middle of the Pack" | "Regular" | "Loyalist";

const PERSONA_COPY: Record<Persona, string> = {
  Maverick: "Your bites land where few others go.",
  "Free Spirit": "You tend to wander off the beaten path.",
  "Middle of the Pack": "You bite right where most people do.",
  Regular: "You gravitate toward the popular spots.",
  Loyalist: "You always bite exactly where the crowd does.",
};

// Thresholds are on the same 0-100 scale as computePercentile.
function personaForScore(score: number): Persona {
  if (score >= 75) return "Maverick";
  if (score >= 55) return "Free Spirit";
  if (score >= 45) return "Middle of the Pack";
  if (score >= 25) return "Regular";
  return "Loyalist";
}

export type Bitemark =
  | { locked: true; remaining: number }
  | { locked: false; score: number; persona: Persona; subhead: string };

export function computeBitemark(percentiles: number[]): Bitemark {
  if (percentiles.length < MIN_BITES_FOR_BITEMARK) {
    return { locked: true, remaining: MIN_BITES_FOR_BITEMARK - percentiles.length };
  }
  const score = Math.round(percentiles.reduce((a, b) => a + b, 0) / percentiles.length);
  const persona = personaForScore(score);
  return { locked: false, score, persona, subhead: PERSONA_COPY[persona] };
}
