import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: sandwiches } = await supabase.from("sandwiches").select("id").eq("approved", true);

  if (!sandwiches?.length) {
    return (
      <div className="py-24 text-center text-stone-400">
        No sandwiches yet. Check back soon.
      </div>
    );
  }

  const pick = sandwiches[Math.floor(Math.random() * sandwiches.length)];
  redirect(`/sandwich/${pick.id}`);
}
