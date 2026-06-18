export function unsubscribeUrl(userId: string): string {
  return `https://bitemap.food/api/unsubscribe?u=${userId}`;
}

// Shared HTML wrapper matching the visual style already used in
// admin/review/actions.ts (approveSandwich/rejectSandwich emails).
export function emailHtml({
  intro,
  ctaText,
  ctaUrl,
  secondaryText,
  secondaryUrl,
  unsubscribeUrl: unsubUrl,
}: {
  intro: string;
  ctaText: string;
  ctaUrl: string;
  secondaryText?: string;
  secondaryUrl?: string;
  unsubscribeUrl?: string;
}): string {
  const secondary =
    secondaryText && secondaryUrl
      ? `\n    <br>\n    <a href="${secondaryUrl}" style="font-size:14px;color:#78716c;text-decoration:none;">${secondaryText}</a>`
      : "";

  const unsubscribe = unsubUrl
    ? `\n    <p style="margin:16px 0 0 0;font-size:12px;color:#a8a29e;"><a href="${unsubUrl}" style="color:#a8a29e;">Unsubscribe from these emails</a></p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fff;font-family:sans-serif;color:#1c1917;">
  <div style="max-width:480px;margin:0 auto;padding:48px 28px;">
    <p style="font-size:16px;line-height:1.65;margin:0 0 32px 0;">${intro}</p>
    <a href="${ctaUrl}" style="display:inline-block;background:#f97316;color:#fff;font-weight:600;text-decoration:none;padding:13px 28px;border-radius:10px;font-size:15px;margin-bottom:20px;">${ctaText}</a>${secondary}
    <p style="margin:48px 0 0 0;font-size:14px;color:#57534e;line-height:1.6;">
      Thanks for your support,<br>Adam @ Bitemap
    </p>${unsubscribe}
  </div>
</body>
</html>`;
}
