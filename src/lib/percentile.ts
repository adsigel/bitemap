import type { Point } from "./types";

// Radius for neighbour counting — 10% of the normalised image dimension.
// Tune upward if clusters feel too tight, downward if everything reads as "in the pack".
const DENSITY_RADIUS = 0.10;

// Ranks the user by local density rather than distance from a global centre.
// High return value = few neighbours nearby = maverick.
// Low return value  = many neighbours nearby = in the pack.
export function computePercentile(myPoint: Point, otherBites: Point[]): number {
  if (otherBites.length === 0) return 50;

  const countNeighbours = (p: Point, pool: Point[]) =>
    pool.filter(b => Math.hypot(b.x - p.x, b.y - p.y) < DENSITY_RADIUS).length;

  const myNeighbours = countNeighbours(myPoint, otherBites);

  // Each other bite's neighbour count, excluding itself from its own pool
  const otherCounts = otherBites.map((b, i) =>
    countNeighbours(b, otherBites.filter((_, j) => j !== i))
  );

  // Fraction of others with MORE neighbours than the user → high = maverick
  const moreDense = otherCounts.filter(n => n > myNeighbours).length;
  return Math.round((moreDense / otherCounts.length) * 100);
}

export function outlierLabel(percentile: number): string {
  if (percentile > 66) return "Such a unique spot for a bite! 🦄";
  if (percentile > 33) return "You've drawn first bite! 🥪";
  return "That's a popular bite spot 🎯";
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
