"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateSessionId } from "@/lib/session";
import { track } from "@/lib/track";

interface Point {
  x: number;
  y: number;
}

interface Props {
  sandwichId: string;
  imageUrl: string;
  initialBites: Point[];
}

type State =
  | { phase: "idle" }
  | { phase: "placed"; point: Point }
  | { phase: "submitting"; point: Point }
  | { phase: "done"; point: Point; percentile: number; totalBites: number }
  | { phase: "already_bitten" };

// Compare against other biters only — don't include the user's own bite.
function computePercentile(myPoint: Point, otherBites: Point[]): number {
  if (otherBites.length === 0) return 50;

  const centroidX = otherBites.reduce((s, b) => s + b.x, 0) / otherBites.length;
  const centroidY = otherBites.reduce((s, b) => s + b.y, 0) / otherBites.length;

  const myDist = Math.hypot(myPoint.x - centroidX, myPoint.y - centroidY);
  const otherDists = otherBites.map((b) =>
    Math.hypot(b.x - centroidX, b.y - centroidY)
  );

  const moreOutlierCount = otherDists.filter((d) => d > myDist).length;
  return Math.round((moreOutlierCount / otherDists.length) * 100);
}

function outlierLabel(percentile: number): string {
  if (percentile > 66) return "That's a popular bite spot 🎯";
  if (percentile > 33) return "That's a pretty popular bite spot 👍";
  return "Such a unique spot for a bite! 🦄";
}

function drawHeatmap(
  canvas: HTMLCanvasElement,
  bites: Point[],
  width: number,
  height: number
) {
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
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

// Picks a random unbitten sandwich, falling back to any sandwich if all are bitten.
async function pickNextSandwichId(
  currentId: string,
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const sessionId = getOrCreateSessionId();

  const { data: all } = await supabase
    .from("sandwiches")
    .select("id")
    .eq("approved", true)
    .neq("id", currentId);

  if (!all?.length) return null;

  const { data: bitten } = await supabase
    .from("bites")
    .select("sandwich_id")
    .eq("session_id", sessionId)
    .in("sandwich_id", all.map((s) => s.id));

  const bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  const unbitten = all.filter((s) => !bittenIds.has(s.id));
  const pool = unbitten.length > 0 ? unbitten : all;

  return pool[Math.floor(Math.random() * pool.length)].id;
}

export function BiteCanvas({ sandwichId, imageUrl, initialBites }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLCanvasElement>(null);
  const nextIdRef = useRef<string | null>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [allBites, setAllBites] = useState<Point[]>(initialBites);
  const [navigating, setNavigating] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    supabase
      .from("bites")
      .select("x, y")
      .eq("sandwich_id", sandwichId)
      .eq("session_id", sessionId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setState({ phase: "already_bitten" });
          // Pre-fetch next sandwich in the background
          pickNextSandwichId(sandwichId, supabase).then((id) => {
            nextIdRef.current = id;
          });
        }
      });
  }, [sandwichId]);

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
    const nextIdPromise = pickNextSandwichId(sandwichId, supabase);

    const { error } = await supabase.from("bites").insert({
      sandwich_id: sandwichId,
      x: point.x,
      y: point.y,
      session_id: sessionId,
    });

    if (error) {
      setState({ phase: "already_bitten" });
      nextIdRef.current = await nextIdPromise;
      return;
    }

    nextIdRef.current = await nextIdPromise;

    const percentile = computePercentile(point, allBites);
    const updatedBites = [...allBites, point];
    setAllBites(updatedBites);
    setState({ phase: "done", point, percentile, totalBites: allBites.length });
    track("Bite Taken", { sandwich_id: sandwichId, x: point.x, y: point.y, percentile, total_bites: updatedBites.length });
  }, [state, allBites, sandwichId, supabase]);

  const handleReset = useCallback(() => {
    if (state.phase === "placed") {
      track("Bite Moved", { sandwich_id: sandwichId });
      setState({ phase: "idle" });
    }
  }, [state.phase, sandwichId]);

  const handleNext = useCallback(async () => {
    setNavigating(true);
    const id = nextIdRef.current ?? (await pickNextSandwichId(sandwichId, supabase));
    if (id) {
      router.push(`/sandwich/${id}`);
    } else {
      router.push("/");
    }
  }, [sandwichId, supabase, router]);

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
                  {state.percentile}% of {state.totalBites.toLocaleString()} biter{state.totalBites === 1 ? "" : "s"}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-stone-500">You&apos;re the first biter!</p>
            )}
          </div>
          <NextButton />
        </div>
      )}

      {state.phase === "already_bitten" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 text-center text-stone-500">
            You&apos;ve already bitten this one.
          </div>
          <NextButton />
        </div>
      )}
    </div>
  );
}
