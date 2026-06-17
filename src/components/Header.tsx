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
      <div className="flex min-w-0 items-center gap-3">
        <HomeLink />
        <span className="truncate text-sm text-stone-500 dark:text-stone-300">
          Your bite vs. everyone else&apos;s
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <AddSandoLink
          source="header"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white transition hover:bg-orange-600 sm:h-auto sm:w-auto sm:rounded-lg sm:px-3 sm:py-1.5"
        >
          <span className="text-xl leading-none sm:hidden" aria-hidden>+</span>
          <span className="sr-only sm:hidden">Add a sando</span>
          <span className="hidden text-sm font-medium sm:inline">Add a sando</span>
        </AddSandoLink>
        <AvatarLink displayName={displayName} avatarUrl={avatarUrl} />
      </div>
    </header>
  );
}
