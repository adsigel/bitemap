// First-touch referral attribution: the `?ref={token}` query param only
// lives on the single page view where it appears, but we want to credit
// the referrer on later events (signup, upload) that can happen long
// after the click. This cookie carries it forward.
export const REFERRAL_COOKIE = "bitemap_ref_token";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function getStoredReferralToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${REFERRAL_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function storeReferralTokenIfFirstTouch(token: string): void {
  if (getStoredReferralToken()) return;
  document.cookie = `${REFERRAL_COOKIE}=${token}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`;
}
