import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REFERRAL_COOKIE } from "@/lib/referral-cookie";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const admin = createAdminClient();
      const meta = data.user.user_metadata;

      // Ensure a profile row exists — the DB trigger handles initial creation,
      // but if the row was deleted this recreates it without overwriting edits.
      await admin.from("profiles").upsert(
        {
          id: data.user.id,
          display_name: meta.full_name ?? meta.name ?? "Anonymous",
          avatar_url: meta.avatar_url ?? null,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );

      // Migrate any anonymous bites from this session to the new user account
      const sessionId = searchParams.get("session_id");
      if (sessionId) {
        await admin
          .from("bites")
          .update({ user_id: data.user.id })
          .eq("session_id", sessionId)
          .is("user_id", null);
      }

      const isNewUser = new Date(data.user.created_at).getTime() > Date.now() - 30000;
      const separator = next.includes("?") ? "&" : "?";
      const refToken = request.cookies.get(REFERRAL_COOKIE)?.value;
      const refParam = refToken ? `&ref=${encodeURIComponent(refToken)}` : "";
      const redirectTo = isNewUser ? `${origin}${next}${separator}account_created=1${refParam}` : `${origin}${next}`;
      return NextResponse.redirect(redirectTo);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_failed`);
}
