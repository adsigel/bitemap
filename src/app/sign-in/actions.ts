"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signInWithGoogle(sessionId: string, next: string = "/", _formData?: FormData) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?session_id=${sessionId}&next=${encodeURIComponent(next)}`,
      queryParams: { access_type: "offline", prompt: "select_account" },
    },
  });

  if (error || !data.url) redirect("/sign-in?error=auth_failed");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
