import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { todayET } from "@/lib/et-date";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("bitemap_session_id")?.value;
  const today = todayET();

  const [{ data: todays }, { data: backlog }, { data: { user } }] = await Promise.all([
    supabase.from("daily_slots").select("sandwich_id").eq("date", today),
    supabase.from("sandwiches").select("id").eq("approved", true).lt("first_featured_date", today),
    supabase.auth.getUser(),
  ]);

  const todaysIds = new Set((todays ?? []).map((s) => s.sandwich_id));
  const candidateIds = (backlog ?? []).map((s) => s.id).filter((id) => !todaysIds.has(id));

  if (candidateIds.length === 0) {
    return (
      <div className="py-24 text-center text-stone-400">
        Nothing else to explore right now. Check back tomorrow for a new daily set.
      </div>
    );
  }

  let bittenIds: Set<string> = new Set();
  if (user) {
    const filter = sessionId
      ? `user_id.eq.${user.id},session_id.eq.${sessionId}`
      : `user_id.eq.${user.id}`;
    const { data: bitten } = await supabase
      .from("bites")
      .select("sandwich_id")
      .or(filter)
      .in("sandwich_id", candidateIds);
    bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  } else if (sessionId) {
    const { data: bitten } = await supabase
      .from("bites")
      .select("sandwich_id")
      .eq("session_id", sessionId)
      .in("sandwich_id", candidateIds);
    bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  }

  const unbitten = candidateIds.filter((id) => !bittenIds.has(id));

  if (unbitten.length === 0) {
    return (
      <div className="py-24 text-center text-stone-400">
        You&apos;ve bitten everything in the backlog too. Check back tomorrow for a new daily set.
      </div>
    );
  }

  const pick = unbitten[Math.floor(Math.random() * unbitten.length)];
  redirect(`/sandwich/${pick}?mode=explore`);
}
