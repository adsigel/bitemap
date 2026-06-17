import { createClient } from "@/lib/supabase/server";
import { DailyLeaderboard, type LeaderboardEntry } from "@/components/DailyLeaderboard";
import { ViewTracker } from "@/components/ViewTracker";
import { todayET, etDayBounds } from "@/lib/et-date";

export const dynamic = "force-dynamic";

export default async function AllDonePage() {
  const supabase = await createClient();
  const today = todayET();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: slots } = await supabase.from("daily_slots").select("sandwich_id").eq("date", today);
  const todaysIds = (slots ?? []).map((s) => s.sandwich_id);

  if (todaysIds.length === 0) {
    return (
      <div className="py-24 text-center text-stone-400">
        No sandwiches today. Check back soon.
      </div>
    );
  }

  // Prefer the frozen end-of-day snapshot if rollover already ran for today
  // (shouldn't normally happen mid-day, but defends against clock skew /
  // a late page render right at the boundary). Otherwise count live.
  const { data: snapshot } = await supabase
    .from("daily_leaderboard_results")
    .select("sandwich_id, bite_count, rank")
    .eq("date", today);

  const { data: sandwiches } = await supabase
    .from("sandwiches")
    .select("id, title, image_url, slug, uploaded_by")
    .in("id", todaysIds);

  const sandwichById = new Map((sandwiches ?? []).map((s) => [s.id, s]));

  const uploaderIds = [...new Set((sandwiches ?? []).map((s) => s.uploaded_by).filter((id): id is string => !!id))];
  const { data: uploaderProfiles } =
    uploaderIds.length > 0
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", uploaderIds)
      : { data: [] };
  const uploaderById = new Map((uploaderProfiles ?? []).map((p) => [p.id, p]));

  let counts: { sandwich_id: string; bite_count: number }[];
  const isFinal = (snapshot?.length ?? 0) > 0;

  if (isFinal) {
    counts = snapshot!.map((r) => ({ sandwich_id: r.sandwich_id, bite_count: r.bite_count }));
  } else {
    const { start, end } = etDayBounds(today);
    counts = await Promise.all(
      todaysIds.map(async (id) => {
        const { count } = await supabase
          .from("bites")
          .select("*", { count: "exact", head: true })
          .eq("sandwich_id", id)
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString());
        return { sandwich_id: id, bite_count: count ?? 0 };
      })
    );
  }

  counts.sort((a, b) => b.bite_count - a.bite_count);

  const entries: LeaderboardEntry[] = counts
    .map((c, i) => {
      const sandwich = sandwichById.get(c.sandwich_id);
      if (!sandwich) return null;
      const uploader = sandwich.uploaded_by ? uploaderById.get(sandwich.uploaded_by) : null;
      return {
        id: sandwich.id,
        slug: sandwich.slug ?? null,
        title: sandwich.title,
        imageUrl: sandwich.image_url,
        biteCount: c.bite_count,
        rank: i + 1,
        isOwn: !!user && sandwich.uploaded_by === user.id,
        uploaderName: uploader?.display_name ?? null,
        uploaderAvatarUrl: uploader?.avatar_url ?? null,
      };
    })
    .filter((e): e is LeaderboardEntry => e !== null);

  return (
    <>
      <ViewTracker event="Daily Leaderboard Viewed" />
      <DailyLeaderboard entries={entries} isFinal={isFinal} isAuthed={!!user} />
    </>
  );
}
