"use server";

import { createAdminClient } from "@/lib/supabase/admin";

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
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sandwiches")
    .insert({
      title: args.title.trim(),
      description: args.description.trim() || null,
      image_url: args.imageUrl,
      approved: args.approved ?? false,
    })
    .select("id")
    .single();

  return { error: error?.message ?? null, id: data?.id ?? null };
}
