"use client";

export function HomeLink() {
  return (
    <a
      href="/"
      onClick={() => { window.location.href = "/"; }}
      className="text-lg font-semibold tracking-tight"
    >
      🥪 Bitemap
    </a>
  );
}
