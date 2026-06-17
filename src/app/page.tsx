import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { todayET } from "@/lib/et-date";

export const dynamic = "force-dynamic";

const BOT_UA = /facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|WhatsApp|TelegramBot|Applebot|Discordbot|bot|crawl|spider/i;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ account_created?: string }>;
}) {
  const ua = (await headers()).get("user-agent") ?? "";
  if (BOT_UA.test(ua)) redirect("/welcome");

  const { account_created } = await searchParams;
  const accountCreatedSuffix = account_created === "1" ? "?account_created=1" : "";

  const supabase = await createClient();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("bitemap_session_id")?.value;

  const today = todayET();
  const [{ data: slots }, { data: { user } }] = await Promise.all([
    supabase.from("daily_slots").select("sandwich_id").eq("date", today),
    supabase.auth.getUser(),
  ]);

  if (!slots?.length) {
    return (
      <div className="py-24 text-center text-stone-400">
        No sandwiches yet. Check back soon.
      </div>
    );
  }

  const todaysIds = slots.map((s) => s.sandwich_id);
  let bittenIds: Set<string> = new Set();

  if (user) {
    const filter = sessionId
      ? `user_id.eq.${user.id},session_id.eq.${sessionId}`
      : `user_id.eq.${user.id}`;
    const { data: bitten } = await supabase
      .from("bites")
      .select("sandwich_id")
      .or(filter)
      .in("sandwich_id", todaysIds);
    bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  } else if (sessionId) {
    const { data: bitten } = await supabase
      .from("bites")
      .select("sandwich_id")
      .eq("session_id", sessionId)
      .in("sandwich_id", todaysIds);
    bittenIds = new Set(bitten?.map((b) => b.sandwich_id) ?? []);
  }

  const unbitten = todaysIds.filter((id) => !bittenIds.has(id));
  if (unbitten.length === 0) redirect("/all-done");

  const pick = unbitten[Math.floor(Math.random() * unbitten.length)];
  redirect(`/sandwich/${pick}${accountCreatedSuffix}`);
}
