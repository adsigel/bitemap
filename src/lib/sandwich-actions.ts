"use server";

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/track-server";
import { generateSlug } from "@/lib/slug";
import { emailHtml } from "@/lib/email-template";
import { MIN_BITES_FOR_TIMELAPSE } from "@/lib/timelapse";

const FIRST_SANDWICH_BITES_MILESTONE = 10;

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
    });
    if (emailError) console.error("Resend error:", emailError);
  }

  return { error: error?.message ?? null, id: data?.id ?? null, slug: data?.slug ?? null };
}

export async function getUploaderEmail(supabase: ReturnType<typeof createAdminClient>, uploaderId: string) {
  const { data: authData } = await supabase.auth.admin.getUserById(uploaderId);
  return authData?.user?.email ?? null;
}

export async function checkBiteMilestones(sandwichId: string) {
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
        const email = await getUploaderEmail(supabase, sandwich.uploaded_by);
        if (email) {
          emailJobs.push(
            resend.emails.send({
              from: "Adam @ Bitemap <hello@bitemap.food>",
              to: email,
              subject: "People are already biting your sandwich 🥪",
              html: emailHtml({
                intro: `<strong>${sandwich.title}</strong> just got its 10th bite. People are already finding it and biting. Share it and see if you can get it to 100.`,
                ctaText: "Share my sando",
                ctaUrl: `${sandwichUrl}?share=1`,
              }),
              text: `${sandwich.title} just got its 10th bite. People are already finding it and biting. Share it and see if you can get it to 100.\n\nShare my sando: ${sandwichUrl}?share=1`,
            })
          );
          emailJobs.push(trackServer(sandwich.uploaded_by, "User Notified", { notification: "First Sandwich 10 Bites" }));
        }
      }
    }

    // Hit the timelapse threshold: nudge them to go watch their heatmap fill in.
    if (biteCount === MIN_BITES_FOR_TIMELAPSE) {
      const email = await getUploaderEmail(supabase, sandwich.uploaded_by);
      if (email) {
        emailJobs.push(
          resend.emails.send({
            from: "Adam @ Bitemap <hello@bitemap.food>",
            to: email,
            subject: `🎉 ${sandwich.title} just hit ${MIN_BITES_FOR_TIMELAPSE} bites`,
            html: emailHtml({
              intro: `<strong>${sandwich.title}</strong> just crossed ${MIN_BITES_FOR_TIMELAPSE} bites. You can now watch the crowd pile on as a timelapse, right from your profile.`,
              ctaText: "View heatmap & make a timelapse",
              ctaUrl: "https://bitemap.food/profile",
              secondaryText: "See who's biting",
              secondaryUrl: sandwichUrl,
            }),
            text: `${sandwich.title} just crossed ${MIN_BITES_FOR_TIMELAPSE} bites. You can now watch the crowd pile on as a timelapse, right from your profile.\n\nView heatmap & make a timelapse: https://bitemap.food/profile\nSee who's biting: ${sandwichUrl}`,
          })
        );
        emailJobs.push(trackServer(sandwich.uploaded_by, "User Notified", { notification: "Timelapse Threshold" }));
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

