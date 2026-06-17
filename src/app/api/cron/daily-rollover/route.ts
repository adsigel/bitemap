import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { rolloverDay, fillPipeline, todayET, addDays, etDayBounds } from "@/lib/daily-set";
import { getUploaderEmail } from "@/lib/sandwich-actions";
import { emailHtml } from "@/lib/email-template";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SandwichInfo {
  id: string;
  title: string;
  slug: string | null;
  uploaded_by: string | null;
}

async function sendRecapEmails(supabase: ReturnType<typeof createAdminClient>, day: string) {
  const { data: results } = await supabase
    .from("daily_leaderboard_results")
    .select("sandwich_id, bite_count, rank")
    .eq("date", day)
    .order("rank", { ascending: true });
  if (!results?.length) return;

  const sandwichIds = results.map((r) => r.sandwich_id);
  const { data: sandwiches } = await supabase
    .from("sandwiches")
    .select("id, title, slug, uploaded_by")
    .in("id", sandwichIds);
  const sandwichMap = new Map((sandwiches ?? []).map((s) => [s.id, s as SandwichInfo]));

  const rankingsHtml = results
    .map((r) => `${r.rank}. ${sandwichMap.get(r.sandwich_id)?.title ?? "Sandwich"} — ${r.bite_count} bite${r.bite_count === 1 ? "" : "s"}`)
    .join("<br>");

  const uploaderIds = new Set<string>();
  for (const r of results) {
    const uploadedBy = sandwichMap.get(r.sandwich_id)?.uploaded_by;
    if (uploadedBy) uploaderIds.add(uploadedBy);
  }

  // Uploader version: how their own sandwich placed.
  for (const r of results) {
    const sandwich = sandwichMap.get(r.sandwich_id);
    if (!sandwich?.uploaded_by) continue;
    const email = await getUploaderEmail(supabase, sandwich.uploaded_by);
    if (!email) continue;

    const sandwichUrl = `https://bitemap.food/sandwich/${sandwich.slug ?? sandwich.id}`;
    const { error } = await resend.emails.send({
      from: "Adam @ Bitemap <hello@bitemap.food>",
      to: email,
      subject: `${sandwich.title} ranked #${r.rank} today 🏆`,
      html: emailHtml({
        intro: `<strong>${sandwich.title}</strong> ranked #${r.rank} of today's 5 with ${r.bite_count} bite${r.bite_count === 1 ? "" : "s"}. Here's how the full day played out:<br><br>${rankingsHtml}`,
        ctaText: "See who's biting",
        ctaUrl: sandwichUrl,
      }),
      text: `${sandwich.title} ranked #${r.rank} of today's 5 with ${r.bite_count} bites.\n\nSee who's biting: ${sandwichUrl}`,
    });
    if (error) console.error("Resend error:", error);
  }

  // Biter version: anyone else (authed) who bit at least one of today's 5.
  const { start, end } = etDayBounds(day);
  const { data: dayBites } = await supabase
    .from("bites")
    .select("user_id")
    .in("sandwich_id", sandwichIds)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .not("user_id", "is", null);

  const biterIds = new Set(
    (dayBites ?? [])
      .map((b) => b.user_id as string)
      .filter((id) => !uploaderIds.has(id))
  );

  for (const userId of biterIds) {
    const email = await getUploaderEmail(supabase, userId);
    if (!email) continue;

    const { error } = await resend.emails.send({
      from: "Adam @ Bitemap <hello@bitemap.food>",
      to: email,
      subject: "Today's leaderboard 🏆",
      html: emailHtml({
        intro: `Here's how today's 5 sandwiches stacked up:<br><br>${rankingsHtml}`,
        ctaText: "Explore older sandos",
        ctaUrl: "https://bitemap.food/explore",
      }),
      text: `Here's how today's 5 sandwiches stacked up:\n\n${rankingsHtml.replace(/<br>/g, "\n")}\n\nExplore older sandos: https://bitemap.food/explore`,
    });
    if (error) console.error("Resend error:", error);
  }
}

async function sendLiveEmails(supabase: ReturnType<typeof createAdminClient>, day: string) {
  const { data: newSlots } = await supabase
    .from("daily_slots")
    .select("sandwich_id")
    .eq("date", day)
    .eq("is_new_release", true);
  if (!newSlots?.length) return;

  for (const { sandwich_id } of newSlots) {
    const { data: sandwich } = await supabase
      .from("sandwiches")
      .select("title, slug, uploaded_by, live_notified_at")
      .eq("id", sandwich_id)
      .single();
    if (!sandwich?.uploaded_by || sandwich.live_notified_at) continue;

    const email = await getUploaderEmail(supabase, sandwich.uploaded_by);
    if (!email) continue;

    const sandwichUrl = `https://bitemap.food/sandwich/${sandwich.slug ?? sandwich_id}`;
    const { error } = await resend.emails.send({
      from: "Adam @ Bitemap <hello@bitemap.food>",
      to: email,
      subject: `${sandwich.title} is live today — go get your first bites`,
      html: emailHtml({
        intro: `<strong>${sandwich.title}</strong> is live on Bitemap today. Share it with friends and watch the map fill in.`,
        ctaText: "Share my sando",
        ctaUrl: `${sandwichUrl}?share=1`,
        secondaryText: "See who's biting",
        secondaryUrl: sandwichUrl,
      }),
      text: `${sandwich.title} is live on Bitemap today. Share it with friends and watch the map fill in.\n\nShare my sando: ${sandwichUrl}?share=1\nSee who's biting: ${sandwichUrl}`,
    });
    if (error) console.error("Resend error:", error);

    await supabase.from("sandwiches").update({ live_notified_at: new Date().toISOString() }).eq("id", sandwich_id);
  }
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const dayToClose = addDays(todayET(), -1);

  const { data: existingSnapshot } = await supabase
    .from("daily_leaderboard_results")
    .select("sandwich_id")
    .eq("date", dayToClose)
    .limit(1);
  const alreadyClosed = (existingSnapshot?.length ?? 0) > 0;

  const closedDay = await rolloverDay(supabase);
  if (closedDay && !alreadyClosed) {
    await sendRecapEmails(supabase, closedDay);
  }

  const newToday = todayET();
  await sendLiveEmails(supabase, newToday);
  await fillPipeline(supabase);

  return NextResponse.json({ closedDay, newToday });
}
