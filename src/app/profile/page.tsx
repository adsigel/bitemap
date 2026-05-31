import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DisplayNameEditor } from "@/components/DisplayNameEditor";
import { ProfileViewTracker } from "@/components/ProfileViewTracker";

function computePercentile(my: { x: number; y: number }, others: { x: number; y: number }[]): number {
  if (others.length === 0) return 50;
  const cx = others.reduce((s, b) => s + b.x, 0) / others.length;
  const cy = others.reduce((s, b) => s + b.y, 0) / others.length;
  const myDist = Math.hypot(my.x - cx, my.y - cy);
  const moreCentral = others.filter((b) => Math.hypot(b.x - cx, b.y - cy) < myDist).length;
  return Math.round((moreCentral / others.length) * 100);
}

export default async function ProfilePage() {
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
      .from("sandwiches")
      .select("id, title, approved, created_at")
      .eq("uploaded_by", user.id)
      .order("created_at", { ascending: false }),
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
      <ProfileViewTracker />
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
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-center">
          <p className="text-2xl font-bold">{biteCount ?? 0}</p>
          <p className="text-xs text-stone-500">Bites Taken</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-center">
          <p className="text-2xl font-bold">{userSandwiches?.length ?? 0}</p>
          <p className="text-xs text-stone-500">Sandos Submitted</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-4 text-center">
          {commonalityScore !== null ? (
            <>
              <p className="text-2xl font-bold">{commonalityScore}</p>
              <p className="text-xs text-stone-500">Bitemark</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-stone-300">—</p>
              <p className="text-xs text-stone-500">Bitemark</p>
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
          <h2 className="mb-3 font-semibold">Your Sandos</h2>
          <ul className="space-y-2">
            {userSandwiches.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3"
              >
                <span className="mr-3 truncate font-medium text-stone-800">{s.title}</span>
                <div className="flex shrink-0 items-center gap-2">
                  {s.approved ? (
                    <>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Approved
                      </span>
                      <a
                        href={`/sandwich/${s.id}`}
                        className="text-sm text-orange-500 hover:underline"
                      >
                        View
                      </a>
                    </>
                  ) : (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                      Pending
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
