"use server";

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/track-server";
import { generateSlug } from "@/lib/slug";

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

export async function checkBiteMilestones(sandwichId: string, userId: string) {
  const supabase = createAdminClient();

  const [userBiteResult, sandwichResult, sandwichBiteResult] = await Promise.all([
    supabase.from("bites").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("sandwiches").select("uploaded_by, title, slug").eq("id", sandwichId).single(),
    supabase.from("bites").select("*", { count: "exact", head: true }).eq("sandwich_id", sandwichId),
  ]);

  const emailJobs: Promise<unknown>[] = [];

  if (userBiteResult.count === 10) {
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const email = authData?.user?.email;
    if (email) {
      emailJobs.push(
        resend.emails.send({
          from: "Adam @ Bitemap <hello@bitemap.food>",
          to: email,
          subject: "You've taken your 10th bite! 🎉",
          text: `You're 10 bites into your Bitemap journey. That makes you one dedicated biter. Thanks for the support! \n\nHave you checked your bite stats in your profile? https://bitemap.food`,
        })
      );
      emailJobs.push(trackServer(userId, "User Notified", { notification: "10th Bite" }));
    }
  }

  const sandwich = sandwichResult.data;
  if (sandwichBiteResult.count === 5 && sandwich?.uploaded_by) {
    const { data: authData } = await supabase.auth.admin.getUserById(sandwich.uploaded_by);
    const email = authData?.user?.email;
    if (email) {
      emailJobs.push(
        resend.emails.send({
          from: "Adam @ Bitemap <hello@bitemap.food>",
          to: email,
          subject: `Your sando just hit 5 bites 🥪`,
          text: `"${sandwich.title}" has received 5 bites on Bitemap. Share it with friends to get more bites!\n\nhttps://bitemap.food/sandwich/${sandwich.slug ?? sandwichId}`,
        })
      );
      emailJobs.push(trackServer(sandwich.uploaded_by, "User Notified", { notification: "5th Sandwich Bite" }));
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
