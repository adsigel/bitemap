import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderHeatmapImage } from "@/lib/render-heatmap-image";

// @napi-rs/canvas is a native module -- needs the Node runtime, not edge.
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ sandwichId: string }> }) {
  const { sandwichId } = await params;
  const supabase = createAdminClient();

  const [{ data: sandwich }, { data: bites }] = await Promise.all([
    supabase.from("sandwiches").select("image_url").eq("id", sandwichId).single(),
    supabase.from("bites").select("x, y").eq("sandwich_id", sandwichId),
  ]);

  if (!sandwich) {
    return new NextResponse("Sandwich not found", { status: 404 });
  }

  const buffer = await renderHeatmapImage(sandwich.image_url, bites ?? []);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      // Email clients/proxies (e.g. Gmail's image cache) may fetch this
      // more than once for the same open -- short cache avoids re-rendering
      // on every fetch while still reflecting bite counts within the hour.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
