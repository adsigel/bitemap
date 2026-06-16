import type { Point } from "./types";
import { computeClusters } from "./cluster";

const MIN_BITES_INTERESTING = 20;
const CONTRAST_WEIGHT = 0.25;

// Same cone-kernel KDE as draw-heatmap.ts, on a small fixed grid.
// We only need peak vs. median, so absolute scale doesn't matter.
function computeDensityStats(bites: Point[], count: number): { peakDensity: number; medianDensity: number } {
  const G = 150;
  const density = new Float32Array(G * G);
  const baseRadius = G * 0.13;
  const gridBlobR = baseRadius * Math.max(0.8, 1 - Math.log10(Math.max(1, count)) * 0.07);

  for (const b of bites) {
    const cx = b.x * G;
    const cy = b.y * G;
    const x0 = Math.max(0, Math.floor(cx - gridBlobR));
    const x1 = Math.min(G - 1, Math.ceil(cx + gridBlobR));
    const y0 = Math.max(0, Math.floor(cy - gridBlobR));
    const y1 = Math.min(G - 1, Math.ceil(cy + gridBlobR));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const dx = gx - cx, dy = gy - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / gridBlobR;
        if (d <= 1) density[gy * G + gx] += 1 - d;
      }
    }
  }

  let peakDensity = 0;
  const nonzero: number[] = [];
  for (let i = 0; i < density.length; i++) {
    if (density[i] > 0) {
      nonzero.push(density[i]);
      if (density[i] > peakDensity) peakDensity = density[i];
    }
  }
  nonzero.sort((a, b) => a - b);
  const medianDensity = nonzero.length > 0 ? nonzero[Math.floor(nonzero.length / 2)] : 0;
  return { peakDensity, medianDensity };
}

export function interestingScore(bites: Point[]): number {
  const totalBites = bites.length;
  if (totalBites < MIN_BITES_INTERESTING) return 0;

  const clusters = computeClusters(bites);
  if (clusters.length === 0) return 0;

  // Contestedness: how balanced the bite split is across clusters (0..1).
  // Uses normalized Shannon entropy so a 50/50 two-cluster split scores 1.
  const sizes = clusters.map(c => c.length);
  const sum = sizes.reduce((a, b) => a + b, 0) || 1;
  const p = sizes.map(s => s / sum).filter(x => x > 0);
  let entropy = 0;
  for (const pi of p) entropy += -pi * Math.log(pi);
  const balance = p.length > 1 ? entropy / Math.log(p.length) : 0;
  const clusterFactor = Math.min(p.length, 4) / 4;
  const contested = balance * clusterFactor;

  // Contrast: how sharply peaks stand out relative to the median density (0..1).
  const { peakDensity, medianDensity } = computeDensityStats(bites, totalBites);
  let contrast = 0;
  if (peakDensity > 0 && medianDensity > 0) {
    contrast = Math.min((peakDensity / medianDensity) / 8, 1);
  }

  return contested * (1 - CONTRAST_WEIGHT) + contrast * CONTRAST_WEIGHT;
}
