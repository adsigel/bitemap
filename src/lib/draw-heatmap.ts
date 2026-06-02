import type { Point } from "./types";

export function drawHeatmap(
  canvas: HTMLCanvasElement,
  bites: Point[],
  width: number,
  height: number
): void {
  if (bites.length === 0) return;
  const ctx = canvas.getContext("2d")!;
  const radius = Math.min(width, height) * 0.13;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  bites.forEach((b) => {
    const px = b.x * width;
    const py = b.y * height;
    const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
    g.addColorStop(0, "rgba(255,80,0,0.55)");
    g.addColorStop(0.4, "rgba(255,120,0,0.25)");
    g.addColorStop(1, "rgba(255,80,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalCompositeOperation = "source-over";
  bites.forEach((b) => {
    const px = b.x * width;
    const py = b.y * height;
    ctx.fillStyle = "rgba(255,60,0,0.75)";
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.restore();
}
