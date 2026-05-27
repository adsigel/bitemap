"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

export function SandwichViewTracker({
  sandwichId,
  title,
}: {
  sandwichId: string;
  title: string;
}) {
  useEffect(() => {
    track("Sandwich Viewed", { sandwich_id: sandwichId, title });
  }, [sandwichId, title]);

  return null;
}
