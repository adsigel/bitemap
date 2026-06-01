"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Point {
  x: number;
  y: number;
}

interface Props {
  sandwichId: string;
  title: string;
  imageUrl: string;
  biteCount: number;
}

const W = 1200;
const H = 900;

function drawHeatmap(ctx: CanvasRenderingContext2D, bites: Point[]) {
  if (bites.length === 0) return;
  const radius = Math.min(W, H) * 0.13;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  bites.forEach((b) => {
    const px = b.x * W;
    const py = b.y * H;
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
    const px = b.x * W;
    const py = b.y * H;
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

function defaultBitesPerFrame(biteCount: number): number {
  // Target ~60 frames of animation
  return Math.max(1, Math.ceil(biteCount / 60));
}

export function TimelapseExporter({ sandwichId, title, imageUrl, biteCount }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [bitesPerFrame, setBitesPerFrame] = useState(defaultBitesPerFrame(biteCount));
  const [status, setStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const supabase = createClient();

  async function handleExport() {
    setExporting(true);

    try {
      setStatus("Fetching bites…");
      const { data: bites } = await supabase
        .from("bites")
        .select("x, y")
        .eq("sandwich_id", sandwichId)
        .order("created_at", { ascending: true });

      if (!bites?.length) {
        setStatus("No bites found.");
        return;
      }

      setStatus("Loading image…");
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
      const imageBlob = await fetch(proxyUrl).then((r) => r.blob());
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
      const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

      recorder.start();

      // Hold on bare image for 1 second before bites appear
      ctx.clearRect(0, 0, W, H);
      drawBase(ctx, img);
      await new Promise((r) => setTimeout(r, 1000));

      const totalFrames = Math.ceil(bites.length / bitesPerFrame);
      for (let i = 0; i < totalFrames; i++) {
        setStatus(`Rendering frame ${i + 1} / ${totalFrames}…`);
        const accumulated = bites.slice(0, (i + 1) * bitesPerFrame);
        ctx.clearRect(0, 0, W, H);
        drawBase(ctx, img);
        drawHeatmap(ctx, accumulated);
        await new Promise((r) => setTimeout(r, 1000 / FRAME_RATE));
      }

      // Hold on final frame for 2 seconds
      await new Promise((r) => setTimeout(r, 2000));

      recorder.stop();
      await stopped;

      setStatus("Saving…");
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, "-")}-timelapse.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(null);
    } finally {
      setExporting(false);
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-xs text-stone-400 hover:text-stone-600 transition"
      >
        Export timelapse
      </button>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-3">
      <label className="text-xs text-stone-500">
        Bites per frame
        <input
          type="number"
          min={1}
          max={biteCount}
          value={bitesPerFrame}
          onChange={(e) => setBitesPerFrame(Math.max(1, parseInt(e.target.value) || 1))}
          className="ml-2 w-14 rounded border border-stone-200 px-2 py-0.5 text-xs"
        />
      </label>
      <span className="text-xs text-stone-400">
        ≈ {Math.ceil(biteCount / bitesPerFrame)} frames
      </span>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="rounded-lg border border-stone-200 px-3 py-1 text-xs text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
      >
        {exporting ? (status ?? "Working…") : "Export"}
      </button>
      {!exporting && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-stone-400 hover:text-stone-600"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
