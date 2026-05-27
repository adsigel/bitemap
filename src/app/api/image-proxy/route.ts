import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return new NextResponse("Missing url", { status: 400 });
  }

  // Only proxy images from our own Supabase storage bucket
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse("Invalid url", { status: 400 });
  }

  if (parsed.host !== ALLOWED_HOST) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const response = await fetch(url);
  if (!response.ok) {
    return new NextResponse("Failed to fetch image", { status: 502 });
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = await response.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
