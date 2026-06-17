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
