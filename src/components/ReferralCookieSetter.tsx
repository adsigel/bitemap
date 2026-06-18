"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { storeReferralTokenIfFirstTouch } from "@/lib/referral-cookie";

export function ReferralCookieSetter() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) storeReferralTokenIfFirstTouch(ref);
  }, [searchParams]);

  return null;
}
