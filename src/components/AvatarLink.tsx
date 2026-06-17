import Image from "next/image";

interface Props {
  displayName: string | null;
  avatarUrl: string | null;
}

export function AvatarLink({ displayName, avatarUrl }: Props) {
  return (
    <a
      href="/profile"
      aria-label="Your profile"
      className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full transition hover:opacity-80"
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={displayName ?? "Profile"}
          width={32}
          height={32}
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : displayName ? (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-xs font-semibold text-orange-600">
          {displayName[0].toUpperCase()}
        </div>
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-sm dark:bg-stone-700">
          🥪
        </div>
      )}
    </a>
  );
}
