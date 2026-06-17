import { createClient } from "@/lib/supabase/server";
import { AvatarLink } from "@/components/AvatarLink";
import { HomeLink } from "@/components/HomeLink";
import { AddSandoLink } from "@/components/AddSandoLink";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single();
    displayName = data?.display_name ?? null;
    avatarUrl = data?.avatar_url ?? null;
  }

  return (
    <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex items-center gap-3">
        <HomeLink />
        <span className="hidden text-sm text-stone-400 dark:text-stone-500 sm:inline">
          Your bite vs. everyone else&apos;s
        </span>
      </div>

      <div className="flex items-center gap-3">
        <AddSandoLink
          source="header"
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          Add a Sando
        </AddSandoLink>
        <AvatarLink displayName={displayName} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
