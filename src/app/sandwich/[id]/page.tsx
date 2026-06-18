import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BiteCanvas, type BiterAvatar } from "@/components/BiteCanvas";
import { ViewTracker } from "@/components/ViewTracker";
import { VisitButton } from "@/components/VisitButton";
import { todayET } from "@/lib/et-date";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { data: sandwich } = await supabase
    .from("sandwiches")
    .select("title, description, image_url, slug")
    .eq(isUuid ? "id" : "slug", id)
    .single();

  if (!sandwich) return {};

  const description = sandwich.description
    ? `${sandwich.description} — Tap where you'd take your next bite on Bitemap.`
    : `Tap where you'd bite this ${sandwich.title}. See where everyone else bites too.`;

  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/sandwich/${sandwich.slug ?? id}`;

  return {
    title: `${sandwich.title} — Bitemap`,
    description,
    openGraph: {
      title: sandwich.title,
      description,
      url,
      type: "website",
      images: [{ url: sandwich.image_url, width: 1200, height: 900, alt: sandwich.title }],
      siteName: "Bitemap",
    },
    twitter: {
      card: "summary_large_image",
      title: sandwich.title,
      description,
      images: [sandwich.image_url],
    },
  };
}

export default async function SandwichPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; share?: string; ref?: string; mode?: string }>;
}) {
  const { id } = await params;
  const { submitted, share, ref, mode } = await searchParams;
  const supabase = await createClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  // Fetch sandwich, user, and cookies in parallel
  const [{ data: sandwich }, { data: { user } }, cookieStore] = await Promise.all([
    supabase.from("sandwiches").select("*").eq(isUuid ? "id" : "slug", id).single(),
    supabase.auth.getUser(),
    cookies(),
  ]);

  if (!sandwich) notFound();

  const sessionId = cookieStore.get("bitemap_session_id")?.value;

  // Build existing-bite query using server-side identity
  const existingBiteQuery = user
    ? supabase
        .from("bites")
        .select("x, y")
        .eq("sandwich_id", sandwich.id)
        .or(
          sessionId
            ? `user_id.eq.${user.id},session_id.eq.${sessionId}`
            : `user_id.eq.${user.id}`
        )
        .maybeSingle()
    : sessionId
    ? supabase
        .from("bites")
        .select("x, y")
        .eq("sandwich_id", sandwich.id)
        .eq("session_id", sessionId)
        .maybeSingle()
    : null;

  // Supabase PostgREST caps responses at 1000 rows by default; paginate to get all bites.
  const fetchAllBites = async () => {
    const PAGE = 1000;
    const all: { x: number; y: number }[] = [];
    for (let page = 0; ; page++) {
      const { data } = await supabase
        .from("bites")
        .select("x, y")
        .eq("sandwich_id", sandwich.id)
        .range(page * PAGE, (page + 1) * PAGE - 1);
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
    }
    return all;
  };

  const [
    bites,
    uploaderResult,
    { data: recentBites },
    existingBiteResult,
  ] = await Promise.all([
    fetchAllBites(),
    sandwich.uploaded_by
      ? supabase.from("profiles").select("display_name, creator_features").eq("id", sandwich.uploaded_by).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("bites")
      .select("user_id")
      .eq("sandwich_id", sandwich.id)
      .order("created_at", { ascending: false })
      .limit(10),
    existingBiteQuery ?? Promise.resolve({ data: null }),
  ]);

  const uploaderName = uploaderResult?.data?.display_name ?? null;
  const creatorFeatures = uploaderResult?.data?.creator_features ?? false;
  const existingBite = existingBiteResult?.data as { x: number; y: number } | null ?? null;
  const isAdmin = !!process.env.ADMIN_EMAIL && user?.email === process.env.ADMIN_EMAIL;

  const loggedInIds = (recentBites ?? []).map(b => b.user_id).filter(Boolean) as string[];
  const profileMap = new Map<string, { avatar_url: string | null; display_name: string }>();
  if (loggedInIds.length > 0) {
    const { data: biterProfiles } = await supabase
      .from("profiles")
      .select("id, avatar_url, display_name")
      .in("id", loggedInIds);
    biterProfiles?.forEach(p => profileMap.set(p.id, p));
  }

  const biters: BiterAvatar[] = (recentBites ?? [])
    .map(b => ({
      avatarUrl: b.user_id ? (profileMap.get(b.user_id)?.avatar_url ?? null) : null,
      initial: b.user_id ? (profileMap.get(b.user_id)?.display_name?.[0]?.toUpperCase() ?? null) : null,
    }))
    .sort((a, b) => {
      const rank = (x: BiterAvatar) => (x.avatarUrl ? 0 : x.initial ? 1 : 2);
      return rank(a) - rank(b);
    })
    .slice(0, 3);

  // Daily progress (Today's Sandos indicator + Keep Biting / See results copy)
  // only applies in daily mode, and only when this sandwich is actually in
  // today's set (it always should be when mode=daily, but a stale link or
  // a rollover mid-render could land here with it already rotated out).
  let dailyProgress: { completedBeforeThis: number; total: number } | null = null;
  if (mode !== "explore") {
    const today = todayET();
    const { data: todaysSlots } = await supabase.from("daily_slots").select("sandwich_id").eq("date", today);
    const todaysIds = (todaysSlots ?? []).map((s) => s.sandwich_id);
    if (todaysIds.includes(sandwich.id)) {
      const otherIds = todaysIds.filter((sid) => sid !== sandwich.id);
      let completedBeforeThis = 0;
      if (otherIds.length > 0) {
        const bitesQuery = user
          ? supabase
              .from("bites")
              .select("*", { count: "exact", head: true })
              .in("sandwich_id", otherIds)
              .or(sessionId ? `user_id.eq.${user.id},session_id.eq.${sessionId}` : `user_id.eq.${user.id}`)
          : sessionId
          ? supabase.from("bites").select("*", { count: "exact", head: true }).in("sandwich_id", otherIds).eq("session_id", sessionId)
          : null;
        const { count } = bitesQuery ? await bitesQuery : { count: 0 };
        completedBeforeThis = count ?? 0;
      }
      dailyProgress = { completedBeforeThis, total: todaysIds.length };
    }
  }
  const isLastOfToday = !!dailyProgress && dailyProgress.completedBeforeThis + 1 >= dailyProgress.total;

  return (
    <div className="mx-auto max-w-2xl">
      <ViewTracker event="Sandwich Viewed" properties={{ sandwich_id: sandwich.id, title: sandwich.title, mode: mode === "explore" ? "explore" : "daily", ...(ref ? { referred_by: ref } : {}) }} />
      {dailyProgress && (
        <div className="mb-3 flex items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Today&apos;s Sandos</p>
          <div className="flex gap-1.5">
            {Array.from({ length: dailyProgress.total }).map((_, i) => {
              const completed = dailyProgress!.completedBeforeThis;
              return (
                <span
                  key={i}
                  className={`h-1.5 w-6 rounded-full ${
                    i < completed
                      ? "bg-orange-500"
                      : i === completed
                      ? "bg-orange-200 dark:bg-orange-900"
                      : "bg-stone-200 dark:bg-stone-700"
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-xl font-bold">{sandwich.title}</h1>
        {creatorFeatures && sandwich.creator_url && (
          <VisitButton
            href={sandwich.creator_url}
            sandwichId={sandwich.id}
            title={sandwich.title}
          />
        )}
      </div>
      {sandwich.description && (
        <p className="mb-2 text-stone-500">{sandwich.description}</p>
      )}
      {submitted && !sandwich.approved && (
        <p className="mb-4 text-center text-sm text-orange-600">
          We&apos;ll email you once it&apos;s reviewed and scheduled, then again the day it goes live.
        </p>
      )}
      <BiteCanvas
        sandwichId={sandwich.id}
        slug={sandwich.slug}
        title={sandwich.title}
        imageUrl={sandwich.image_url}
        initialBites={bites}
        biteBounds={sandwich.bite_bounds as { x: number; y: number }[] | null}
        uploaderName={uploaderName}
        biters={biters}
        autoShare={share === "1"}
        submitted={!!submitted}
        inboundRef={ref}
        existingBite={existingBite}
        creatorNote={creatorFeatures ? (sandwich.creator_note ?? null) : null}
        isAdmin={isAdmin}
        mode={mode === "explore" ? "explore" : "daily"}
        isLastOfToday={isLastOfToday}
      />
    </div>
  );
}
