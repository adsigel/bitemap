import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { rolloverDay, fillPipeline, scheduleOrphanedApprovals, todayET, addDays, etDayBounds, formatDateET } from "@/lib/daily-set";
import { getUploaderEmail, getMarketingEmailRecipient } from "@/lib/sandwich-actions";
import { emailHtml, unsubscribeUrl, withEmailSource } from "@/lib/email-template";

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
    const email = await getMarketingEmailRecipient(supabase, sandwich.uploaded_by);
    if (!email) continue;

    const sandwichUrl = `https://bitemap.food/sandwich/${sandwich.slug ?? sandwich.id}`;
    const unsubUrl = unsubscribeUrl(sandwich.uploaded_by);
    const { error } = await resend.emails.send({
      from: "Adam @ Bitemap <hello@bitemap.food>",
      to: email,
      subject: `${sandwich.title} ranked #${r.rank} yesterday 🏆`,
      html: emailHtml({
        intro: `<strong>${sandwich.title}</strong> ranked #${r.rank} of yesterday's 5 with ${r.bite_count} bite${r.bite_count === 1 ? "" : "s"}. Here's how the full day played out:<br><br>${rankingsHtml}`,
        ctaText: "See who's biting",
        ctaUrl: withEmailSource(sandwichUrl, "recap_uploader"),
        unsubscribeUrl: unsubUrl,
      }),
      text: `${sandwich.title} ranked #${r.rank} of yesterday's 5 with ${r.bite_count} bites.\n\nSee who's biting: ${withEmailSource(sandwichUrl, "recap_uploader")}\n\nUnsubscribe from these emails: ${unsubUrl}`,
      tags: [
        { name: "notification", value: "recap_uploader" },
        { name: "user_id", value: sandwich.uploaded_by },
      ],
    });
    if (error) console.error("Resend error:", error);
  }

  // Biter version: anyone else (authed) who bit at least one of that day's 5.
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

  const dateLabel = formatDateET(day);
  for (const userId of biterIds) {
    const email = await getMarketingEmailRecipient(supabase, userId);
    if (!email) continue;

    const unsubUrl = unsubscribeUrl(userId);
    const homeUrl = withEmailSource("https://bitemap.food", "recap_biter");
    const uploadUrl = withEmailSource("https://bitemap.food/upload", "recap_biter");
    const { error } = await resend.emails.send({
      from: "Adam @ Bitemap <hello@bitemap.food>",
      to: email,
      subject: `Bitemap Leaderboard for ${dateLabel} 🏆`,
      html: emailHtml({
        intro: `Thanks for biting with us. Here's how yesterday's 5 finished up:<br><br>${rankingsHtml}<br><br><a href="${homeUrl}" style="color:#1c1917;text-decoration:underline;">A new set of 5 is already live — come take a look.</a><br><br>Ever wondered where people would bite your sandwich?`,
        ctaText: "Upload a sandwich",
        ctaUrl: uploadUrl,
        signoff: "Thanks for biting,",
        unsubscribeUrl: unsubUrl,
      }),
      text: `Thanks for biting with us. Here's how yesterday's 5 finished up:\n\n${rankingsHtml.replace(/<br>/g, "\n")}\n\nA new set of 5 is already live — come take a look: ${homeUrl}\n\nEver wondered where people would bite your sandwich? Upload a sandwich: ${uploadUrl}\n\nUnsubscribe from these emails: ${unsubUrl}`,
      tags: [
        { name: "notification", value: "recap_biter" },
        { name: "user_id", value: userId },
      ],
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
        intro: `<strong>${sandwich.title}</strong> is live on Bitemap today. Be sure to post about it on social and share with friends and watch the map fill in.`,
        ctaText: "Share my sando",
        ctaUrl: withEmailSource(`${sandwichUrl}?share=1`, "live"),
        secondaryText: "See who's biting",
        secondaryUrl: withEmailSource(sandwichUrl, "live"),
      }),
      text: `${sandwich.title} is live on Bitemap today. Be sure to post about it on social and share with friends and watch the map fill in.\n\nShare my sando: ${withEmailSource(`${sandwichUrl}?share=1`, "live")}\nSee who's biting: ${withEmailSource(sandwichUrl, "live")}`,
      tags: [
        { name: "notification", value: "live" },
        { name: "user_id", value: sandwich.uploaded_by },
      ],
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

  // Self-heal: catch any approval that committed `approved = true` but
  // never finished scheduling (e.g. an interrupted request). Fixes the
  // data immediately, but deliberately does NOT email the uploaders --
  // a backlog of these could otherwise turn into a surprise bulk-send to
  // people who uploaded a while ago. Alert admin instead so a human
  // decides whether/how to follow up.
  const fixedOrphans = await scheduleOrphanedApprovals(supabase);
  if (fixedOrphans.length > 0) {
    const summary = fixedOrphans
      .map((o) => `- "${o.title}" -> ${o.scheduledFor} (uploaded_by: ${o.uploaded_by ?? "admin"})`)
      .join("\n");
    const { error } = await resend.emails.send({
      from: "Bitemap <hello@bitemap.food>",
      to: "hello@bitemap.food",
      subject: `⚠️ ${fixedOrphans.length} sandwich${fixedOrphans.length === 1 ? "" : "es"} self-healed from stuck approval`,
      text: `These were approved but never finished scheduling, likely from an interrupted request. The rollover cron just fixed the scheduling, but deliberately didn't email the uploaders -- you may want to reach out manually if any of these are real users, not test data.\n\n${summary}`,
      tags: [{ name: "notification", value: "orphan_self_heal_alert" }],
    });
    if (error) console.error("Resend error:", error);
  }

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

  return NextResponse.json({ closedDay, newToday, fixedOrphans: fixedOrphans.map((o) => o.id) });
}
