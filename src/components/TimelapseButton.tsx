"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";

interface Props {
  sandwichId: string;
  title: string;
  imageUrl: string;
  biteCount: number;
  className?: string;
}

const W = 1200;
const H = 900;
const DOT_RADIUS = 12;
const DOT_FILL = "rgba(249, 115, 22, 0.85)";
const DOT_STROKE = "rgba(255, 255, 255, 0.7)";

function drawBase(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const canvasAspect = W / H;
  let drawW: number, drawH: number, offsetX: number, offsetY: number;
  if (imgAspect > canvasAspect) {
    drawH = H; drawW = H * imgAspect;
    offsetX = (W - drawW) / 2; offsetY = 0;
  } else {
    drawW = W; drawH = W / imgAspect;
    offsetX = 0; offsetY = (H - drawH) / 2;
  }
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

function drawDots(ctx: CanvasRenderingContext2D, bites: { x: number; y: number }[]) {
  for (const b of bites) {
    ctx.beginPath();
    ctx.arc(b.x * W, b.y * H, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = DOT_FILL;
    ctx.fill();
    ctx.strokeStyle = DOT_STROKE;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function TimelapseButton({ sandwichId, title, imageUrl, biteCount, className }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const supabase = createClient();

  async function handleExport() {
    if (status) return;
    try {
      setStatus("Fetching bites…");
      const { data: bites } = await supabase
        .from("bites")
        .select("x, y")
        .eq("sandwich_id", sandwichId)
        .order("created_at", { ascending: true });

      if (!bites?.length) { setStatus(null); return; }

      setStatus("Loading image…");
      const imageBlob = await fetch(`/api/image-proxy?url=${encodeURIComponent(imageUrl)}`).then(r => r.blob());
      const blobUrl = URL.createObjectURL(imageBlob);
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = blobUrl;
      });
      URL.revokeObjectURL(blobUrl);

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;

      const FRAME_RATE = 30;
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";

      const stream = canvas.captureStream(FRAME_RATE);
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });

      recorder.start();

      // Hold on bare sandwich for 1s before bites appear
      drawBase(ctx, img);
      await new Promise(r => setTimeout(r, 1000));

      // Target ~60 frames; each frame adds the next batch of dots incrementally.
      // We never clear the canvas — dots accumulate on top of each other,
      // making popular areas visibly denser.
      const bitesPerFrame = Math.max(1, Math.ceil(bites.length / 60));
      const totalFrames = Math.ceil(bites.length / bitesPerFrame);

      for (let i = 0; i < totalFrames; i++) {
        setStatus(`Rendering… ${Math.round(((i + 1) / totalFrames) * 100)}%`);
        const batch = bites.slice(i * bitesPerFrame, (i + 1) * bitesPerFrame);
        drawDots(ctx, batch);
        await new Promise(r => setTimeout(r, 1000 / FRAME_RATE));
      }

      // Hold on final frame for 2s
      await new Promise(r => setTimeout(r, 2000));
      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, "-")}-timelapse.webm`;
      a.click();
      URL.revokeObjectURL(url);
      track("Timelapse Exported", { sandwich_id: sandwichId, bite_count: biteCount, source: "creator_card" });
    } finally {
      setStatus(null);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={!!status}
      className={`rounded-lg border border-stone-200 bg-white px-4 py-2 text-center text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 ${className ?? "block w-full"}`}
    >
      {status ?? "Export timelapse"}
    </button>
  );
}
