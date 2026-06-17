import Image from "next/image";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { DisplayNameEditor } from "@/components/DisplayNameEditor";
import { ViewTracker } from "@/components/ViewTracker";
import { SandwichCreatorCard } from "@/components/SandwichCreatorCard";
import { ProfileTeaser } from "@/components/ProfileTeaser";
import { interestingScore } from "@/lib/interesting-score";
import { computeBitemark } from "@/lib/bitemark";
import { todayET, formatDateET } from "@/lib/et-date";
import type { Point } from "@/lib/types";

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

  if (!user) {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("bitemap_session_id")?.value;
    const { count: biteCount } = sessionId
      ? await supabase.from("bites").select("*", { count: "exact", head: true }).eq("session_id", sessionId)
      : { count: 0 };

    return <ProfileTeaser biteCount={biteCount ?? 0} />;
  }

  const [
    { data: profile },
    { count: biteCount },
    { data: userSandwiches },
    { data: bitePercentiles },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url, creator_features").eq("id", user.id).single(),
    supabase.from("bites").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("sandwiches_with_count")
      .select("id, slug, title, approved, scheduled_for, first_featured_date, created_at, image_url, bite_count, creator_note, creator_url")
      .eq("uploaded_by", user.id)
      .order(sort === "bites" ? "bite_count" : "created_at", { ascending: false }),
    supabase.from("bites").select("uniqueness_percentile").eq("user_id", user.id).not("uniqueness_percentile", "is", null),
  ]);

  let approvedSandwiches = (userSandwiches ?? []).filter(s => s.approved);
  const pendingSandwiches = (userSandwiches ?? []).filter(s => !s.approved);
  const approvedIds = approvedSandwiches.map(s => s.id);

  const today = todayET();
  const todaysSlotIds = new Set<string>();
  const sparklineMap = new Map<string, number[]>();

  if (approvedIds.length > 0) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // Paginate recent bites — the default 1000-row cap would under-count
    // sandwiches that get heavy traffic in a short window.
    const PAGE = 1000;
    const recentBites: { sandwich_id: string; created_at: string }[] = [];
    const [{ data: todaysSlots }] = await Promise.all([
      supabase.from("daily_slots").select("sandwich_id").eq("date", today).in("sandwich_id", approvedIds),
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

    (todaysSlots ?? []).forEach(s => todaysSlotIds.add(s.sandwich_id));

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

  const bitemark = computeBitemark((bitePercentiles ?? []).map(b => b.uniqueness_percentile!));

  function statusLabel(s: { id: string; first_featured_date: string | null }) {
    if (todaysSlotIds.has(s.id)) return "Live today";
    if (s.first_featured_date && s.first_featured_date > today) return `Scheduled for ${formatDateET(s.first_featured_date)}`;
    return null;
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

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-9 text-center dark:border-stone-700 dark:bg-stone-800">
          <p className="text-xs text-stone-500 dark:text-stone-400">Bites Taken</p>
          <p className="mt-1 text-2xl font-bold">{biteCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-9 text-center dark:border-stone-700 dark:bg-stone-800">
          <p className="text-xs text-stone-500 dark:text-stone-400">Sandos Submitted</p>
          <p className="mt-1 text-2xl font-bold">{userSandwiches?.length ?? 0}</p>
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white px-6 py-8 text-center dark:border-stone-700 dark:bg-stone-800">
        <p className="text-xs text-stone-500 dark:text-stone-400">Your Bitemark</p>
        {bitemark.locked ? (
          <>
            <p className="mt-2 text-2xl font-bold text-stone-300 dark:text-stone-600">🔒 Locked</p>
            <p className="mt-2 text-stone-600 dark:text-stone-300">
              Take {bitemark.remaining} more bite{bitemark.remaining === 1 ? "" : "s"} to reveal your biting style.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-3xl text-orange-500" style={{ fontWeight: 800 }}>{bitemark.persona}</p>
            <p className="mt-2 text-stone-600 dark:text-stone-300">{bitemark.subhead}</p>
            <p className="mt-2 text-sm text-stone-400 dark:text-stone-500">
              More unique than {bitemark.score}% of biters
            </p>
          </>
        )}
      </div>

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
                  statusLabel={statusLabel(s)}
                  sparklineData={sparklineMap.get(s.id) ?? Array(7).fill(0)}
                  userId={user.id}
                  creatorFeatures={!!profile?.creator_features}
                  creatorNote={s.creator_note ?? null}
                  creatorUrl={s.creator_url ?? null}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
