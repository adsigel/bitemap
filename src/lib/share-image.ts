import type { Point } from "./types";
import { drawHeatmap } from "./draw-heatmap";
import { ordinal } from "./percentile";

export async function generateShareImage(
  imageUrl: string,
  bites: Point[],
  userPoint: Point,
  title: string,
  percentile: number | null
): Promise<Blob> {
  const W = 1200;
  const HEADER_H = 180;
  const IMG_H = 900;
  const FOOTER_H = 240;
  const TOTAL_H = HEADER_H + IMG_H + FOOTER_H;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = TOTAL_H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, TOTAL_H);

  const PAD = 44;

  // === HEADER ===
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  // "🥪 Bitemap" branding row
  ctx.font = "500 30px system-ui, sans-serif";
  ctx.fillStyle = "#78716c";
  ctx.fillText("🥪  Bitemap", PAD, 60);

  // Sandwich title — scale down if too wide
  let titleSize = 56;
  ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  while (ctx.measureText(title).width > W - PAD * 2 && titleSize > 28) {
    titleSize -= 2;
    ctx.font = `bold ${titleSize}px system-ui, sans-serif`;
  }
  ctx.fillStyle = "#1c1917";
  ctx.fillText(title, PAD, 132);

  // Divider
  ctx.strokeStyle = "#e7e5e4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H);
  ctx.lineTo(W, HEADER_H);
  ctx.stroke();

  // === IMAGE ===
  // Fetch via proxy to avoid canvas CORS taint
  const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
  const imageBlob = await fetch(proxyUrl).then((r) => r.blob());
  // createImageBitmap with imageOrientation respects EXIF rotation,
  // unlike drawImage(img) which uses raw pixel data and ignores it.
  const imageBitmap = await createImageBitmap(imageBlob, { imageOrientation: "from-image" });

  // Cover-fit into the image band
  const imgAspect = imageBitmap.width / imageBitmap.height;
  const canvasAspect = W / IMG_H;
  let drawW: number, drawH: number, offsetX: number, offsetY: number;
  if (imgAspect > canvasAspect) {
    drawH = IMG_H; drawW = IMG_H * imgAspect;
    offsetX = (W - drawW) / 2; offsetY = HEADER_H;
  } else {
    drawW = W; drawH = W / imgAspect;
    offsetX = 0; offsetY = HEADER_H + (IMG_H - drawH) / 2;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, HEADER_H, W, IMG_H);
  ctx.clip();
  ctx.drawImage(imageBitmap, offsetX, offsetY, drawW, drawH);
  ctx.restore();

  // Heatmap — draw to a temp canvas, then blit at HEADER_H offset
  const heatmapCanvas = document.createElement("canvas");
  heatmapCanvas.width = W;
  heatmapCanvas.height = IMG_H;
  drawHeatmap(heatmapCanvas, bites, W, IMG_H);
  ctx.drawImage(heatmapCanvas, 0, HEADER_H);

  // User's bite marker
  const px = userPoint.x * W;
  const py = HEADER_H + userPoint.y * IMG_H;
  ctx.beginPath();
  ctx.arc(px, py, 36, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,80,0,0.2)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, py, 16, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,70,0,0.9)";
  ctx.fill();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // "YOU" label — above the marker by default, flipped below if too close to top edge
  const YOU_TEXT = "YOU";
  ctx.font = "bold 24px system-ui, sans-serif";
  const youTextW = ctx.measureText(YOU_TEXT).width;
  const youPillW = youTextW + 24;
  const youPillH = 38;
  const markerR = 36;
  const youGap = 12;

  const aboveY = py - markerR - youGap - youPillH;
  const belowY = py + markerR + youGap;
  const youPillY = aboveY >= HEADER_H + 8 ? aboveY : belowY;
  const youPillX = Math.max(8, Math.min(W - youPillW - 8, px - youPillW / 2));

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(youPillX, youPillY, youPillW, youPillH, 8);
  ctx.fill();

  ctx.fillStyle = "#1c1917";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(YOU_TEXT, youPillX + 12, youPillY + youPillH / 2);

  // Watermark — white text with drop shadow
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("bitemap.food", W - 18, HEADER_H + IMG_H - 14);
  ctx.shadowColor = "transparent";

  // === FOOTER ===
  const FY = HEADER_H + IMG_H;

  // Divider
  ctx.strokeStyle = "#e7e5e4";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, FY);
  ctx.lineTo(W, FY);
  ctx.stroke();

  const n = bites.length;
  let label: string;
  let subtext: string;

  if (percentile === null) {
    label = "You took a bite";
    subtext = "See where everyone else bites.";
  } else if (n < 15) {
    label = `Biter #${n}`;
    subtext = `You're the ${ordinal(n)} person to bite this sando. Share it with friends to fill in the map.`;
  } else if (percentile >= 80) {
    label = "You went rogue";
    const tenths = Math.round(percentile / 10);
    subtext = tenths >= 10
      ? "Almost nobody bites where you did — you're a true original."
      : `You bit farther from the pack than about ${tenths} in 10 people.`;
  } else if (percentile <= 30) {
    label = "Right in the pack";
    subtext = "You bit right where most people do. Great minds, same sandwich.";
  } else {
    label = "A touch off-center";
    subtext = "You bit a little off from the crowd, but nothing wild.";
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.font = "bold 54px system-ui, sans-serif";
  ctx.fillStyle = "#1c1917";
  ctx.fillText(label, PAD, FY + 72);

  ctx.font = "28px system-ui, sans-serif";
  ctx.fillStyle = "#78716c";
  ctx.fillText(subtext, PAD, FY + 142);

  // CTA
  const CTA_Y = FY + 205;
  ctx.font = "500 28px system-ui, sans-serif";
  ctx.fillStyle = "#f97316";
  ctx.textAlign = "left";
  ctx.fillText("Where would you bite this? →", PAD, CTA_Y);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      "image/jpeg",
      0.92
    )
  );
}
