import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DisplayNameEditor } from "@/components/DisplayNameEditor";
import { ViewTracker } from "@/components/ViewTracker";
import { SandwichCreatorCard } from "@/components/SandwichCreatorCard";
import { interestingScore } from "@/lib/interesting-score";
import type { Point } from "@/lib/types";

function computePercentile(my: { x: number; y: number }, others: { x: number; y: number }[]): number {
  if (others.length === 0) return 50;
  const cx = others.reduce((s, b) => s + b.x, 0) / others.length;
  const cy = others.reduce((s, b) => s + b.y, 0) / others.length;
  const myDist = Math.hypot(my.x - cx, my.y - cy);
  const moreCentral = others.filter((b) => Math.hypot(b.x - cx, b.y - cy) < myDist).length;
  return Math.round((moreCentral / others.length) * 100);
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [
    { data: profile },
    { count: biteCount },
    { data: userSandwiches },
    { data: userBites },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single(),
    supabase.from("bites").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("sandwiches_with_count")
      .select("id, slug, title, approved, featured, created_at, image_url, bite_count")
      .eq("uploaded_by", user.id)
      .order(sort === "bites" ? "bite_count" : "created_at", { ascending: false }),
    supabase.from("bites").select("sandwich_id, x, y").eq("user_id", user.id),
  ]);

  let approvedSandwiches = (userSandwiches ?? []).filter(s => s.approved);
  const pendingSandwiches = (userSandwiches ?? []).filter(s => !s.approved);
  const approvedIds = approvedSandwiches.map(s => s.id);

  const hotSet = new Set<string>();
  const sparklineMap = new Map<string, number[]>();

  if (approvedIds.length > 0) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Paginate recent bites — the default 1000-row cap would under-count
    // sandwiches that get heavy traffic in a short window.
    const PAGE = 1000;
    const recentBites: { sandwich_id: string; created_at: string }[] = [];
    const [{ data: hotData }] = await Promise.all([
      supabase.from("hot_sandwiches").select("sandwich_id").in("sandwich_id", approvedIds),
      (async () => {
        for (let page = 0; ; page++) {
          const { data } = await supabase
            .from("bites")
            .select("sandwich_id, created_at")
            .in("sandwich_id", approvedIds)
            .gte("created_at", sevenDaysAgo)
            .range(page * PAGE, (page + 1) * PAGE - 1);
          if (!data?.length) break;
          recentBites.push(...data);
          if (data.length < PAGE) break;
        }
      })(),
    ]);

    (hotData ?? []).forEach(h => hotSet.add(h.sandwich_id));

    const now = Date.now();
    for (const sid of approvedIds) {
      const days = Array(7).fill(0);
      for (const b of recentBites.filter(b => b.sandwich_id === sid)) {
        const dayIndex = Math.floor((now - new Date(b.created_at).getTime()) / (1000 * 60 * 60 * 24));
        if (dayIndex < 7) days[6 - dayIndex]++;
      }
      sparklineMap.set(sid, days);
    }
  }

  if (sort === "interesting" && approvedIds.length > 0) {
    const { data: scoringBites } = await supabase
      .from("bites")
      .select("sandwich_id, x, y")
      .in("sandwich_id", approvedIds)
      .limit(10000);

    if (scoringBites?.length) {
      const bitesBySandwich = new Map<string, Point[]>();
      for (const b of scoringBites) {
        if (!bitesBySandwich.has(b.sandwich_id)) bitesBySandwich.set(b.sandwich_id, []);
        bitesBySandwich.get(b.sandwich_id)!.push({ x: b.x, y: b.y });
      }
      approvedSandwiches = [...approvedSandwiches].sort(
        (a, b) =>
          interestingScore(bitesBySandwich.get(b.id) ?? []) -
          interestingScore(bitesBySandwich.get(a.id) ?? [])
      );
    }
  }

  let commonalityScore: number | null = null;
  if (userBites?.length) {
    const sandwichIds = [...new Set(userBites.map((b) => b.sandwich_id))];
    const { data: allBites } = await supabase
      .from("bites")
      .select("sandwich_id, x, y")
      .in("sandwich_id", sandwichIds);

    if (allBites?.length) {
      const bySandwich = new Map<string, { x: number; y: number }[]>();
      for (const b of allBites) {
        if (!bySandwich.has(b.sandwich_id)) bySandwich.set(b.sandwich_id, []);
        bySandwich.get(b.sandwich_id)!.push({ x: b.x, y: b.y });
      }
      const percentiles = userBites.map((ub) => {
        const all = bySandwich.get(ub.sandwich_id) ?? [];
        const others = all.filter((b) => b.x !== ub.x || b.y !== ub.y);
        return computePercentile(ub, others.length > 0 ? others : all);
      });
      commonalityScore = Math.round(percentiles.reduce((a, b) => a + b, 0) / percentiles.length);
    }
  }

  const memberSince = new Date(user.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <ViewTracker event="Profile Viewed" />
      <div className="flex items-center gap-4">
        {profile?.avatar_url ? (
          <Image
            src={profile.avatar_url}
            alt={profile.display_name ?? ""}
            width={64}
            height={64}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-2xl font-bold text-orange-600">
            {profile?.display_name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="min-w-0">
          <DisplayNameEditor userId={user.id} initialName={profile?.display_name ?? ""} />
          <p className="text-sm text-stone-500">Biter since {memberSince}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-center dark:border-stone-700 dark:bg-stone-800">
          <p className="text-2xl font-bold">{biteCount ?? 0}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400">Bites Taken</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-center dark:border-stone-700 dark:bg-stone-800">
          <p className="text-2xl font-bold">{userSandwiches?.length ?? 0}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400">Sandos Submitted</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-center dark:border-stone-700 dark:bg-stone-800">
          {commonalityScore !== null ? (
            <>
              <p className="text-2xl font-bold">{commonalityScore}</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">Bitemark</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-stone-300">—</p>
              <p className="text-xs text-stone-500 dark:text-stone-400">Bitemark</p>
            </>
          )}
        </div>
      </div>

      {commonalityScore !== null && (
        <p className="text-center text-sm text-stone-500">
          Your bites are more unique than{" "}
          <span className="font-medium text-stone-700">{commonalityScore}% of other biters</span> on average.
        </p>
      )}

      {pendingSandwiches.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold">Awaiting approval</h2>
          <ul className="space-y-2">
            {pendingSandwiches.map((s) => (
              <li key={s.id}>
                <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-800">
                  <div
                    className="relative shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-700"
                    style={{ width: 56, height: 56 }}
                  >
                    {s.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.image_url} alt={s.title} className="absolute inset-0 h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-800 dark:text-stone-100">{s.title}</p>
                    <p className="text-sm text-stone-400 dark:text-stone-500">Pending review</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {approvedSandwiches.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Your Sandos</h2>
            <div className="flex gap-3 text-sm">
              <a
                href="/profile"
                className={!sort ? "font-medium text-orange-500" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"}
              >
                Most recent
              </a>
              <a
                href="/profile?sort=bites"
                className={sort === "bites" ? "font-medium text-orange-500" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"}
              >
                Most bitten
              </a>
              <a
                href="/profile?sort=interesting"
                className={sort === "interesting" ? "font-medium text-orange-500" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"}
              >
                Most interesting
              </a>
            </div>
          </div>
          <ul className="space-y-3">
            {approvedSandwiches.map((s) => (
              <li key={s.id}>
                <SandwichCreatorCard
                  id={s.id}
                  slug={s.slug}
                  title={s.title}
                  imageUrl={s.image_url}
                  biteCount={s.bite_count ?? 0}
                  isHot={hotSet.has(s.id)}
                  isFeatured={!!s.featured}
                  sparklineData={sparklineMap.get(s.id) ?? Array(7).fill(0)}
                  userId={user.id}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
