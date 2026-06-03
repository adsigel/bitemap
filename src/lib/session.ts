const SESSION_KEY = "bitemap_session_id";

export function getOrCreateSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  // Mirror to cookie so server components can read it for sandwich selection
  document.cookie = `${SESSION_KEY}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  return id;
}
