"use server";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { emailHtml } from "@/lib/email-template";
import { assignToSchedule, fillPipeline, todayET, formatDateET } from "@/lib/daily-set";

const resend = new Resend(process.env.RESEND_API_KEY);

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
      const dateLabel = formatDateET(scheduledFor);
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
        tags: [
          { name: "notification", value: "scheduled" },
          { name: "user_id", value: sandwich.uploaded_by },
        ],
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

// Repeat-pool slots on future (not-yet-live) days can be swapped for a
// specific different sandwich, picked by the admin -- either an unused
// backlog sandwich (simple 1-for-1 replace) or a sandwich already
// scheduled on a different non-today day (a full exchange: the displaced
// sandwich takes this slot's old spot, so nothing is dropped or
// double-booked). New-release slots and today's live day are not
// editable here.
// The Queue tab's dropdown already filters out candidates that would
// violate the cap, so failSwap() should only ever trigger from a stale
// page (someone else changed a slot between page load and submit).
function failSwap(): never {
  redirect("/admin/review?tab=queue&swapError=1");
}

type SlotUploaderRow = { sandwich_id: string; sandwiches: { uploaded_by: string | null } | null };

export async function swapRepeatSlot(date: string, oldSandwichId: string, formData: FormData) {
  const newSandwichId = formData.get("newSandwichId") as string;
  if (!newSandwichId || date <= todayET()) failSwap();

  const supabase = createAdminClient();

  const { data: oldSlot } = await supabase
    .from("daily_slots")
    .select("is_new_release")
    .eq("date", date)
    .eq("sandwich_id", oldSandwichId)
    .maybeSingle();
  if (!oldSlot || oldSlot.is_new_release) failSwap();

  const { data: newSandwich } = await supabase
    .from("sandwiches")
    .select("uploaded_by")
    .eq("id", newSandwichId)
    .single();
  if (!newSandwich) failSwap();

  const { data: newSandwichSlot } = await supabase
    .from("daily_slots")
    .select("date, is_new_release")
    .eq("sandwich_id", newSandwichId)
    .maybeSingle();

  if (newSandwichSlot && newSandwichSlot.date !== date) {
    // Cross-day exchange: the target must be a repeat slot on a non-today day.
    if (newSandwichSlot.is_new_release || newSandwichSlot.date <= todayET()) failSwap();
    const otherDate = newSandwichSlot.date;

    const { data: oldSandwich } = await supabase
      .from("sandwiches")
      .select("uploaded_by")
      .eq("id", oldSandwichId)
      .single();
    if (!oldSandwich) failSwap();

    const [{ data: daySlotsA }, { data: daySlotsB }] = await Promise.all([
      supabase.from("daily_slots").select("sandwich_id, sandwiches(uploaded_by)").eq("date", date),
      supabase.from("daily_slots").select("sandwich_id, sandwiches(uploaded_by)").eq("date", otherDate),
    ]);

    const conflictA = ((daySlotsA ?? []) as unknown as SlotUploaderRow[]).some(
      (s) =>
        s.sandwich_id !== oldSandwichId &&
        !!newSandwich.uploaded_by &&
        s.sandwiches?.uploaded_by === newSandwich.uploaded_by
    );
    const conflictB = ((daySlotsB ?? []) as unknown as SlotUploaderRow[]).some(
      (s) =>
        s.sandwich_id !== newSandwichId &&
        !!oldSandwich.uploaded_by &&
        s.sandwiches?.uploaded_by === oldSandwich.uploaded_by
    );
    if (conflictA || conflictB) failSwap();

    await supabase.from("daily_slots").delete().eq("date", date).eq("sandwich_id", oldSandwichId);
    await supabase.from("daily_slots").delete().eq("date", otherDate).eq("sandwich_id", newSandwichId);
    await supabase.from("daily_slots").insert([
      { date, sandwich_id: newSandwichId, is_new_release: false },
      { date: otherDate, sandwich_id: oldSandwichId, is_new_release: false },
    ]);
    revalidatePath("/admin/review");
    return;
  }

  // Simple backlog replace: guard against double-booking or breaking the
  // per-uploader-per-day cap.
  const { data: daySlots } = await supabase
    .from("daily_slots")
    .select("sandwich_id, sandwiches(uploaded_by)")
    .eq("date", date);
  const conflict = ((daySlots ?? []) as unknown as SlotUploaderRow[]).some(
    (s) =>
      s.sandwich_id === newSandwichId ||
      (!!newSandwich.uploaded_by && s.sandwiches?.uploaded_by === newSandwich.uploaded_by)
  );
  if (conflict) failSwap();

  await supabase.from("daily_slots").delete().eq("date", date).eq("sandwich_id", oldSandwichId);
  await supabase.from("daily_slots").insert({ date, sandwich_id: newSandwichId, is_new_release: false });
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
        tags: [
          { name: "notification", value: "rejected" },
          { name: "user_id", value: sandwich.uploaded_by },
        ],
      });
      if (emailError) console.error("Resend error:", emailError);
    }
  }

  revalidatePath("/admin/review");
}
