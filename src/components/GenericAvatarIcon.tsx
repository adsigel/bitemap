// Shared fallback avatar for biters/uploaders with no photo or initial to show.
export function GenericAvatarIcon({
  background = "#78716c",
  iconClassName = "h-3.5 w-3.5",
}: {
  background?: string;
  iconClassName?: string;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background }}>
      <svg viewBox="0 0 24 24" className={iconClassName} fill="white">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v1h16v-1c0-2.66-5.33-4-8-4z" />
      </svg>
    </div>
  );
}
