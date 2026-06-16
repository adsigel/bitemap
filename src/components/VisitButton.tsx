"use client";

import { track } from "@/lib/track";

function withUtm(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.set("utm_source", "bitemap");
    url.searchParams.set("utm_medium", "referral");
    return url.toString();
  } catch {
    return href;
  }
}

interface Props {
  href: string;
  sandwichId: string;
  title: string;
}

export function VisitButton({ href, sandwichId, title }: Props) {
  return (
    <a
      href={withUtm(href)}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-orange-600"
      onClick={() => track("Visit Clicked", { sandwich_id: sandwichId, title })}
    >
      Visit
    </a>
  );
}
