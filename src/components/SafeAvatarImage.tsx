"use client";

import { useState } from "react";
import Image from "next/image";
import { GenericAvatarIcon } from "@/components/GenericAvatarIcon";

// Google avatar URLs occasionally fail when hotlinked directly by the
// browser (intermittent rate-limiting on lh3.googleusercontent.com).
// next/image fetches server-side instead, same as the header avatar which
// doesn't have this problem; onError still falls back just in case.
interface Props {
  url: string | null;
  alt: string;
  size: number;
  fallbackBackground?: string;
  fallbackIconClassName?: string;
}

export function SafeAvatarImage({ url, alt, size, fallbackBackground, fallbackIconClassName }: Props) {
  const [errored, setErrored] = useState(false);
  if (!url || errored) {
    return <GenericAvatarIcon background={fallbackBackground} iconClassName={fallbackIconClassName} />;
  }
  return (
    <Image
      src={url}
      alt={alt}
      width={size}
      height={size}
      className="h-full w-full object-cover"
      onError={() => setErrored(true)}
    />
  );
}
