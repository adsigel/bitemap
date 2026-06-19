"use server";

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/track-server";
import { generateSlug } from "@/lib/slug";
import { emailHtml, unsubscribeUrl, withEmailSource } from "@/lib/email-template";
import { MIN_BITES_FOR_TIMELAPSE } from "@/lib/timelapse";
import { formatDateET } from "@/lib/daily-set";

const FIRST_SANDWICH_BITES_MILESTONE = 10;
const BITE_MILESTONE_FOR_UPLOAD_NUDGE = 8;

const resend = new Resend(process.env.RESEND_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function checkIsSandwich(imageUrl: string): Promise<boolean> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 10,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: 'Does this image primarily show a sandwich, burger, sub, wrap, or similar handheld food item? Reply with only "yes" or "no".',
          },
        ],
      },
    ],
  });
  const text = (msg.content[0] as { type: "text"; text: string }).text.trim().toLowerCase();
  return text.startsWith("yes");
}

export async function getSignedUploadUrl(filename: string, contentType: string) {
  const supabase = createAdminClient();
  const path = `${crypto.randomUUID()}.${filename.split(".").pop()}`;

  const { data, error } = await supabase.storage
    .from("sandwiches")
    .createSignedUploadUrl(path);

  if (error) return { error: error.message, data: null };

  const publicUrl = supabase.storage.from("sandwiches").getPublicUrl(path).data.publicUrl;

  return { error: null, data: { signedUrl: data.signedUrl, path, publicUrl } };
}

export async function saveSandwich(args: {
  title: string;
  description: string;
  imageUrl: string;
  imageHash?: string | null;
  approved?: boolean;
  uploadedBy?: string | null;
}) {
  const supabase = createAdminClient();

  if (args.imageHash) {
    const { data: existing } = await supabase
      .from("sandwiches")
      .select("id")
      .eq("image_hash", args.imageHash)
      .maybeSingle();
    if (existing) {
      return { error: "duplicate", id: null, slug: null };
    }
  }

  let isSandwich = true;
  try {
    isSandwich = await checkIsSandwich(args.imageUrl);
  } catch (err) {
    console.error("Sandwich check failed, proceeding to manual review:", err);
  }
  if (!isSandwich) {
    return { error: "not_a_sandwich", id: null, slug: null };
  }

  const id = crypto.randomUUID();
  const slug = generateSlug(args.title, id);
  const { data, error } = await supabase
    .from("sandwiches")
    .insert({
      id,
      slug,
      title: args.title.trim(),
      description: args.description.trim() || null,
      image_url: args.imageUrl,
      approved: args.approved ?? false,
      ...(args.imageHash ? { image_hash: args.imageHash } : {}),
      ...(args.uploadedBy ? { uploaded_by: args.uploadedBy } : {}),
    })
    .select("id, slug")
    .single();

  if (!error && data?.id) {
    let uploader = "Anonymous";
    if (args.uploadedBy) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", args.uploadedBy)
        .single();
      if (profile?.display_name) uploader = profile.display_name;
    }

    const { error: emailError } = await resend.emails.send({
      from: "Bitemap <hello@bitemap.food>",
      to: "hello@bitemap.food",
      subject: `🥪 New sando needs review: ${args.title}`,
      text: `${uploader} submitted "${args.title}" and it's waiting for approval.\n\nhttps://bitemap.food/admin/review`,
      tags: [{ name: "notification", value: "new_submission" }],
    });
    if (emailError) console.error("Resend error:", emailError);
  }

  return { error: error?.message ?? null, id: data?.id ?? null, slug: data?.slug ?? null };
}

export async function getUploaderEmail(supabase: ReturnType<typeof createAdminClient>, uploaderId: string) {
  const { data: authData } = await supabase.auth.admin.getUserById(uploaderId);
  return authData?.user?.email ?? null;
}

// For non-essential email (daily recaps, bite/timelapse milestones) --
// returns null if the user has unsubscribed, so callers can skip the send
// the same way they already skip a missing email address.
export async function getMarketingEmailRecipient(supabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("marketing_unsubscribed_at")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.marketing_unsubscribed_at) return null;
  return getUploaderEmail(supabase, userId);
}

// Shared by approveSandwich and the cron's orphaned-approval self-heal
// sweep, so both paths send the identical "scheduled" email.
export async function sendScheduledEmail(
  supabase: ReturnType<typeof createAdminClient>,
  sandwich: { id: string; title: string; slug: string | null; uploaded_by: string | null },
  scheduledFor: string
) {
  if (!sandwich.uploaded_by) return;
  const email = await getUploaderEmail(supabase, sandwich.uploaded_by);
  if (!email) return;

  const sandwichUrl = `https://bitemap.food/sandwich/${sandwich.slug ?? sandwich.id}`;
  const trackedUrl = withEmailSource(sandwichUrl, "scheduled");
  const dateLabel = formatDateET(scheduledFor);
  const { error } = await resend.emails.send({
    from: "Adam @ Bitemap <hello@bitemap.food>",
    to: email,
    subject: `Your sandwich is scheduled for ${dateLabel} 🥪`,
    html: emailHtml({
      intro: `<strong>${sandwich.title}</strong> passed review and is scheduled to go live on <strong>${dateLabel}</strong>. We'll email you again the moment it's live.`,
      ctaText: "See who's biting",
      ctaUrl: trackedUrl,
    }),
    text: `${sandwich.title} passed review and is scheduled to go live on ${dateLabel}. We'll email you again the moment it's live.\n\nSee who's biting: ${trackedUrl}`,
    tags: [
      { name: "notification", value: "scheduled" },
      { name: "user_id", value: sandwich.uploaded_by },
    ],
  });
  if (error) console.error("Resend error:", error);
}

export async function checkBiteMilestones(sandwichId: string, userId: string | null = null) {
  const supabase = createAdminClient();

  const [sandwichResult, sandwichBiteResult] = await Promise.all([
    supabase.from("sandwiches").select("uploaded_by, title, slug").eq("id", sandwichId).single(),
    supabase.from("bites").select("*", { count: "exact", head: true }).eq("sandwich_id", sandwichId),
  ]);

  const sandwich = sandwichResult.data;
  const biteCount = sandwichBiteResult.count;
  const emailJobs: Promise<unknown>[] = [];

  if (sandwich?.uploaded_by) {
    const sandwichUrl = `https://bitemap.food/sandwich/${sandwich.slug ?? sandwichId}`;

    // First sandwich, 10 bites: onboarding validation + nudge toward 100.
    if (biteCount === FIRST_SANDWICH_BITES_MILESTONE) {
      const { data: firstSandwich } = await supabase
        .from("sandwiches")
        .select("id")
        .eq("uploaded_by", sandwich.uploaded_by)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (firstSandwich?.id === sandwichId) {
        const email = await getMarketingEmailRecipient(supabase, sandwich.uploaded_by);
        if (email) {
          const unsubUrl = unsubscribeUrl(sandwich.uploaded_by);
          emailJobs.push(
            resend.emails.send({
              from: "Adam @ Bitemap <hello@bitemap.food>",
              to: email,
              subject: "People are already biting your sandwich 🥪",
              html: emailHtml({
                intro: `<strong>${sandwich.title}</strong> just got its 10th bite. People are already finding it and biting. Share it and see if you can get it to 100.`,
                ctaText: "Share my sando",
                ctaUrl: withEmailSource(`${sandwichUrl}?share=1`, "first_10_bites"),
                unsubscribeUrl: unsubUrl,
              }),
              text: `${sandwich.title} just got its 10th bite. People are already finding it and biting. Share it and see if you can get it to 100.\n\nShare my sando: ${withEmailSource(`${sandwichUrl}?share=1`, "first_10_bites")}\n\nUnsubscribe from these emails: ${unsubUrl}`,
              tags: [
                { name: "notification", value: "first_10_bites" },
                { name: "user_id", value: sandwich.uploaded_by },
              ],
            })
          );
          emailJobs.push(trackServer(sandwich.uploaded_by, "User Notified", { notification: "First Sandwich 10 Bites" }));
        }
      }
    }

    // Hit the timelapse threshold: nudge them to go watch their heatmap fill in.
    if (biteCount === MIN_BITES_FOR_TIMELAPSE) {
      const email = await getMarketingEmailRecipient(supabase, sandwich.uploaded_by);
      if (email) {
        const unsubUrl = unsubscribeUrl(sandwich.uploaded_by);
        emailJobs.push(
          resend.emails.send({
            from: "Adam @ Bitemap <hello@bitemap.food>",
            to: email,
            subject: `🎉 ${sandwich.title} just hit ${MIN_BITES_FOR_TIMELAPSE} bites`,
            html: emailHtml({
              intro: `<strong>${sandwich.title}</strong> just crossed ${MIN_BITES_FOR_TIMELAPSE} bites. You can now watch the crowd pile on as a timelapse, right from your profile.`,
              imageUrl: `https://bitemap.food/api/heatmap-image/${sandwichId}`,
              ctaText: "View heatmap & make a timelapse",
              ctaUrl: withEmailSource("https://bitemap.food/profile", "timelapse_threshold"),
              secondaryText: "See who's biting",
              secondaryUrl: withEmailSource(sandwichUrl, "timelapse_threshold"),
              unsubscribeUrl: unsubUrl,
            }),
            text: `${sandwich.title} just crossed ${MIN_BITES_FOR_TIMELAPSE} bites. You can now watch the crowd pile on as a timelapse, right from your profile.\n\nView heatmap & make a timelapse: ${withEmailSource("https://bitemap.food/profile", "timelapse_threshold")}\nSee who's biting: ${withEmailSource(sandwichUrl, "timelapse_threshold")}\n\nUnsubscribe from these emails: ${unsubUrl}`,
            tags: [
              { name: "notification", value: "timelapse_threshold" },
              { name: "user_id", value: sandwich.uploaded_by },
            ],
          })
        );
        emailJobs.push(trackServer(sandwich.uploaded_by, "User Notified", { notification: "Timelapse Threshold" }));
      }
    }

  }

  // Biter (not uploader) hits 8 total bites and has never uploaded a sandwich
  // themselves -- nudge them toward contributing one. Fire-once via
  // profiles.upload_nudge_sent_at, since this is keyed off a running total
  // that would otherwise re-match on every later bite too.
  if (userId) {
    const [{ count: totalBites }, { count: uploadCount }, { data: profile }] = await Promise.all([
      supabase.from("bites").select("*", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("sandwiches").select("*", { count: "exact", head: true }).eq("uploaded_by", userId),
      supabase.from("profiles").select("upload_nudge_sent_at").eq("id", userId).single(),
    ]);

    if (totalBites === BITE_MILESTONE_FOR_UPLOAD_NUDGE && uploadCount === 0 && !profile?.upload_nudge_sent_at) {
      const email = await getMarketingEmailRecipient(supabase, userId);
      if (email) {
        const unsubUrl = unsubscribeUrl(userId);
        const uploadUrl = withEmailSource("https://bitemap.food/upload", "upload_nudge");
        const intro = [
          `You've bitten ${BITE_MILESTONE_FOR_UPLOAD_NUDGE} sandwiches on Bitemap. You decided where strangers' sandwiches ought to be bitten, and you shared your opinions with us. We love you for it.`,
          `You haven't put up one of your own sandwiches yet for the community to bite. That's when things get really interesting.`,
          `Maybe they all go for the corner. Maybe they swarm the middle and you'll never understand why. Either way it's your sandwich on the map, and the map fills in fast. Grab a pic of your next sandwich, maybe at lunch, and find out where people would take their bites.`,
        ];
        emailJobs.push(
          resend.emails.send({
            from: "Adam @ Bitemap <hello@bitemap.food>",
            to: email,
            subject: `You've bitten ${BITE_MILESTONE_FOR_UPLOAD_NUDGE} sandwiches. Where would they bite yours?`,
            html: emailHtml({
              intro: intro.join("<br><br>"),
              ctaText: "Upload yours",
              ctaUrl: uploadUrl,
              unsubscribeUrl: unsubUrl,
            }),
            text: `${intro.join("\n\n")}\n\nUpload yours: ${uploadUrl}\n\nUnsubscribe from these emails: ${unsubUrl}`,
            tags: [
              { name: "notification", value: "upload_nudge" },
              { name: "user_id", value: userId },
            ],
          })
        );
        await supabase.from("profiles").update({ upload_nudge_sent_at: new Date().toISOString() }).eq("id", userId);
        emailJobs.push(trackServer(userId, "User Notified", { notification: "Upload Nudge" }));
      }
    }
  }

  if (emailJobs.length > 0) {
    const results = await Promise.all(emailJobs);
    results.forEach((r) => {
      const result = r as { error?: unknown };
      if (result?.error) console.error("Resend error:", result.error);
    });
  }
}

