import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { trackServer } from "@/lib/track-server";

// Resend signs webhooks the same way Svix does: HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{body}", using the secret after its "whsec_"
// prefix (base64-encoded). Verifying by hand here instead of pulling in
// the svix package for one route.
function isValidSignature(payload: string, headers: Headers, secret: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  return signature.split(" ").some((part) => {
    const value = part.split(",")[1];
    if (!value) return false;
    const valueBuf = Buffer.from(value);
    return valueBuf.length === expectedBuf.length && crypto.timingSafeEqual(valueBuf, expectedBuf);
  });
}

const EVENT_TO_AMPLITUDE: Record<string, string> = {
  "email.delivered": "Email Delivered",
  "email.opened": "Email Opened",
  "email.clicked": "Email Clicked",
  "email.bounced": "Email Bounced",
  "email.complained": "Email Complained",
};

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  const payload = await request.text();
  if (!isValidSignature(payload, request.headers, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload);
  const amplitudeEvent = EVENT_TO_AMPLITUDE[event.type];
  if (!amplitudeEvent) {
    // Ignore event types we don't care about (email.sent, delivery_delayed, etc.)
    return NextResponse.json({ ok: true });
  }

  const tags = (event.data?.tags ?? []) as { name: string; value: string }[];
  const tagMap = new Map(tags.map((t) => [t.name, t.value]));
  const userId = tagMap.get("user_id") ?? "unknown";
  const notification = tagMap.get("notification") ?? "unknown";

  await trackServer(userId, amplitudeEvent, { notification, email_id: event.data?.email_id });

  return NextResponse.json({ ok: true });
}
