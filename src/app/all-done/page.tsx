import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { KillScreen, type RecommendedSandwich } from "@/components/KillScreen";

export const dynamic = "force-dynamic";

export default async function AllDonePage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("bitemap_session_id")?.value;

  const { data: { user } } = await supabase.auth.getUser();

  let recommended: RecommendedSandwich[] = [];

  const hasIdentity = user || sessionId;
  if (hasIdentity) {
    const bitesQuery = user
      ? supabase
          .from("bites")
          .select("sandwich_id, created_at")
          .or(
            sessionId
              ? `user_id.eq.${user.id},session_id.eq.${sessionId}`
              : `user_id.eq.${user.id}`
          )
      : supabase
          .from("bites")
          .select("sandwich_id, created_at")
          .eq("session_id", sessionId!);

    const { data: userBites } = await bitesQuery;

    if (userBites?.length) {
      const bittenIds = userBites.map((b) => b.sandwich_id);
      const userBiteMap = new Map(userBites.map((b) => [b.sandwich_id, b.created_at]));
      const earliestBite = userBites.reduce(
        (min, b) => (b.created_at < min ? b.created_at : min),
        userBites[0].created_at
      );

      const [{ data: sandwichDetails }, { data: laterBites }] = await Promise.all([
        supabase
          .from("sandwiches_with_count")
          .select("id, title, image_url, slug, bite_count")
          .in("id", bittenIds)
          .eq("approved", true),
        supabase
          .from("bites")
          .select("sandwich_id, created_at")
          .in("sandwich_id", bittenIds)
          .gt("created_at", earliestBite),
      ]);

      // Count bites that arrived after the user's own bite on each sandwich
      const newBiteCount = new Map<string, number>();
      laterBites?.forEach((b) => {
        const userBiteTime = userBiteMap.get(b.sandwich_id);
        if (userBiteTime && b.created_at > userBiteTime) {
          newBiteCount.set(b.sandwich_id, (newBiteCount.get(b.sandwich_id) ?? 0) + 1);
        }
      });

      recommended = (sandwichDetails ?? [])
        .sort((a, b) => {
          const delta = (newBiteCount.get(b.id) ?? 0) - (newBiteCount.get(a.id) ?? 0);
          if (delta !== 0) return delta;
          return (b.bite_count ?? 0) - (a.bite_count ?? 0);
        })
        .slice(0, 6)
        .map((s) => ({
          id: s.id,
          slug: s.slug ?? null,
          title: s.title,
          imageUrl: s.image_url,
          newBites: newBiteCount.get(s.id) ?? 0,
        }));
    }
  }

  return <KillScreen recommended={recommended} />;
}
