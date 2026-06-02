"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

interface Point {
  x: number;
  y: number;
}

function drawHeatmap(canvas: HTMLCanvasElement, bites: Point[], width: number, height: number) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  if (bites.length === 0) return;

  const radius = Math.min(width, height) * 0.13;

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
}

export function StaticHeatmap({ imageUrl, bites, title }: { imageUrl: string; bites: Point[]; title?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const { width, height } = container.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    drawHeatmap(canvas, bites, width, height);
  }, [bites]);

  return (
    <div>
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl bg-stone-100 shadow-lg"
        style={{ aspectRatio: "4/3" }}
      >
        <Image
          src={imageUrl}
          alt={title ?? "Sandwich"}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 448px"
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
      {title && (
        <p className="mt-2 text-center text-sm text-stone-400">{title}</p>
      )}
    </div>
  );
}
