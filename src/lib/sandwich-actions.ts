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

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

async function sendRejectionEmail(
  supabase: SupabaseAdminClient,
  userId: string,
  title: string,
  reason: "duplicate" | "not_a_sandwich"
) {
  const { data: authData } = await supabase.auth.admin.getUserById(userId);
  const email = authData?.user?.email;
  if (!email) return;

  const uploadUrl = "https://bitemap.food/upload";

  const subjects: Record<typeof reason, string> = {
    duplicate: `Sandwich rejected: We already have that one`,
    not_a_sandwich: `Sandwich rejected: That one didn't make the cut`,
  };

  const bodies: Record<typeof reason, { html: string; text: string }> = {
    duplicate: {
      html: `<p style="font-size:16px;line-height:1.65;margin:0 0 20px 0;">
        Thanks for submitting <strong>${title}</strong>! We already have that exact picture in our library, so we didn't add it again.
      </p>
      <p style="font-size:16px;line-height:1.65;margin:0 0 32px 0;">
        Got a different photo of this sandwich, or another sandwich you love? We'd love to see it.
      </p>`,
      text: `Thanks for submitting ${title}! We already have that exact picture in our library, so we didn't add it again.\n\nGot a different photo of this sandwich, or another sandwich you love? We'd love to see it.\n\n`,
    },
    not_a_sandwich: {
      html: `<p style="font-size:16px;line-height:1.65;margin:0 0 20px 0;">
        Thanks for submitting <strong>${title}</strong>! Our sandwich bouncer suspected a fake, so we held it back.
      </p>
      <p style="font-size:16px;line-height:1.65;margin:0 0 32px 0;">
        If you think we got it wrong, try uploading again with a clearer photo of the sandwich. We want every bite to count.
      </p>`,
      text: `Thanks for submitting ${title}! Our sandwich bouncer suspected a fake, so we held it back.\n\nIf you think we got it wrong, try uploading again with a clearer photo of the sandwich. We want every bite to count.\n\n`,
    },
  };

  const { html, text } = bodies[reason];
  const { error } = await resend.emails.send({
    from: "Adam @ Bitemap <hello@bitemap.food>",
    to: email,
    subject: subjects[reason],
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fff;font-family:sans-serif;color:#1c1917;">
  <div style="max-width:480px;margin:0 auto;padding:48px 28px;">
    ${html}
    <a href="${uploadUrl}" style="display:inline-block;background:#f97316;color:#fff;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:15px;margin-bottom:20px;">Submit another sando</a>
    <p style="margin:48px 0 0 0;font-size:14px;color:#57534e;line-height:1.6;">
      Thanks for your support,<br>Adam @ Bitemap
    </p>
  </div>
</body>
</html>`,
    text: `${text}Submit another sando: ${uploadUrl}\n\nThanks for your support,\nAdam @ Bitemap`,
  });
  if (error) console.error("Resend error:", error);
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
      if (args.uploadedBy) await sendRejectionEmail(supabase, args.uploadedBy, args.title, "duplicate");
      return { error: "duplicate", id: null, slug: null };
    }
  }

  const isSandwich = await checkIsSandwich(args.imageUrl);
  if (!isSandwich) {
    if (args.uploadedBy) await sendRejectionEmail(supabase, args.uploadedBy, args.title, "not_a_sandwich");
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
