"use client";

import { useEffect } from "react";
import * as amplitude from "@amplitude/analytics-browser";

export function AmplitudeProvider({
  apiKey,
  children,
}: {
  apiKey: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    amplitude.init(apiKey, { defaultTracking: false });
  }, [apiKey]);

  return <>{children}</>;
}
