"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { Point } from "@/lib/types";
import { drawHeatmap } from "@/lib/draw-heatmap";

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
