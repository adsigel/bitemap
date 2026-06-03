"use client";

import Image from "next/image";

export function HomeLink() {
  return (
    <a href="/" onClick={() => { window.location.href = "/"; }}>
      <Image
        src="/bitemap.png"
        alt="Bitemap"
        width={120}
        height={32}
        className="h-8 dark:invert"
        style={{ width: "auto" }}
        priority
      />
    </a>
  );
}
