import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const NEW_USER_THRESHOLD = 2;
const POOL_SIZE = 5;

export default async function HomePage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("bitemap_session_id")?.value;

  const [{ data: all }, { data: { user } }] = await Promise.all([
    supabase.from("sandwiches_with_count").select("id, uploaded_by, bite_count").eq("approved", true),
    supabase.auth.getUser(),
  ]);

  if (!all?.length) {
    return (
      <div className="py-24 text-center text-stone-400">
        No sandwiches yet. Check back soon.
      </div>
    );
  }

  const allIds = all.map((s) => s.id);
  let bittenIds: Set<string> = new Set();

  if (user) {
    const filter = sessionId
      ? `user_id.eq.${user.id},session_id.eq.${sessionId}`
      : `user_id.eq.${user.id}`;
    const { data: bitten } = await supabase
      .from("bites")
      .select("sandwich_id")
      .or(filter)
      .in("sandwich_id", allIds);
    bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  } else if (sessionId) {
    const { data: bitten } = await supabase
      .from("bites")
      .select("sandwich_id")
      .eq("session_id", sessionId)
      .in("sandwich_id", allIds);
    bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  }

  const unbitten = all.filter((s) => !bittenIds.has(s.id));
  if (unbitten.length === 0 && bittenIds.size > 0) redirect("/all-done");
  if (unbitten.length === 0) {
    redirect(`/sandwich/${all[Math.floor(Math.random() * all.length)].id}`);
  }

  // Priority 1: user's own uploaded sandwiches they haven't bitten yet
  if (user) {
    const ownUnbitten = unbitten.filter((s) => s.uploaded_by === user.id);
    if (ownUnbitten.length > 0) {
      const pick = ownUnbitten[Math.floor(Math.random() * ownUnbitten.length)];
      redirect(`/sandwich/${pick.id}`);
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
  const pick = pool[Math.floor(Math.random() * pool.length)];
  redirect(`/sandwich/${pick.id}`);
}
