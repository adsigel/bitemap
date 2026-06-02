"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

export function SandwichViewTracker({
  sandwichId,
  title,
  ref,
}: {
  sandwichId: string;
  title: string;
  ref?: string | null;
}) {
  useEffect(() => {
    track("Sandwich Viewed", {
      sandwich_id: sandwichId,
      title,
      ...(ref ? { referred_by: ref } : {}),
    });
  }, [sandwichId, title, ref]);

  return null;
}
