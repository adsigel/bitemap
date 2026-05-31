"use server";

import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function renameSandwich(id: string, formData: FormData) {
  const title = (formData.get("title") as string)?.trim();
  if (!title) return;
  const supabase = createAdminClient();
  await supabase.from("sandwiches").update({ title }).eq("id", id);
  revalidatePath("/admin/review");
}

export async function approveSandwich(id: string) {
  const supabase = createAdminClient();

  const { data: sandwich } = await supabase
    .from("sandwiches")
    .select("uploaded_by, title")
    .eq("id", id)
    .single();

  await supabase.from("sandwiches").update({ approved: true }).eq("id", id);

  if (sandwich?.uploaded_by) {
    const { data: authData } = await supabase.auth.admin.getUserById(sandwich.uploaded_by);
    const email = authData?.user?.email;
    if (email) {
      const { error: emailError } = await resend.emails.send({
        from: "Bitemap <hello@bitemap.food>",
        to: email,
        subject: "Your sandwich was approved! 🥪",
        text: `"${sandwich.title}" is now live on Bitemap. Check it out and tell a friend!\n\nhttps://bitemap.food/sandwich/${id}`,
      });
      if (emailError) console.error("Resend error:", emailError);
    }
  }

  revalidatePath("/admin/review");
}

export async function rejectSandwich(id: string) {
  const supabase = createAdminClient();
  // Delete the DB record; storage object can be cleaned up separately
  await supabase.from("sandwiches").delete().eq("id", id);
  revalidatePath("/admin/review");
}
