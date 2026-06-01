"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateSessionId } from "@/lib/session";
import { track } from "@/lib/track";
import { checkBiteMilestones } from "@/lib/sandwich-actions";

interface Point {
  x: number;
  y: number;
}

interface Props {
  sandwichId: string;
  title: string;
  imageUrl: string;
  initialBites: Point[];
}

type State =
  | { phase: "idle" }
  | { phase: "placed"; point: Point }
  | { phase: "submitting"; point: Point }
  | { phase: "done"; point: Point; percentile: number; totalBites: number }
  | { phase: "already_bitten"; point: Point };

// Radius for neighbour counting — 10% of the normalised image dimension.
// Tune upward if clusters feel too tight, downward if everything reads as "in the pack".
const DENSITY_RADIUS = 0.10;

// Ranks the user by local density rather than distance from a global centre.
// High return value = few neighbours nearby = maverick.
// Low return value  = many neighbours nearby = in the pack.
function computePercentile(myPoint: Point, otherBites: Point[]): number {
  if (otherBites.length === 0) return 50;

  const countNeighbours = (p: Point, pool: Point[]) =>
    pool.filter(b => Math.hypot(b.x - p.x, b.y - p.y) < DENSITY_RADIUS).length;

  const myNeighbours = countNeighbours(myPoint, otherBites);

  // Each other bite's neighbour count, excluding itself from its own pool
  const otherCounts = otherBites.map((b, i) =>
    countNeighbours(b, otherBites.filter((_, j) => j !== i))
  );

  // Fraction of others with MORE neighbours than the user → high = maverick
  const moreDense = otherCounts.filter(n => n > myNeighbours).length;
  return Math.round((moreDense / otherCounts.length) * 100);
}

function outlierLabel(percentile: number): string {
  if (percentile > 66) return "Such a unique spot for a bite! 🦄";
  if (percentile > 33) return "A pretty distinctive bite spot 👍";
  return "That's a popular bite spot 🎯";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function drawHeatmap(
  canvas: HTMLCanvasElement,
  bites: Point[],
  width: number,
  height: number
) {
  const ctx = canvas.getContext("2d")!;
  if (bites.length === 0) return;

  const radius = Math.min(width, height) * 0.13;

  ctx.globalCompositeOperation = "lighter";
  bites.forEach((bite) => {
    const px = bite.x * width;
    const py = bite.y * height;
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
    gradient.addColorStop(0, "rgba(255, 80, 0, 0.55)");
    gradient.addColorStop(0.4, "rgba(255, 120, 0, 0.25)");
    gradient.addColorStop(1, "rgba(255, 80, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.globalCompositeOperation = "source-over";
  bites.forEach((bite) => {
    const px = bite.x * width;
    const py = bite.y * height;
    ctx.fillStyle = "rgba(255, 60, 0, 0.75)";
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

async function generateShareImage(
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
  const blobUrl = URL.createObjectURL(imageBlob);
  try {
    const img = new window.Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = blobUrl;
    });

    // Cover-fit into the image band
    const imgAspect = img.naturalWidth / img.naturalHeight;
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
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    ctx.restore();
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

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
    subtext = `You're the ${ordinal(n)} person to bite this one — the map's still filling in.`;
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

// Picks a random unbitten sandwich, falling back to any sandwich if all are bitten.
async function pickNextSandwichId(
  currentId: string,
  supabase: ReturnType<typeof createClient>,
  userId: string | null
): Promise<string | null> {
  const sessionId = getOrCreateSessionId();

  const { data: all } = await supabase
    .from("sandwiches")
    .select("id")
    .eq("approved", true)
    .neq("id", currentId);

  if (!all?.length) return null;

  const allIds = all.map((s) => s.id);
  const bittenQuery = userId
    ? supabase.from("bites").select("sandwich_id").eq("user_id", userId).in("sandwich_id", allIds)
    : supabase.from("bites").select("sandwich_id").eq("session_id", sessionId).in("sandwich_id", allIds);

  const { data: bitten } = await bittenQuery;

  const bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  const unbitten = all.filter((s) => !bittenIds.has(s.id));
  const pool = unbitten.length > 0 ? unbitten : all;

  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function BiteCanvas({ sandwichId, title, imageUrl, initialBites }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLCanvasElement>(null);
  const nextIdRef = useRef<string | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [allBites, setAllBites] = useState<Point[]>(initialBites);
  const [navigating, setNavigating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
      setUserLoaded(true);
    });
  }, [supabase]);

  useEffect(() => {
    if (!userLoaded) return;
    const sessionId = getOrCreateSessionId();
    const query = userId
      ? supabase.from("bites").select("x, y").eq("sandwich_id", sandwichId).eq("user_id", userId).maybeSingle()
      : supabase.from("bites").select("x, y").eq("sandwich_id", sandwichId).eq("session_id", sessionId).maybeSingle();

    query.then(({ data }) => {
      if (data) {
        setState({ phase: "already_bitten", point: { x: data.x, y: data.y } });
        pickNextSandwichId(sandwichId, supabase, userId).then((id) => {
          nextIdRef.current = id;
        });
      }
    });
  }, [sandwichId, userId, userLoaded]);

  useEffect(() => {
    if (state.phase !== "done" && state.phase !== "already_bitten") return;
    const canvas = heatmapRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const { width, height } = container.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;
    drawHeatmap(canvas, allBites, width, height);
  }, [state.phase, allBites]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (state.phase !== "idle") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setState({ phase: "placed", point: { x, y } });
    },
    [state.phase]
  );

  const handleSubmit = useCallback(async () => {
    if (state.phase !== "placed") return;
    const { point } = state;
    setState({ phase: "submitting", point });

    const sessionId = getOrCreateSessionId();

    // Kick off next-sandwich lookup in parallel with the bite insert
    const nextIdPromise = pickNextSandwichId(sandwichId, supabase, userId);

    const { error } = await supabase.from("bites").insert({
      sandwich_id: sandwichId,
      x: point.x,
      y: point.y,
      session_id: sessionId,
      ...(userId ? { user_id: userId } : {}),
    });

    if (error) {
      setState({ phase: "already_bitten", point });
      nextIdRef.current = await nextIdPromise;
      return;
    }

    nextIdRef.current = await nextIdPromise;

    if (userId) {
      checkBiteMilestones(sandwichId, userId).catch(console.error);
    } else {
      const countKey = "bitemap_anon_bite_count";
      const count = parseInt(localStorage.getItem(countKey) ?? "0", 10) + 1;
      localStorage.setItem(countKey, String(count));
      if (count >= 5) setShowNudge(true);
    }

    const percentile = computePercentile(point, allBites);
    const updatedBites = [...allBites, point];
    setAllBites(updatedBites);
    setState({ phase: "done", point, percentile, totalBites: allBites.length });
    track("Bite Taken", { sandwich_id: sandwichId, x: point.x, y: point.y, percentile, total_bites: updatedBites.length });
  }, [state, allBites, sandwichId, supabase, userId]);

  const handleReset = useCallback(() => {
    if (state.phase === "placed") {
      track("Bite Moved", { sandwich_id: sandwichId });
      setState({ phase: "idle" });
    }
  }, [state.phase, sandwichId]);

  const handleNext = useCallback(async () => {
    setNavigating(true);
    const id = nextIdRef.current ?? (await pickNextSandwichId(sandwichId, supabase, userId));
    if (id) {
      router.push(`/sandwich/${id}`);
    } else {
      router.push("/");
    }
  }, [sandwichId, supabase, router, userId]);

  const handleShare = useCallback(async () => {
    if (state.phase !== "done" && state.phase !== "already_bitten") return;
    setIsSharing(true);
    try {
      let percentile: number | null = null;
      if (state.phase === "done") {
        percentile = state.percentile;
      } else if (state.phase === "already_bitten") {
        // Exclude the user's own bite from the comparison pool
        let excluded = false;
        const otherBites = allBites.filter(b => {
          if (!excluded && b.x === state.point.x && b.y === state.point.y) {
            excluded = true;
            return false;
          }
          return true;
        });
        if (otherBites.length > 0) percentile = computePercentile(state.point, otherBites);
      }
      const n = allBites.length;
      const sandwichUrl = `https://bitemap.food/sandwich/${sandwichId}`;
      let caption: string;
      if (percentile === null || n < 15) {
        caption = `Brand new sandwich on Bitemap — be one of the first to call where you'd bite this ${title}: ${sandwichUrl}`;
      } else if (percentile >= 80) {
        caption = `Apparently I bite sandwiches weird. Where would you bite this ${title}? ${sandwichUrl}`;
      } else if (percentile <= 30) {
        caption = `Turns out I bite a ${title} exactly like everyone else. Comforting, honestly. ${sandwichUrl}`;
      } else {
        caption = `A little off the beaten path on this ${title}. Where would you bite? ${sandwichUrl}`;
      }

      const [blob] = await Promise.all([
        generateShareImage(imageUrl, allBites, state.point, title, percentile),
        navigator.clipboard.writeText(caption).catch(() => {}),
      ]);
      const file = new File([blob], "my-bite.jpg", { type: "image/jpeg" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
        track("Sandwich Shared", { sandwich_id: sandwichId, method: "native_share" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-bite.jpg";
        a.click();
        URL.revokeObjectURL(url);
        track("Sandwich Shared", { sandwich_id: sandwichId, method: "download" });
      }
    } catch {
      // User cancelled share or export failed — no-op
    } finally {
      setIsSharing(false);
    }
  }, [state, imageUrl, allBites, title]);

  const showHeatmap = state.phase === "done" || state.phase === "already_bitten";
  const markerPoint =
    state.phase === "placed" || state.phase === "submitting" || state.phase === "done"
      ? (state as { point: Point }).point
      : null;

  const NextButton = () => (
    <button
      onClick={handleNext}
      disabled={navigating}
      className="block w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-center font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
    >
      {navigating ? "Loading…" : "Next sandwich →"}
    </button>
  );

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-xl bg-stone-100 select-none ${
          state.phase === "idle" ? "cursor-crosshair" : "cursor-default"
        }`}
        style={{ aspectRatio: "4/3" }}
        onClick={handleClick}
      >
        <Image
          src={imageUrl}
          alt="Sandwich"
          fill
          className="object-cover"
          sizes="(max-width: 672px) 100vw, 672px"
          priority
          draggable={false}
        />

        {showHeatmap && (
          <canvas
            ref={heatmapRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        )}

        {/* Bite marker */}
        {markerPoint && (
          <div
            className="pointer-events-none absolute"
            style={{
              left: `${markerPoint.x * 100}%`,
              top: `${markerPoint.y * 100}%`,
              width: 72,
              height: 72,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="absolute inset-0 rounded-full border-2 border-white/60 bg-orange-500/25" />
            <div
              className="absolute rounded-full border-2 border-white bg-orange-500 shadow-lg"
              style={{
                width: 32,
                height: 32,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
        )}

        {state.phase === "idle" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-4 py-3">
            <p className="text-center text-sm font-medium text-white">
              Tap where you&apos;d take your next bite
            </p>
          </div>
        )}
      </div>

      {state.phase === "placed" && (
        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            className="flex-1 rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-white transition hover:bg-orange-600 active:scale-95"
          >
            Confirm bite
          </button>
          <button
            onClick={handleReset}
            className="rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-stone-600 transition hover:bg-stone-50"
          >
            Move it
          </button>
        </div>
      )}

      {state.phase === "submitting" && (
        <div className="rounded-lg bg-stone-100 px-4 py-3 text-center text-stone-500">
          Registering bite…
        </div>
      )}

      {state.phase === "done" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-4 text-center">
            <p className="text-lg font-semibold">{outlierLabel(state.percentile)}</p>
            {state.totalBites > 0 ? (
              <p className="mt-1 text-sm text-stone-500">
                Your bite was more central than{" "}
                <span className="font-medium text-stone-700">
                  {state.percentile}% of biter{state.totalBites === 1 ? "" : "s"}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-stone-500">You&apos;re the first biter!</p>
            )}
          </div>
          {showNudge && !userId && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-center">
              <p className="text-sm font-medium text-stone-700">You&apos;re on a roll! Save your bite history.</p>
              <a
                href="/sign-in"
                className="mt-2 inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Create a free account
              </a>
            </div>
          )}
          <button
            onClick={handleShare}
            disabled={isSharing}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {isSharing ? "Preparing…" : "Share my bite"}
          </button>
          <NextButton />
        </div>
      )}

      {state.phase === "already_bitten" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 text-center text-stone-500">
            You&apos;ve already bitten this one.
          </div>
          <button
            onClick={handleShare}
            disabled={isSharing}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {isSharing ? "Preparing…" : "Share my bite"}
          </button>
          <NextButton />
        </div>
      )}
    </div>
  );
}
