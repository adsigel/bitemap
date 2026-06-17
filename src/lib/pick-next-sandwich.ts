import { createClient } from "@/lib/supabase/client";
import { getOrCreateSessionId } from "@/lib/session";
import { todayET } from "@/lib/et-date";

export async function pickNextSandwichId(
  currentId: string,
  supabase: ReturnType<typeof createClient>,
  userId: string | null
): Promise<string | null> {
  const sessionId = getOrCreateSessionId();

  const { data: slots } = await supabase.from("daily_slots").select("sandwich_id").eq("date", todayET());
  if (!slots?.length) return null;

  const todaysIds = slots.map((s) => s.sandwich_id).filter((id) => id !== currentId);
  if (todaysIds.length === 0) return null;

  const bittenQuery = userId
    ? supabase
        .from("bites")
        .select("sandwich_id")
        .or(`user_id.eq.${userId},session_id.eq.${sessionId}`)
        .in("sandwich_id", todaysIds)
    : supabase.from("bites").select("sandwich_id").eq("session_id", sessionId).in("sandwich_id", todaysIds);

  const { data: bitten } = await bittenQuery;
  const bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  const unbitten = todaysIds.filter((id) => !bittenIds.has(id));

  if (unbitten.length === 0) return null;
  return unbitten[Math.floor(Math.random() * unbitten.length)];
}

/**
 * Backlog version for the /explore offramp: any approved sandwich that was
 * first featured before today and isn't part of today's daily set.
 */
export async function pickNextBacklogSandwichId(
  currentId: string,
  supabase: ReturnType<typeof createClient>,
  userId: string | null
): Promise<string | null> {
  const sessionId = getOrCreateSessionId();
  const today = todayET();

  const [{ data: todays }, { data: backlog }] = await Promise.all([
    supabase.from("daily_slots").select("sandwich_id").eq("date", today),
    supabase.from("sandwiches").select("id").eq("approved", true).lt("first_featured_date", today),
  ]);

  const todaysIds = new Set((todays ?? []).map((s) => s.sandwich_id));
  const candidateIds = (backlog ?? [])
    .map((s) => s.id)
    .filter((id) => id !== currentId && !todaysIds.has(id));

  if (candidateIds.length === 0) return null;

  const bittenQuery = userId
    ? supabase
        .from("bites")
        .select("sandwich_id")
        .or(`user_id.eq.${userId},session_id.eq.${sessionId}`)
        .in("sandwich_id", candidateIds)
    : supabase.from("bites").select("sandwich_id").eq("session_id", sessionId).in("sandwich_id", candidateIds);

  const { data: bitten } = await bittenQuery;
  const bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  const unbitten = candidateIds.filter((id) => !bittenIds.has(id));

  if (unbitten.length === 0) return null;
  return unbitten[Math.floor(Math.random() * unbitten.length)];
}
