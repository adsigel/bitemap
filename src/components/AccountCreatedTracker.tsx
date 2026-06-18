"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { track } from "@/lib/track";

export function AccountCreatedTracker() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("account_created") !== "1") return;
    const ref = searchParams.get("ref");
    track("Account Created", ref ? { referred_by: ref } : undefined);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("account_created");
    params.delete("ref");
    const newUrl = params.size ? `${pathname}?${params}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [searchParams, pathname, router]);

  return null;
}
