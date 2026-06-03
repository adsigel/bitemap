import { createClient } from "@/lib/supabase/client";
import { getOrCreateSessionId } from "@/lib/session";

export async function pickNextSandwichId(
  currentId: string,
  supabase: ReturnType<typeof createClient>,
  userId: string | null
): Promise<string | null> {
  const sessionId = getOrCreateSessionId();

  const { data: all } = await supabase
    .from("sandwiches")
    .select("id")
    .eq("approved", true)
    .neq("id", currentId);

  if (!all?.length) return null;

  const allIds = all.map((s) => s.id);
  const bittenQuery = userId
    ? supabase.from("bites").select("sandwich_id").eq("user_id", userId).in("sandwich_id", allIds)
    : supabase.from("bites").select("sandwich_id").eq("session_id", sessionId).in("sandwich_id", allIds);

  const { data: bitten } = await bittenQuery;

  const bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  const unbitten = all.filter((s) => !bittenIds.has(s.id));
  const pool = unbitten.length > 0 ? unbitten : all;

  return pool[Math.floor(Math.random() * pool.length)].id;
}
