"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function approveSandwich(id: string) {
  const supabase = createAdminClient();
  await supabase.from("sandwiches").update({ approved: true }).eq("id", id);
  revalidatePath("/admin/review");
}

export async function rejectSandwich(id: string) {
  const supabase = createAdminClient();
  // Delete the DB record; storage object can be cleaned up separately
  await supabase.from("sandwiches").delete().eq("id", id);
  revalidatePath("/admin/review");
}
