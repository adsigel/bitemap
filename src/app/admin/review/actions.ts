"use server";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { emailHtml } from "@/lib/email-template";
import { trackServer } from "@/lib/track-server";
import { assignToSchedule, fillPipeline, todayET } from "@/lib/daily-set";

const resend = new Resend(process.env.RESEND_API_KEY);

function formatScheduledDate(day: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
}

export async function renameSandwich(id: string, formData: FormData) {
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;
  const supabase = createAdminClient();
  await supabase.from("sandwiches").update({ title }).eq("id", id);
  revalidatePath("/admin/review");
}

export async function approveSandwich(id: string) {
  const supabase = createAdminClient();

  const { data: sandwich } = await supabase
    .from("sandwiches")
    .select("uploaded_by, title, slug")
    .eq("id", id)
    .single();

  await supabase.from("sandwiches").update({ approved: true }).eq("id", id);

  // Approval no longer means "live" -- it means "eligible to be scheduled."
  // assignToSchedule places it in the next pipeline day with an open slot
  // (respecting the per-uploader-per-day cap), then fillPipeline tops up
  // any other pipeline days that are short on repeat-pool sandwiches.
  const scheduledFor = await assignToSchedule(supabase, id);
  await fillPipeline(supabase);

  if (sandwich?.uploaded_by) {
    const { data: authData } = await supabase.auth.admin.getUserById(sandwich.uploaded_by);
    const email = authData?.user?.email;
    if (email) {
      const sandwichUrl = `https://bitemap.food/sandwich/${sandwich.slug ?? id}`;
      const dateLabel = formatScheduledDate(scheduledFor);
      const { error: emailError } = await resend.emails.send({
        from: "Adam @ Bitemap <hello@bitemap.food>",
        to: email,
        subject: `Your sandwich is scheduled for ${dateLabel} 🥪`,
        html: emailHtml({
          intro: `<strong>${sandwich.title}</strong> passed review and is scheduled to go live on <strong>${dateLabel}</strong>. We'll email you again the moment it's live.`,
          ctaText: "See who's biting",
          ctaUrl: sandwichUrl,
        }),
        text: `${sandwich.title} passed review and is scheduled to go live on ${dateLabel}. We'll email you again the moment it's live.\n\nSee who's biting: ${sandwichUrl}`,
      });
      if (emailError) console.error("Resend error:", emailError);
    }
  }

  revalidatePath("/admin/review");
}

export async function saveBounds(id: string, points: { x: number; y: number }[] | null) {
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("sandwiches").update({ bite_bounds: points }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/review");
}

export async function approveWithBounds(id: string, bounds: { x: number; y: number }[] | null) {
  if (bounds && bounds.length >= 3) {
    const supabase = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("sandwiches").update({ bite_bounds: bounds }).eq("id", id);
  }
  await approveSandwich(id);
}

export async function toggleFeatured(id: string, featured: boolean) {
  const supabase = createAdminClient();
  await supabase.from("sandwiches").update({ featured }).eq("id", id);

  // toggleFeatured is always called with the inverse of the current value
  // (see admin/review/page.tsx), so featured === true here is always a
  // genuine false -> true transition, not a re-toggle.
  if (featured) {
    const { data: sandwich } = await supabase
      .from("sandwiches")
      .select("uploaded_by, title, slug")
      .eq("id", id)
      .single();

    if (sandwich?.uploaded_by) {
      const { data: authData } = await supabase.auth.admin.getUserById(sandwich.uploaded_by);
      const email = authData?.user?.email;
      if (email) {
        const sandwichUrl = `https://bitemap.food/sandwich/${sandwich.slug ?? id}`;
        const { error: emailError } = await resend.emails.send({
          from: "Adam @ Bitemap <hello@bitemap.food>",
          to: email,
          subject: `🏆 ${sandwich.title} got featured`,
          html: emailHtml({
            intro: `<strong>${sandwich.title}</strong> just got featured on Bitemap. Brag a little — share it with friends.`,
            ctaText: "Share my sando",
            ctaUrl: `${sandwichUrl}?share=1`,
            secondaryText: "See who's biting",
            secondaryUrl: sandwichUrl,
          }),
          text: `${sandwich.title} just got featured on Bitemap. Brag a little — share it with friends.\n\nShare my sando: ${sandwichUrl}?share=1\nSee who's biting: ${sandwichUrl}`,
        });
        if (emailError) console.error("Resend error:", emailError);
        await trackServer(sandwich.uploaded_by, "User Notified", { notification: "Sandwich Featured" });
      }
    }
  }

  revalidatePath("/admin/review");
}

// Repeat-pool slots on future (not-yet-live) days can be swapped for a
// different backlog sandwich; new-release slots and today's live day are
// not editable here. Removing just opens the slot back up -- fillPipeline
// immediately backfills it from the next-best backlog candidate.
export async function removeRepeatSlot(date: string, sandwichId: string) {
  if (date <= todayET()) return;

  const supabase = createAdminClient();
  const { data: slot } = await supabase
    .from("daily_slots")
    .select("is_new_release")
    .eq("date", date)
    .eq("sandwich_id", sandwichId)
    .maybeSingle();
  if (!slot || slot.is_new_release) return;

  await supabase.from("daily_slots").delete().eq("date", date).eq("sandwich_id", sandwichId);
  await fillPipeline(supabase);
  revalidatePath("/admin/review");
}

export async function unpublishSandwich(id: string) {
  const supabase = createAdminClient();
  await supabase.from("sandwiches").update({ approved: false }).eq("id", id);
  revalidatePath("/admin/review");
}

export async function rejectSandwich(id: string) {
  const supabase = createAdminClient();

  const { data: sandwich } = await supabase
    .from("sandwiches")
    .select("uploaded_by, title")
    .eq("id", id)
    .single();

  await supabase.from("sandwiches").delete().eq("id", id);

  if (sandwich?.uploaded_by) {
    const { data: authData } = await supabase.auth.admin.getUserById(sandwich.uploaded_by);
    const email = authData?.user?.email;
    if (email) {
      const uploadUrl = "https://bitemap.food/upload";
      const { error: emailError } = await resend.emails.send({
        from: "Adam @ Bitemap <hello@bitemap.food>",
        to: email,
        subject: `Sorry, your sandwich was rejected`,
        html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fff;font-family:sans-serif;color:#1c1917;">
  <div style="max-width:480px;margin:0 auto;padding:48px 28px;">
    <p style="font-size:16px;line-height:1.65;margin:0 0 20px 0;">
      Thanks for submitting <strong>${sandwich.title}</strong> to Bitemap. I've decided not to add it to the app at this time.
    </p>
    <p style="font-size:16px;line-height:1.65;margin:0 0 32px 0;">
      I personally review every submission to keep Bitemap focused on authentic sandwiches that'll spark good bite convos. It's nothing personal; please don't let it stop you from submitting again.
    </p>
    <a href="${uploadUrl}" style="display:inline-block;background:#f97316;color:#fff;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:15px;margin-bottom:20px;">Submit another sando</a>
    <p style="margin:48px 0 0 0;font-size:14px;color:#57534e;line-height:1.6;">
      Thanks for your support,<br>Adam @ Bitemap
    </p>
  </div>
</body>
</html>`,
        text: `Thanks for submitting ${sandwich.title} to Bitemap. I've decided not to add it to the app at this time.\n\nI personally review every submission to keep Bitemap focused on authentic sandwiches that'll spark good biting convos. It's nothing personal; please don't let it stop you from submitting again.\n\nSubmit another sando: ${uploadUrl}\n\nThanks for your support,\nAdam @ Bitemap`,
      });
      if (emailError) console.error("Resend error:", emailError);
    }
  }

  revalidatePath("/admin/review");
}
