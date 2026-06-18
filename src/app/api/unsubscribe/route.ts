import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("u");
  if (!userId) {
    return NextResponse.redirect(new URL("/unsubscribed?ok=0", request.url));
  }

  const supabase = createAdminClient();
  await supabase.from("profiles").update({ marketing_unsubscribed_at: new Date().toISOString() }).eq("id", userId);

  return NextResponse.redirect(new URL("/unsubscribed?ok=1", request.url));
}
