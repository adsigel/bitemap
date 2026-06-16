"use client";

import { track } from "@/lib/track";

interface Props {
  source: "footer" | "post-bite";
  className?: string;
  children: React.ReactNode;
}

export function DonationLink({ source, className, children }: Props) {
  return (
    <a
      href="https://ko-fi.com/bitemap"
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => track("Donation Clicked", { source })}
    >
      {children}
    </a>
  );
}
