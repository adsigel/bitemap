import type { Point } from "./types";

export interface ClusterCopy {
  heading: string;
  body: string;
  shareText: string;
}

const MIN_PTS = 3;
const MIN_BITES = 15;

// Shrinks as bite count grows so dense sandwiches get tighter clusters.
// At n=100 → 0.08; n=200 → 0.057; n=400+ → 0.05 (floor).
function adaptiveEpsilon(n: number): number {
  return Math.max(0.05, 0.8 / Math.sqrt(n));
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function centroid(pts: Point[]): Point {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

// 5th/95th percentile bounding box of all bites — maps absolute image coords
// to sandwich-relative coords so descriptors reflect position on the sandwich,
// not position in the frame. Handles sandwiches that don't fill the image.
function biteBounds(pts: Point[]) {
  const xs = pts.map(p => p.x).sort((a, b) => a - b);
  const ys = pts.map(p => p.y).sort((a, b) => a - b);
  const lo = Math.floor(pts.length * 0.05);
  const hi = Math.min(pts.length - 1, Math.ceil(pts.length * 0.95));
  return { x0: xs[lo], x1: xs[hi], y0: ys[lo], y1: ys[hi] };
}

function toRelative(c: Point, bb: ReturnType<typeof biteBounds>): Point {
  const rx = Math.max(0.1, bb.x1 - bb.x0);
  const ry = Math.max(0.1, bb.y1 - bb.y0);
  return {
    x: Math.max(0, Math.min(1, (c.x - bb.x0) / rx)),
    y: Math.max(0, Math.min(1, (c.y - bb.y0) / ry)),
  };
}

function spatialDescriptor(cx: number, cy: number): string {
  const h = cx < 0.35 ? "left" : cx > 0.65 ? "right" : "center";
  const v = cy < 0.35 ? "top" : cy > 0.65 ? "bottom" : "middle";
  if (h === "center" && v === "middle") return "the middle";
  if (h === "center") return `the ${v}`;
  if (v === "middle") return `the ${h} side`;
  return `the ${v}-${h} corner`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Rounds to the nearest 5% and never says "100%".
function fmtPct(count: number, total: number): string {
  const pct = count / total;
  if (pct >= 0.95) return "nearly everyone";
  const rounded = Math.round(pct * 100 / 5) * 5;
  return `about ${rounded}%`;
}

// Like fmtPct but always includes "of biters" for use in share text phrases.
function fmtGroup(count: number, total: number): string {
  const pct = count / total;
  if (pct >= 0.95) return "nearly everyone";
  const rounded = Math.round(pct * 100 / 5) * 5;
  return `about ${rounded}% of biters`;
}

function dbscan(points: Point[], epsilon: number): Point[][] {
  const n = points.length;
  const labels = new Array<number>(n).fill(-2); // -2 unvisited, -1 noise, ≥0 cluster
  let clusterId = 0;

  function getNeighbors(i: number): number[] {
    const result: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j !== i && dist(points[i], points[j]) <= epsilon) result.push(j);
    }
    return result;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -2) continue;
    const nb = getNeighbors(i);
    if (nb.length < MIN_PTS) { labels[i] = -1; continue; }
    labels[i] = clusterId;
    const seed = new Set(nb);
    for (const j of seed) {
      if (labels[j] === -1) labels[j] = clusterId; // border point
      if (labels[j] !== -2) continue;
      labels[j] = clusterId;
      const jnb = getNeighbors(j);
      if (jnb.length >= MIN_PTS) jnb.forEach(x => seed.add(x));
    }
    clusterId++;
  }

  const clusters: Point[][] = Array.from({ length: clusterId }, () => []);
  for (let i = 0; i < n; i++) {
    if (labels[i] >= 0) clusters[labels[i]].push(points[i]);
  }
  return clusters;
}

// allBites must include the user's point so it can be assigned to a cluster.
export function getClusterCopy(userPoint: Point, allBites: Point[], title: string): ClusterCopy | null {
  if (allBites.length < MIN_BITES) return null;

  const epsilon = adaptiveEpsilon(allBites.length);
  const clusters = dbscan(allBites, epsilon);
  if (clusters.length === 0) return null;

  const total = allBites.length;
  const sorted = [...clusters].sort((a, b) => b.length - a.length);
  const bb = biteBounds(allBites);

  // Spatial descriptor for a cluster centroid — used in body copy to reference other groups.
  const clusterDesc = (pts: Point[]) => {
    const rel = toRelative(centroid(pts), bb);
    return spatialDescriptor(rel.x, rel.y);
  };

  // Heading always reflects where the USER bit, not the cluster's centroid.
  // This avoids labeling someone "top-left biter" when they bit in the middle
  // just because they're a border point of a top-left cluster.
  const userRel = toRelative(userPoint, bb);
  const userDescriptor = spatialDescriptor(userRel.x, userRel.y);
  const heading = `${capitalize(userDescriptor)} biter`;
  const noun = userDescriptor.replace(/^the /, "") + " biter";

  const userCluster = clusters.find(c =>
    c.some(p => Math.abs(p.x - userPoint.x) < 1e-9 && Math.abs(p.y - userPoint.y) < 1e-9)
  );

  if (!userCluster) {
    const largest = sorted[0];
    return {
      heading,
      body: `You went your own way — ${fmtPct(largest.length, total)} of biters clustered around ${clusterDesc(largest)}.`,
      shareText: `I went my own way on this ${title}. ${capitalize(fmtGroup(largest.length, total))} clustered around ${clusterDesc(largest)}.`,
    };
  }

  const rank = sorted.indexOf(userCluster);

  if (clusters.length === 1) {
    return {
      heading,
      body: `${capitalize(fmtPct(userCluster.length, total))} went here — this sandwich has a clear favorite spot.`,
      shareText: `I'm a ${noun} on this ${title}. ${capitalize(fmtGroup(userCluster.length, total))} went here.`,
    };
  }

  if (rank === 0) {
    const second = sorted[1];
    return {
      heading,
      body: `You're with the biggest camp — ${fmtPct(userCluster.length, total)} of biters. The next group (${fmtPct(second.length, total)}) went for ${clusterDesc(second)}.`,
      shareText: `I'm a ${noun} on this ${title}. ${capitalize(fmtGroup(userCluster.length, total))} went here.`,
    };
  }

  return {
    heading,
    body: `${capitalize(fmtPct(userCluster.length, total))} of biters came here. The biggest group (${fmtPct(sorted[0].length, total)}) went for ${clusterDesc(sorted[0])}.`,
    shareText: `I'm a ${noun} on this ${title}. Only ${fmtGroup(userCluster.length, total)} came here.`,
  };
}
