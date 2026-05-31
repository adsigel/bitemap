"use server";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackServer } from "@/lib/track-server";

const resend = new Resend(process.env.RESEND_API_KEY);

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
  approved?: boolean;
  uploadedBy?: string | null;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sandwiches")
    .insert({
      title: args.title.trim(),
      description: args.description.trim() || null,
      image_url: args.imageUrl,
      approved: args.approved ?? false,
      ...(args.uploadedBy ? { uploaded_by: args.uploadedBy } : {}),
    })
    .select("id")
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

  return { error: error?.message ?? null, id: data?.id ?? null };
}

export async function checkBiteMilestones(sandwichId: string, userId: string) {
  const supabase = createAdminClient();

  const [userBiteResult, sandwichResult, sandwichBiteResult] = await Promise.all([
    supabase.from("bites").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("sandwiches").select("uploaded_by, title").eq("id", sandwichId).single(),
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
          text: `"${sandwich.title}" has received 5 bites times on Bitemap. Share it with friends to get more bites!\n\nhttps://bitemap.food/sandwich/${sandwichId}`,
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
