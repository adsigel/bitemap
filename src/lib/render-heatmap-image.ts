import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { drawHeatmap, type CanvasLike } from "./draw-heatmap";
import type { Point } from "./types";

// Matches the 4:3 aspect rendered everywhere else (BiteCanvas, export-heatmap),
// scaled down -- this only needs to look good inline in an email, not at
// full resolution.
const WIDTH = 960;
const HEIGHT = 720;

function napiCreateCanvas(w: number, h: number): CanvasLike {
  return createCanvas(w, h) as unknown as CanvasLike;
}

// object-cover equivalent: image is centered and clipped to fill the canvas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function drawCover(ctx: any, img: Image, width: number, height: number) {
  const imgAspect = img.width / img.height;
  const targetAspect = width / height;
  let drawW: number, drawH: number, offsetX: number, offsetY: number;
  if (imgAspect > targetAspect) {
    drawH = height; drawW = height * imgAspect;
    offsetX = (width - drawW) / 2; offsetY = 0;
  } else {
    drawW = width; drawH = width / imgAspect;
    offsetX = 0; offsetY = (height - drawH) / 2;
  }
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

// Server-side equivalent of exportHeatmapSnapshot (export-heatmap.ts) for use
// in places without a browser/DOM, e.g. rendering an inline image for emails.
export async function renderHeatmapImage(imageUrl: string, bites: Point[]): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to fetch sandwich image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const img = await loadImage(buffer);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  drawCover(ctx, img, WIDTH, HEIGHT);
  drawHeatmap(canvas as unknown as CanvasLike, bites, WIDTH, HEIGHT, napiCreateCanvas);

  return canvas.toBuffer("image/png");
}
