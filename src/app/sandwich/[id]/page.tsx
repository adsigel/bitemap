import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BiteCanvas, type BiterAvatar } from "@/components/BiteCanvas";
import { ViewTracker } from "@/components/ViewTracker";

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
  searchParams: Promise<{ submitted?: string; share?: string; ref?: string }>;
}) {
  const { id } = await params;
  const { submitted, share, ref } = await searchParams;
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

  const fortyEightHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: bites },
    uploaderResult,
    { data: recentBites },
    { count: recentBiteCount },
    existingBiteResult,
  ] = await Promise.all([
    supabase.from("bites").select("x, y").eq("sandwich_id", sandwich.id),
    sandwich.uploaded_by
      ? supabase.from("profiles").select("display_name").eq("id", sandwich.uploaded_by).single()
      : Promise.resolve({ data: null }),
    supabase
      .from("bites")
      .select("user_id")
      .eq("sandwich_id", sandwich.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("bites")
      .select("*", { count: "exact", head: true })
      .eq("sandwich_id", sandwich.id)
      .gt("created_at", fortyEightHoursAgo),
    existingBiteQuery ?? Promise.resolve({ data: null }),
  ]);

  const uploaderName = uploaderResult?.data?.display_name ?? null;
  const existingBite = existingBiteResult?.data as { x: number; y: number } | null ?? null;
  const isHot = (recentBiteCount ?? 0) >= 10;

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

  return (
    <div className="mx-auto max-w-2xl">
      <ViewTracker event="Sandwich Viewed" properties={{ sandwich_id: sandwich.id, title: sandwich.title, ...(ref ? { referred_by: ref } : {}) }} />
      <div className="mb-3">
        <h1 className="text-xl font-bold">{sandwich.title}</h1>
      </div>
      {sandwich.description && (
        <p className="mb-2 text-stone-500">{sandwich.description}</p>
      )}
      {submitted && !sandwich.approved && (
        <p className="mb-4 text-center text-sm text-orange-600">
          We&apos;ll send you an email once your sandwich is live — usually just a few minutes.
        </p>
      )}
      <BiteCanvas
        sandwichId={sandwich.id}
        slug={sandwich.slug}
        title={sandwich.title}
        imageUrl={sandwich.image_url}
        initialBites={bites ?? []}
        biteBounds={sandwich.bite_bounds as { x: number; y: number }[] | null}
        uploaderName={uploaderName}
        biters={biters}
        isHot={isHot}
        autoShare={share === "1"}
        submitted={!!submitted}
        inboundRef={ref}
        existingBite={existingBite}
      />
    </div>
  );
}
