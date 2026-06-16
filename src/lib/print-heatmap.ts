"use client";

import { contours } from "d3-contour";

export type PrintTheme = "dark" | "light";
export type CaptionPosition = "bottom-left" | "bottom-center" | "bottom-right" | "exclude";
export type ExportSize = "social" | "small-print" | "large-print";
export type PolygonStyle = "none" | "subtle" | "alternate";

interface Bite {
  x: number;
  y: number;
}

export interface PrintOptions {
  bites: Bite[];
  imageUrl: string;
  title: string;
  biteCount: number;
  theme: PrintTheme;
  size: ExportSize;
  captionPosition: CaptionPosition;
  transparentBg: boolean;
  polygonStyle: PolygonStyle;
  biteBounds: { x: number; y: number }[] | null;
}

export const EXPORT_SIZES: Record<ExportSize, { px: number; label: string; sub: string }> = {
  "social":      { px: 2048, label: "Social",      sub: "2048px" },
  "small-print": { px: 3600, label: "Small print", sub: "3600px" },
  "large-print": { px: 7200, label: "Large print", sub: "7200px" },
};

// Always render at max resolution then downscale — never upscale a raster.
const RENDER_SIZE = 7200;

// KDE grid uses a fixed base so compute time is constant across output sizes.
// Contour paths are scaled from grid space up to RENDER_SIZE when drawing.
const KDE_BASE = 3000;

// Suppress cells below this fraction of peak density (kills low-density wisps).
const DENSITY_FLOOR = 0.05;
// Suppress cells where fewer than this many bites contributed (kills stray isolates).
const MIN_CLUSTER_BITES = 6;

// Layout constants — proportional to RENDER_SIZE so they scale correctly
// when the rendered canvas is later downscaled to smaller output sizes.
const FONT_SIZE  = Math.round(RENDER_SIZE * 0.0174); // ≈125px
const LOGO_MAX_W = Math.round(RENDER_SIZE * 0.107);  // ≈770px
const PADDING    = Math.round(RENDER_SIZE * 0.033);  // ≈240px
const LOGO_GAP   = Math.round(RENDER_SIZE * 0.012);  // ≈86px

const PALETTES: Record<PrintTheme, { bg: string; bands: string[]; caption: string; polygon: Record<"subtle" | "alternate", string> }> = {
  dark: {
    bg: "#1c1917", // stone-900
    bands: [
      "#3a2417", // dimmest, just above background
      "#7c2d12", // orange-900
      "#c2410c", // orange-700
      "#ea580c", // orange-600
      "#f97316", // orange-500 — brand
      "#fb923c", // orange-400
      "#fdba74", // orange-300 — brightest core
    ],
    caption: "#a8a29e",
    polygon: {
      subtle:    "#78716c",
      alternate: "rgba(254, 215, 170, 0.35)", // orange-200 @ 30%
    },
  },
  light: {
    bg: "#f5f5f4", // stone-100
    bands: [
      "#ffedd5", // orange-100 — faintest wisp
      "#fed7aa", // orange-200
      "#fdba74", // orange-300
      "#fb923c", // orange-400
      "#f97316", // orange-500 — brand
      "#ea580c", // orange-600
      "#c2410c", // orange-700 — hottest core
    ],
    caption: "#78716c",
    polygon: {
      subtle:    "#a8a29e",                   // stone-400
      alternate: "rgba(154, 52, 18, 0.35)",    // orange-900 @ 30%
    },
  },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function toGrayscaleCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const off = document.createElement("canvas");
  off.width = img.naturalWidth;
  off.height = img.naturalHeight;
  const offCtx = off.getContext("2d")!;
  offCtx.drawImage(img, 0, 0);
  const imageData = offCtx.getImageData(0, 0, off.width, off.height);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const luma = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i] = d[i + 1] = d[i + 2] = luma;
  }
  offCtx.putImageData(imageData, 0, 0);
  return off;
}

function drawSilhouette(ctx: CanvasRenderingContext2D, img: HTMLImageElement, theme: PrintTheme) {
  const opacity = theme === "dark" ? 0.13 : 0.08;
  const imgAspect = img.naturalWidth / img.naturalHeight;
  let drawW: number, drawH: number, offsetX: number, offsetY: number;
  if (imgAspect > 1) {
    drawH = RENDER_SIZE; drawW = RENDER_SIZE * imgAspect;
    offsetX = (RENDER_SIZE - drawW) / 2; offsetY = 0;
  } else {
    drawW = RENDER_SIZE; drawH = RENDER_SIZE / imgAspect;
    offsetX = 0; offsetY = (RENDER_SIZE - drawH) / 2;
  }
  const gray = toGrayscaleCanvas(img);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(gray, offsetX, offsetY, drawW, drawH);
  ctx.restore();
}

// Smooth closed polygon using Catmull-Rom → cubic Bezier conversion.
// Each vertex's control points are derived from its neighbours, producing
// a curve that passes through every point with no kinks.
function drawPolygon(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number }[],
  theme: PrintTheme,
  style: Exclude<PolygonStyle, "none">
) {
  if (bounds.length < 3) return;
  const n = bounds.length;
  const pts = bounds.map((p) => ({ x: p.x * RENDER_SIZE, y: p.y * RENDER_SIZE }));

  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    if (i === 0) ctx.moveTo(p1.x, p1.y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
  ctx.closePath();

  ctx.strokeStyle = PALETTES[theme].polygon[style];
  ctx.lineWidth = RENDER_SIZE * 0.003;
  ctx.lineJoin = "round";
  ctx.stroke();
}

// Mirror the in-app density computation (cone kernel, adaptive radius, log scale)
// so the print contours tell the same story as the in-app heatmap.
// Grid is anchored to KDE_BASE — not RENDER_SIZE — so performance is constant.
function computeDensityGrid(
  bites: Bite[],
  biteCount: number
): { density: Float32Array; gw: number; gh: number } {
  const gw = Math.ceil(KDE_BASE / 4);
  const gh = Math.ceil(KDE_BASE / 4);
  const density = new Float32Array(gw * gh);
  const contributors = new Uint16Array(gw * gh);

  const baseRadius = KDE_BASE * 0.13;
  const blobRadius = baseRadius * Math.max(0.8, 1 - Math.log10(Math.max(1, biteCount)) * 0.07);
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
        if (d <= 1) {
          density[gy * gw + gx] += 1 - d;
          contributors[gy * gw + gx]++;
        }
      }
    }
  }

  // Find peak before filtering so the floor is relative to true max density.
  let maxDensity = 0;
  for (let i = 0; i < density.length; i++) {
    if (density[i] > maxDensity) maxDensity = density[i];
  }
  const floorDensity = maxDensity * DENSITY_FLOOR;

  // Zero out cells that are too sparse or below the density floor.
  for (let i = 0; i < density.length; i++) {
    if (density[i] < floorDensity || contributors[i] < MIN_CLUSTER_BITES) {
      density[i] = 0;
    }
  }

  return { density, gw, gh };
}

function drawContours(
  ctx: CanvasRenderingContext2D,
  bites: Bite[],
  biteCount: number,
  theme: PrintTheme
) {
  if (bites.length === 0) return;
  const palette = PALETTES[theme];

  const { density, gw, gh } = computeDensityGrid(bites, biteCount);

  let maxDensity = 0;
  for (let i = 0; i < density.length; i++) {
    if (density[i] > maxDensity) maxDensity = density[i];
  }
  if (maxDensity === 0) return;

  const logMax = Math.log1p(maxDensity);
  const n = palette.bands.length;
  const thresholds = palette.bands.map((_, i) => logMax * (i + 1) / (n + 1));

  const logDensity = Array.from(density).map((v) => Math.log1p(v));
  const contourGen = contours().size([gw, gh]).thresholds(thresholds);
  const contourPaths = contourGen(logDensity);

  const scaleX = RENDER_SIZE / gw;
  const scaleY = RENDER_SIZE / gh;

  contourPaths.forEach((contour, i) => {
    const color = palette.bands[Math.min(i, palette.bands.length - 1)];
    ctx.beginPath();
    for (const ring of contour.coordinates) {
      for (const polygon of ring) {
        polygon.forEach((pt, j) => {
          const x = pt[0], y = pt[1];
          if (j === 0) ctx.moveTo(x * scaleX, y * scaleY);
          else ctx.lineTo(x * scaleX, y * scaleY);
        });
        ctx.closePath();
      }
    }
    ctx.fillStyle = color;
    ctx.fill("evenodd");
  });
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

async function drawCaption(
  ctx: CanvasRenderingContext2D,
  title: string,
  biteCount: number,
  theme: PrintTheme,
  position: Exclude<CaptionPosition, "exclude">,
  logoUrl: string
) {
  const palette = PALETTES[theme];
  const captionText = `where ${formatCount(biteCount)} ${biteCount === 1 ? "person" : "people"} bit a ${title}`;

  const align = position === "bottom-left" ? "left"
              : position === "bottom-right" ? "right"
              : "center";
  const textX = position === "bottom-left" ? PADDING
              : position === "bottom-right" ? RENDER_SIZE - PADDING
              : RENDER_SIZE / 2;

  ctx.font = `300 ${FONT_SIZE}px 'Fustat', -apple-system, 'Helvetica Neue', sans-serif`;
  ctx.fillStyle = palette.caption;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";

  // Word-wrap caption text
  const maxWidth = position === "bottom-center"
    ? RENDER_SIZE - PADDING * 4
    : RENDER_SIZE / 2 - PADDING * 2;
  const words = captionText.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineHeight = FONT_SIZE * 1.45;
  const textBlockH = lines.length * lineHeight;

  const logo = await loadImage(logoUrl);
  const logoScale = Math.min(LOGO_MAX_W / logo.naturalWidth, 1);
  const logoW = logo.naturalWidth * logoScale;
  const logoH = logo.naturalHeight * logoScale;

  const totalH = textBlockH + LOGO_GAP + logoH;
  const blockTop = RENDER_SIZE - PADDING - totalH;

  lines.forEach((l, i) => {
    ctx.fillText(l, textX, blockTop + i * lineHeight + FONT_SIZE);
  });

  const logoX = position === "bottom-left" ? PADDING
              : position === "bottom-right" ? RENDER_SIZE - PADDING - logoW
              : (RENDER_SIZE - logoW) / 2;
  ctx.drawImage(logo, logoX, blockTop + textBlockH + LOGO_GAP, logoW, logoH);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}

export async function generatePrintHeatmap(opts: PrintOptions): Promise<Blob> {
  const { bites, imageUrl, title, biteCount, theme, size, captionPosition, transparentBg, polygonStyle, biteBounds } = opts;
  const palette = PALETTES[theme];

  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = RENDER_SIZE;
  canvas.height = RENDER_SIZE;
  const ctx = canvas.getContext("2d")!;

  if (!transparentBg) {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);
  }

  if (polygonStyle !== "none" && biteBounds && biteBounds.length >= 3) {
    drawPolygon(ctx, biteBounds, theme, polygonStyle);
  }

  drawContours(ctx, bites, biteCount, theme);

  if (captionPosition !== "exclude") {
    const logoPath = theme === "dark" ? "/bitemap-dark.png" : "/bitemap.png";
    await drawCaption(ctx, title, biteCount, theme, captionPosition, logoPath);
  }

  const targetPx = EXPORT_SIZES[size].px;
  if (targetPx < RENDER_SIZE) {
    const out = document.createElement("canvas");
    out.width = targetPx;
    out.height = targetPx;
    const outCtx = out.getContext("2d")!;
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = "high";
    outCtx.drawImage(canvas, 0, 0, targetPx, targetPx);
    return canvasToBlob(out);
  }

  return canvasToBlob(canvas);
}
