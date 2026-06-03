import { createClient } from "@/lib/supabase/client";
import { getOrCreateSessionId } from "@/lib/session";

const NEW_USER_THRESHOLD = 2;
const POOL_SIZE = 5;

export async function pickNextSandwichId(
  currentId: string,
  supabase: ReturnType<typeof createClient>,
  userId: string | null
): Promise<string | null> {
  const sessionId = getOrCreateSessionId();

  const { data: all } = await supabase
    .from("sandwiches_with_count")
    .select("id, uploaded_by, bite_count")
    .eq("approved", true)
    .neq("id", currentId);

  if (!all?.length) return null;

  const allIds = all.map((s) => s.id);

  const bittenQuery = userId
    ? supabase.from("bites").select("sandwich_id").or(`user_id.eq.${userId},session_id.eq.${sessionId}`).in("sandwich_id", allIds)
    : supabase.from("bites").select("sandwich_id").eq("session_id", sessionId).in("sandwich_id", allIds);

  const { data: bitten } = await bittenQuery;

  const bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  const unbitten = all.filter((s) => !bittenIds.has(s.id));
  if (unbitten.length === 0) return null;

  // Priority 1: user's own uploaded sandwiches they haven't bitten yet
  if (userId) {
    const ownUnbitten = unbitten.filter((s) => s.uploaded_by === userId);
    if (ownUnbitten.length > 0) {
      return ownUnbitten[Math.floor(Math.random() * ownUnbitten.length)].id;
    }
  }

  // Priority 2: new users see popular maps; experienced users fill in sparse ones
  const isNewUser = bittenIds.size < NEW_USER_THRESHOLD;
  const sorted = [...unbitten].sort((a, b) =>
    isNewUser
      ? (b.bite_count ?? 0) - (a.bite_count ?? 0)
      : (a.bite_count ?? 0) - (b.bite_count ?? 0)
  );
  const pool = sorted.slice(0, Math.min(POOL_SIZE, sorted.length));
  return pool[Math.floor(Math.random() * pool.length)].id;
}
