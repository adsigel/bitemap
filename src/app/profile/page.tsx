import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DisplayNameEditor } from "@/components/DisplayNameEditor";
import { ViewTracker } from "@/components/ViewTracker";

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
      .select("id, slug, title, approved, created_at, image_url, bite_count")
      .eq("uploaded_by", user.id)
      .order(sort === "bites" ? "bite_count" : "created_at", { ascending: false }),
    supabase.from("bites").select("sandwich_id, x, y").eq("user_id", user.id),
  ]);

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

      {userSandwiches && userSandwiches.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Your Sandos</h2>
            <div className="flex gap-3 text-sm">
              <a
                href="/profile"
                className={sort !== "bites" ? "font-medium text-orange-500" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"}
              >
                Most recent
              </a>
              <a
                href="/profile?sort=bites"
                className={sort === "bites" ? "font-medium text-orange-500" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"}
              >
                Most bitten
              </a>
            </div>
          </div>
          <ul className="space-y-2">
            {userSandwiches.map((s) => {
              const card = (
                <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-800">
                  <div
                    className="relative shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-700"
                    style={{ width: 56, height: 56 }}
                  >
                    {s.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.image_url}
                        alt={s.title}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-800 dark:text-stone-100">{s.title}</p>
                    <p className="text-sm text-stone-500 dark:text-stone-400">
                      {s.bite_count ?? 0} {(s.bite_count ?? 0) === 1 ? "bite" : "bites"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.approved
                      ? "bg-green-100 text-green-700"
                      : "bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400"
                  }`}>
                    {s.approved ? "Approved" : "Pending"}
                  </span>
                </div>
              );
              return (
                <li key={s.id}>
                  {s.approved ? (
                    <a href={`/sandwich/${s.slug ?? s.id}`} className="block transition hover:opacity-80">
                      {card}
                    </a>
                  ) : (
                    card
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
