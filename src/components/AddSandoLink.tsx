"use client";

import { track } from "@/lib/track";

export function AddSandoLink({
  source,
  className,
  children,
}: {
  source: "header" | "all_done";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href="/upload" className={className} onClick={() => track("Add Sando Clicked", { source })}>
      {children}
    </a>
  );
}
