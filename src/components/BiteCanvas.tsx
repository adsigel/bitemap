"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateSessionId } from "@/lib/session";
import { track } from "@/lib/track";
import { checkBiteMilestones } from "@/lib/sandwich-actions";
import { getOrCreateReferralToken } from "@/lib/referral-actions";
import type { Point } from "@/lib/types";
import { drawHeatmap } from "@/lib/draw-heatmap";
import { pointInPolygon } from "@/lib/geometry";
import { computePercentile, outlierLabel } from "@/lib/percentile";
import { getClusterCopy, type ClusterCopy } from "@/lib/cluster";
import { pickNextSandwichId } from "@/lib/pick-next-sandwich";
import { formatCount } from "@/lib/format";
import { DonationLink } from "@/components/DonationLink";

export interface BiterAvatar {
  avatarUrl: string | null;
  initial: string | null;
}

interface Props {
  sandwichId: string;
  slug?: string;
  title: string;
  imageUrl: string;
  initialBites: Point[];
  biteBounds?: Point[] | null;
  uploaderName?: string | null;
  biters?: BiterAvatar[];
  isHot?: boolean;
  featured?: boolean;
  autoShare?: boolean;
  submitted?: boolean;
  inboundRef?: string | null;
  existingBite?: { x: number; y: number } | null;
  creatorNote?: string | null;
}

type State =
  | { phase: "idle" }
  | { phase: "placed"; point: Point }
  | { phase: "submitting"; point: Point }
  | { phase: "done"; point: Point; percentile: number; totalBites: number; cluster: ClusterCopy | null }
  | { phase: "already_bitten"; point: Point };


export function BiteCanvas({ sandwichId, slug, title, imageUrl, initialBites, biteBounds, uploaderName, biters = [], isHot, featured, autoShare, submitted, inboundRef, existingBite, creatorNote }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const heatmapRef = useRef<HTMLCanvasElement>(null);
  const nextIdRef = useRef<string | null>(null);
  const [state, setState] = useState<State>(
    existingBite ? { phase: "already_bitten", point: existingBite } : { phase: "idle" }
  );
  const [allBites, setAllBites] = useState<Point[]>(initialBites);
  const [navigating, setNavigating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [showOobMessage, setShowOobMessage] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
      setUserLoaded(true);
    });
  }, [supabase]);

  useEffect(() => {
    if (!userLoaded) return;

    if (existingBite) {
      // Server already confirmed the bite — skip the DB check, just prefetch next
      pickNextSandwichId(sandwichId, supabase, userId).then((id) => {
        nextIdRef.current = id;
      });
      return;
    }

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
  }, [sandwichId, userId, userLoaded, existingBite]);

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
      if (state.phase !== "idle" && state.phase !== "placed") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      if (biteBounds && biteBounds.length >= 3 && !pointInPolygon({ x, y }, biteBounds)) {
        track("Bite Out of Bounds", { sandwich_id: sandwichId, x, y });
        setShowOobMessage(true);
        setTimeout(() => setShowOobMessage(false), 2000);
        return;
      }

      if (state.phase === "placed") {
        track("Bite Moved", { sandwich_id: sandwichId });
      }
      setState({ phase: "placed", point: { x, y } });
    },
    [state.phase, biteBounds, sandwichId]
  );

  const handleSubmit = useCallback(async () => {
    if (state.phase !== "placed") return;
    const { point } = state;
    setState({ phase: "submitting", point });

    const sessionId = getOrCreateSessionId();

    // Kick off next-sandwich lookup in parallel with the bite insert
    const nextIdPromise = pickNextSandwichId(sandwichId, supabase, userId);

    const percentile = computePercentile(point, allBites);

    const { error } = await supabase.from("bites").insert({
      sandwich_id: sandwichId,
      x: point.x,
      y: point.y,
      session_id: sessionId,
      uniqueness_percentile: percentile,
      ...(userId ? { user_id: userId } : {}),
    });

    if (error) {
      setState({ phase: "already_bitten", point });
      nextIdRef.current = await nextIdPromise;
      return;
    }

    nextIdRef.current = await nextIdPromise;

    checkBiteMilestones(sandwichId).catch(console.error);

    if (!userId) {
      const countKey = "bitemap_anon_bite_count";
      const count = parseInt(localStorage.getItem(countKey) ?? "0", 10) + 1;
      localStorage.setItem(countKey, String(count));
      if (count >= 5) setShowNudge(true);
    }

    const updatedBites = [...allBites, point];
    const cluster = getClusterCopy(point, updatedBites, title);
    setAllBites(updatedBites);
    setState({ phase: "done", point, percentile, totalBites: allBites.length, cluster });
    track("Bite Taken", { sandwich_id: sandwichId, x: point.x, y: point.y, percentile, total_bites: updatedBites.length, ...(inboundRef ? { referred_by: inboundRef } : {}) });
  }, [state, allBites, sandwichId, supabase, userId]);

  const handleNext = useCallback(async () => {
    setNavigating(true);
    const id = nextIdRef.current ?? (await pickNextSandwichId(sandwichId, supabase, userId));
    if (id) {
      router.replace(`/sandwich/${id}`);
    } else {
      router.replace("/all-done");
    }
  }, [sandwichId, supabase, router, userId]);

  const handleSkip = useCallback(async () => {
    await track("Sandwich Skipped", { sandwich_id: sandwichId });
    setNavigating(true);
    const id = nextIdRef.current ?? (await pickNextSandwichId(sandwichId, supabase, userId));
    if (id) {
      router.push(`/sandwich/${id}`);
    } else {
      router.push("/all-done");
    }
  }, [sandwichId, supabase, router, userId]);

  const handleShare = useCallback(async () => {
    if (state.phase !== "done" && state.phase !== "already_bitten") return;
    setIsSharing(true);
    try {
      const cluster =
        state.phase === "done"
          ? state.cluster
          : getClusterCopy(state.point, allBites, title);

      const refToken = userId ? await getOrCreateReferralToken(userId).catch(() => null) : null;
      const sandwichUrl = `https://bitemap.food/sandwich/${slug ?? sandwichId}${refToken ? `?ref=${refToken}` : ""}`;

      const shareBlurb = cluster
        ? cluster.shareText
        : `Where would you bite this ${title}?`;
      const text = `${shareBlurb}\n${sandwichUrl}`;

      if (navigator.share) {
        await navigator.share({ text });
        track("Sandwich Shared", { sandwich_id: sandwichId, method: "native_share", ...(userId ? { user_id: userId } : {}) });
      } else {
        await navigator.clipboard.writeText(text).catch(() => {});
        track("Sandwich Shared", { sandwich_id: sandwichId, method: "clipboard", ...(userId ? { user_id: userId } : {}) });
      }
    } catch {
      // User cancelled share — no-op
    } finally {
      setIsSharing(false);
    }
  }, [state, allBites, title, userId, slug, sandwichId]);

  const autoShareFired = useRef(false);
  useEffect(() => {
    if (!autoShare || autoShareFired.current) return;
    if (state.phase !== "already_bitten") return;
    autoShareFired.current = true;
    handleShare();
  }, [autoShare, state.phase, handleShare]);

  const showHeatmap = state.phase === "done" || state.phase === "already_bitten";
  const markerPoint =
    state.phase === "placed" || state.phase === "submitting" || state.phase === "done"
      ? (state as { point: Point }).point
      : null;

  const NextButton = ({ className }: { className?: string }) => (
    <button
      onClick={handleNext}
      disabled={navigating}
      className={`rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-center font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 ${className ?? "block w-full"}`}
    >
      {navigating ? "Loading…" : "Next sandwich →"}
    </button>
  );

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-xl bg-stone-100 select-none ${
          state.phase === "idle" || state.phase === "placed" ? "cursor-crosshair" : "cursor-default"
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
            <div className="absolute inset-0 rounded-full border-2 border-white/60 bg-blue-600/25" />
            <div
              className="absolute rounded-full border-2 border-white bg-blue-600 shadow-lg"
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

        {state.phase === "idle" && !showOobMessage && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-4 pt-8">
            <p className="text-center text-sm font-semibold text-white">
              Tap where you&apos;d take your next bite
            </p>
            <div className="mx-auto mt-2 h-1 w-8 rounded-full bg-white/50" />
          </div>
        )}

        {showOobMessage && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div style={{ background: 'rgba(0,0,0,0.72)', borderRadius: '12px', padding: '12px 20px', color: 'white', fontSize: '14px', fontWeight: 600, textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
              That doesn&apos;t look like part of the sandwich. Try again?
            </div>
          </div>
        )}

        {(isHot || featured || allBites.length < 5) && (
          <div
            className="pointer-events-none absolute z-10"
            style={{ top: '0.75rem', right: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}
          >
            {featured && (
              <span style={{ background: 'white', borderRadius: '9999px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, color: '#1c1917', boxShadow: '0 1px 3px rgba(0,0,0,0.10)', lineHeight: 1.4 }}>
                🏆 featured
              </span>
            )}
            {isHot && (
              <span style={{ background: 'white', borderRadius: '9999px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, color: '#1c1917', boxShadow: '0 1px 3px rgba(0,0,0,0.10)', lineHeight: 1.4 }}>
                🔥 hot
              </span>
            )}
            {allBites.length < 5 && (
              <span style={{ background: 'white', borderRadius: '9999px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, color: '#1c1917', boxShadow: '0 1px 3px rgba(0,0,0,0.10)', lineHeight: 1.4 }}>
                ✨ new
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs text-stone-400">
          {uploaderName ? `Added by ${uploaderName}` : "Added anonymously"}
        </span>
        <div className="flex items-center gap-2">
          {biters.length > 0 && (
            <div className="flex items-center">
              {biters.map((b, i) => (
                <div
                  key={i}
                  className="relative h-6 w-6 overflow-hidden rounded-full border-2 border-white"
                  style={{ zIndex: biters.length - i, marginLeft: i === 0 ? 0 : -8 }}
                >
                  {b.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : b.initial ? (
                    <div className="flex h-full w-full items-center justify-center bg-stone-300 text-[9px] font-bold text-stone-600">
                      {b.initial}
                    </div>
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ background: ['#d6d3d1', '#a8a29e', '#78716c'][i % 3] }}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="white">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <span className="text-xs text-stone-400">
            {formatCount(allBites.length)} {allBites.length === 1 ? "bite" : "bites"}
          </span>
        </div>
      </div>

      {creatorNote && (
        <p className="px-0.5 text-sm text-stone-600 dark:text-stone-300">{creatorNote}</p>
      )}

      {state.phase === "idle" && (
        <button
          onClick={handleSkip}
          disabled={navigating}
          className="block w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-center font-medium text-stone-500 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
        >
          {navigating ? "Loading…" : "I wouldn't bite"}
        </button>
      )}

      {state.phase === "placed" && (
        <div className="space-y-2">
          <button
            onClick={handleSubmit}
            className="w-full rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-white transition hover:bg-orange-600 active:scale-95"
          >
            Confirm bite
          </button>
          <p className="text-center text-xs text-stone-400">Tap the image to reposition</p>
        </div>
      )}

      {state.phase === "submitting" && (
        <div className="rounded-lg bg-stone-100 px-4 py-3 text-center text-stone-500 dark:bg-stone-800 dark:text-stone-400">
          Registering bite…
        </div>
      )}

      {state.phase === "done" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-orange-100 bg-orange-100 px-4 py-4 text-center dark:border-orange-900 dark:bg-orange-950">
            {submitted ? (
              <>
                <p className="text-lg font-semibold">You&apos;ve drawn first bite! 🥪</p>
                <p className="mt-1 text-sm text-stone-500">
                  Once it&apos;s approved, share it and see where everyone else bites.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">
                  {state.totalBites === 0
                    ? "You've drawn first bite!"
                    : state.cluster
                    ? state.cluster.heading
                    : outlierLabel(state.percentile)}
                </p>
                {state.totalBites === 0 ? (
                  <p className="mt-1 text-sm text-stone-500">Keep going to leave your bitemark.</p>
                ) : state.totalBites < 5 ? (
                  <p className="mt-1 text-sm text-stone-500">
                    Biter #{state.totalBites + 1} — the map&apos;s still filling in.
                  </p>
                ) : state.cluster ? (
                  <p className="mt-1 text-sm text-stone-500">{state.cluster.body}</p>
                ) : (
                  <p className="mt-1 text-sm text-stone-500">
                    Your bite was more central than{" "}
                    <span className="font-medium text-stone-700">
                      {state.percentile}% of biters
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
          {showNudge && !userId && (
            <div className="rounded-xl border border-orange-100 bg-orange-100 px-4 py-3 text-center dark:border-orange-900/40 dark:bg-orange-950/40">
              <p className="text-sm font-medium text-stone-700 dark:text-stone-200">You&apos;re on a roll! Save your bite history.</p>
              <a
                href="/sign-in"
                className="mt-2 inline-block rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Create a free account
              </a>
              <p className="mt-3">
                <DonationLink
                  source="post-bite"
                  className="text-xs text-stone-400 underline-offset-2 hover:underline dark:text-stone-500"
                >
                  Support Bitemap ☕
                </DonationLink>
              </p>
            </div>
          )}
          <div className="flex gap-2">
            {!submitted && (
              <button
                onClick={handleShare}
                disabled={isSharing}
                className="flex-1 rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
              >
                {isSharing ? "Preparing…" : "Share my bite"}
              </button>
            )}
            <NextButton className={!submitted ? "flex-1" : "w-full"} />
          </div>
        </div>
      )}

      {state.phase === "already_bitten" && (
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            disabled={isSharing}
            className="flex-1 rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            {isSharing ? "Preparing…" : "Share my bite"}
          </button>
          <NextButton className="flex-1" />
        </div>
      )}
    </div>
  );
}
