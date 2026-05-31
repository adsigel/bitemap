"use client";

import { useEffect } from "react";
import { track } from "@/lib/track";

export function ProfileViewTracker() {
  useEffect(() => {
    track("Profile Viewed");
  }, []);

  return null;
}
