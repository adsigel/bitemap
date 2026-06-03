import { createClient } from "@/lib/supabase/server";
import { AvatarMenu } from "@/components/AvatarMenu";
import { HomeLink } from "@/components/HomeLink";

export async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <header className="flex items-center border-b border-stone-200 bg-white px-4 py-3">
      <div className="flex flex-1 items-center">
        {user && profile ? (
          <AvatarMenu displayName={profile.display_name} avatarUrl={profile.avatar_url} />
        ) : (
          <a
            href="/sign-in"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            Sign in
          </a>
        )}
      </div>

      <HomeLink />

      <div className="flex flex-1 items-center justify-end">
        <a
          href="/upload"
          className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
        >
          Add a Sando
        </a>
      </div>
    </header>
  );
}
