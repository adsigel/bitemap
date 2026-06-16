"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

function sanitizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export async function updateCreatorContent(
  sandwichId: string,
  note: string,
  url: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [{ data: profile }, { data: sandwich }] = await Promise.all([
    supabase.from("profiles").select("creator_features").eq("id", user.id).single(),
    supabase.from("sandwiches").select("uploaded_by").eq("id", sandwichId).single(),
  ]);

  if (!profile?.creator_features) return { error: "Feature not enabled" };
  if (sandwich?.uploaded_by !== user.id) return { error: "Not your sandwich" };

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("sandwiches")
    .update({
      creator_note: note.trim() || null,
      creator_url: sanitizeUrl(url),
    })
    .eq("id", sandwichId);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/profile`);
  return { error: null };
}
