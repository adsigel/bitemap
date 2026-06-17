import { drawHeatmap } from "./draw-heatmap";
import type { Point } from "./types";

// Matches the 4:3 aspect rendered on the sandwich page (BiteCanvas).
const EXPORT_WIDTH = 1600;
const EXPORT_HEIGHT = 1200;

// object-cover equivalent: image is centered and clipped to fill the canvas.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
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

// Routed through /api/image-proxy (same as TimelapseButton) so the loaded
// image is same-origin -- a direct cross-origin load risks tainting the
// canvas and breaking toBlob() export.
export async function exportHeatmapSnapshot(imageUrl: string, bites: Point[]): Promise<Blob> {
  const imageBlob = await fetch(`/api/image-proxy?url=${encodeURIComponent(imageUrl)}`).then((r) => r.blob());
  const blobUrl = URL.createObjectURL(imageBlob);
  const img = new window.Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = blobUrl;
  });
  URL.revokeObjectURL(blobUrl);

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  drawCover(ctx, img, EXPORT_WIDTH, EXPORT_HEIGHT);
  drawHeatmap(canvas, bites, EXPORT_WIDTH, EXPORT_HEIGHT);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))), "image/jpeg", 0.92)
  );
}
