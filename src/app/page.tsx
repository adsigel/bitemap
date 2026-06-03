import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();

  const [{ data: sandwiches }, { data: { user } }] = await Promise.all([
    supabase.from("sandwiches").select("id").eq("approved", true),
    supabase.auth.getUser(),
  ]);

  if (!sandwiches?.length) {
    return (
      <div className="py-24 text-center text-stone-400">
        No sandwiches yet. Check back soon.
      </div>
    );
  }

  const allIds = sandwiches.map((s) => s.id);
  let bittenIds: Set<string> = new Set();

  if (user) {
    const { data: bitten } = await supabase
      .from("bites")
      .select("sandwich_id")
      .eq("user_id", user.id)
      .in("sandwich_id", allIds);
    bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  } else {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get("bitemap_session_id")?.value;
    if (sessionId) {
      const { data: bitten } = await supabase
        .from("bites")
        .select("sandwich_id")
        .eq("session_id", sessionId)
        .in("sandwich_id", allIds);
      bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
    }
  }

  const unbitten = sandwiches.filter((s) => !bittenIds.has(s.id));
  const pool = unbitten.length > 0 ? unbitten : sandwiches;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  redirect(`/sandwich/${pick.id}`);
}
