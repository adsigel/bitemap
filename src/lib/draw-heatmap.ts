import type { Point } from "./types";

// Loose enough to accept both HTMLCanvasElement and @napi-rs/canvas's Canvas
// (the server-side renderer used for email images) without fighting their
// incompatible lib.dom vs napi-rs type definitions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CanvasLike = { width: number; height: number; getContext(contextId: "2d"): any };

function defaultCreateCanvas(w: number, h: number): CanvasLike {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function colormap(t: number): [number, number, number, number] {
  const stops = [
    { t: 0,    r: 253, g: 224, b: 71,  a: 0 },
    { t: 0.25, r: 253, g: 224, b: 71,  a: 0.35 },
    { t: 0.6,  r: 251, g: 146, b: 60,  a: 0.65 },
    { t: 1.0,  r: 239, g: 68,  b: 68,  a: 0.88 },
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const lo = stops[i - 1], hi = stops[i];
      const f = (t - lo.t) / (hi.t - lo.t);
      return [
        Math.round(lo.r + (hi.r - lo.r) * f),
        Math.round(lo.g + (hi.g - lo.g) * f),
        Math.round(lo.b + (hi.b - lo.b) * f),
        lo.a + (hi.a - lo.a) * f,
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last.r, last.g, last.b, last.a];
}

export function drawHeatmap(
  canvas: CanvasLike,
  bites: Point[],
  width: number,
  height: number,
  createCanvas: (w: number, h: number) => CanvasLike = defaultCreateCanvas
): void {
  if (bites.length === 0) return;
  const ctx = canvas.getContext("2d")!;
  const count = bites.length;

  // --- Heatmap field ---

  const baseRadius = Math.min(width, height) * 0.13;
  const blobRadius = baseRadius * Math.max(0.8, 1 - Math.log10(Math.max(1, count)) * 0.07);

  const gw = Math.ceil(width / 4);
  const gh = Math.ceil(height / 4);
  const density = new Float32Array(gw * gh);
  const gridBlobR = blobRadius / 4;

  for (const b of bites) {
    const cx = b.x * gw;
    const cy = b.y * gh;
    const x0 = Math.max(0, Math.floor(cx - gridBlobR));
    const x1 = Math.min(gw - 1, Math.ceil(cx + gridBlobR));
    const y0 = Math.max(0, Math.floor(cy - gridBlobR));
    const y1 = Math.min(gh - 1, Math.ceil(cy + gridBlobR));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const dx = gx - cx, dy = gy - cy;
        const d = Math.sqrt(dx * dx + dy * dy) / gridBlobR;
        if (d <= 1) density[gy * gw + gx] += 1 - d;
      }
    }
  }

  let maxDensity = 0;
  for (let i = 0; i < density.length; i++) {
    if (density[i] > maxDensity) maxDensity = density[i];
  }
  if (maxDensity === 0) return;

  const logMax = Math.log1p(maxDensity);

  const tmp = createCanvas(gw, gh);
  const tmpCtx = tmp.getContext("2d")!;
  const imageData = tmpCtx.createImageData(gw, gh);

  for (let i = 0; i < density.length; i++) {
    const t = Math.log1p(density[i]) / logMax;
    if (t > 0.01) {
      const [r, g, b, a] = colormap(t);
      const idx = i * 4;
      imageData.data[idx]     = r;
      imageData.data[idx + 1] = g;
      imageData.data[idx + 2] = b;
      imageData.data[idx + 3] = Math.round(a * 255);
    }
  }
  tmpCtx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(tmp, 0, 0, width, height);

  // --- Dot markers ---
  //
  // Visibility is gated on two independent signals:
  //   neighborFactor — how many other bites land within a tight radius of this one.
  //     Isolated strays nearly vanish; genuine cluster members stay visible.
  //   fieldFade — suppress dots where the density field is already carrying the read.

  // Tight-radius neighbor count (O(n²), fast for current bite counts)
  const neighborR = Math.min(width, height) * 0.04;
  const neighborR2 = neighborR * neighborR;
  const neighborCounts = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const bx = bites[i].x * width;
    const by = bites[i].y * height;
    for (let j = i + 1; j < count; j++) {
      const dx = bites[j].x * width - bx;
      const dy = bites[j].y * height - by;
      if (dx * dx + dy * dy <= neighborR2) {
        neighborCounts[i]++;
        neighborCounts[j]++;
      }
    }
  }

  const NEIGHBOR_FULL  = 6;    // neighbors needed for full dot visibility
  const MIN_ALPHA      = 0.05; // floor so isolated bites aren't completely gone
  const FIELD_FADE_START = 0.45;
  const FIELD_FADE_END   = 0.65;
  const MAX_DOT_ALPHA  = 0.45;
  const dotRadius = Math.max(2, 5 / Math.pow(count, 0.1));

  ctx.save();
  for (let i = 0; i < count; i++) {
    const b = bites[i];
    const gx = Math.min(gw - 1, Math.round(b.x * gw));
    const gy = Math.min(gh - 1, Math.round(b.y * gh));
    const localT = Math.log1p(density[gy * gw + gx]) / logMax;
    if (localT >= FIELD_FADE_END) continue;

    const fieldFade = localT > FIELD_FADE_START
      ? 1 - (localT - FIELD_FADE_START) / (FIELD_FADE_END - FIELD_FADE_START)
      : 1;
    const neighborFactor = MIN_ALPHA + (1 - MIN_ALPHA) * Math.min(1, neighborCounts[i] / NEIGHBOR_FULL);
    const dotAlpha = neighborFactor * fieldFade * MAX_DOT_ALPHA;
    if (dotAlpha < 0.02) continue;

    const px = b.x * width;
    const py = b.y * height;
    ctx.fillStyle = `rgba(239,68,68,${dotAlpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${(dotAlpha * 0.8).toFixed(2)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}
