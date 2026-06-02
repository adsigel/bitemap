"use server";

import { createAdminClient } from "@/lib/supabase/admin";

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomToken(): string {
  return Array.from({ length: 4 }, () =>
    CHARS[Math.floor(Math.random() * CHARS.length)]
  ).join("");
}

export async function getOrCreateReferralToken(userId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("referral_tokens")
    .select("token")
    .eq("user_id", userId)
    .single();

  if (existing) return existing.token;

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = randomToken();
    const { error } = await supabase
      .from("referral_tokens")
      .insert({ token, user_id: userId });
    if (!error) return token;
    if (!error.message.includes("duplicate")) throw new Error(error.message);
  }

  throw new Error("Failed to generate a unique referral token after 5 attempts");
}
