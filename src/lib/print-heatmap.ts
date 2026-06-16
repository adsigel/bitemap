"use client";

import { contours } from "d3-contour";

export type PrintTheme = "dark" | "light";

interface Bite {
  x: number;
  y: number;
}

interface Options {
  bites: Bite[];
  imageUrl: string;
  title: string;
  biteCount: number;
  theme: PrintTheme;
}

const SIZE = 3000;
const LOGO_MAX_W = 320;
const CAPTION_MARGIN = 100;

const PALETTES: Record<PrintTheme, { bg: string; bands: string[]; caption: string; captionSub: string }> = {
  dark: {
    bg: "#0d0803",
    bands: [
      "#1f0d05",
      "#3d1a08",
      "#6b300f",
      "#a84c1a",
      "#d96428",
      "#f08040",
      "#f5b070",
    ],
    caption: "#e8d5c0",
    captionSub: "#9a7a60",
  },
  light: {
    bg: "#faf7f4",
    bands: [
      "#f0e4d8",
      "#dfc4a8",
      "#c89060",
      "#a85c28",
      "#7a3810",
      "#521e06",
      "#2e0e02",
    ],
    caption: "#1a0e06",
    captionSub: "#8a6a4a",
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

function drawSilhouette(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  theme: PrintTheme
) {
  const opacity = theme === "dark" ? 0.13 : 0.08;
  const imgAspect = img.naturalWidth / img.naturalHeight;
  let drawW: number, drawH: number, offsetX: number, offsetY: number;
  if (imgAspect > 1) {
    drawH = SIZE;
    drawW = SIZE * imgAspect;
    offsetX = (SIZE - drawW) / 2;
    offsetY = 0;
  } else {
    drawW = SIZE;
    drawH = SIZE / imgAspect;
    offsetX = 0;
    offsetY = (SIZE - drawH) / 2;
  }
  const gray = toGrayscaleCanvas(img);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(gray, offsetX, offsetY, drawW, drawH);
  ctx.restore();
}

// Mirror the in-app density computation (cone kernel, adaptive radius, log scale)
// so the print contours tell the same story as the in-app heatmap.
function computeDensityGrid(
  bites: Bite[],
  biteCount: number
): { density: Float32Array; gw: number; gh: number } {
  const gw = Math.ceil(SIZE / 4);
  const gh = Math.ceil(SIZE / 4);
  const density = new Float32Array(gw * gh);

  const baseRadius = SIZE * 0.13;
  const blobRadius =
    baseRadius * Math.max(0.8, 1 - Math.log10(Math.max(1, biteCount)) * 0.07);
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

  // Log-scale thresholds match the in-app log1p normalization
  const logMax = Math.log1p(maxDensity);
  const n = palette.bands.length;
  const thresholds = palette.bands.map((_, i) => logMax * (i + 1) / (n + 1));

  const logDensity = Array.from(density).map((v) => Math.log1p(v));
  const contourGen = contours().size([gw, gh]).thresholds(thresholds);
  const contourPaths = contourGen(logDensity);

  const scaleX = SIZE / gw;
  const scaleY = SIZE / gh;

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
  logoUrl: string
) {
  const palette = PALETTES[theme];
  const captionText = `where ${formatCount(biteCount)} ${biteCount === 1 ? "person" : "people"} bit a ${title}`;

  // Main caption text
  const fontSize = 52;
  ctx.font = `300 ${fontSize}px -apple-system, 'Helvetica Neue', sans-serif`;
  ctx.fillStyle = palette.caption;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  const maxWidth = SIZE - CAPTION_MARGIN * 4;
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

  const lineHeight = fontSize * 1.45;
  const textBlockH = lines.length * lineHeight;

  // Load logo
  const logo = await loadImage(logoUrl);
  const logoScale = Math.min(LOGO_MAX_W / logo.naturalWidth, 1);
  const logoW = logo.naturalWidth * logoScale;
  const logoH = logo.naturalHeight * logoScale;

  // Layout: text block + gap + logo, all centered vertically in bottom band
  const gap = 36;
  const totalH = textBlockH + gap + logoH;
  const blockTop = SIZE - CAPTION_MARGIN - totalH;

  // Draw text lines
  lines.forEach((l, i) => {
    ctx.fillText(l, SIZE / 2, blockTop + i * lineHeight + fontSize);
  });

  // Draw logo
  const logoX = (SIZE - logoW) / 2;
  const logoY = blockTop + textBlockH + gap;
  ctx.drawImage(logo, logoX, logoY, logoW, logoH);
}

export async function generatePrintHeatmap(opts: Options): Promise<Blob> {
  const { bites, imageUrl, title, biteCount, theme } = opts;
  const palette = PALETTES[theme];

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Sandwich silhouette
  const sandwichImg = await loadImage(
    `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
  );
  drawSilhouette(ctx, sandwichImg, theme);

  // Contour bands
  drawContours(ctx, bites, biteCount, theme);

  // Caption + logo
  const logoPath = theme === "dark" ? "/bitemap-dark.png" : "/bitemap.png";
  await drawCaption(ctx, title, biteCount, theme, logoPath);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}
