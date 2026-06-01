export function generateSlug(title: string, id: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 50)
    .replace(/-$/, ""); // strip trailing hyphen
  const shortId = id.replace(/-/g, "").slice(0, 8);
  return `${base}-${shortId}`;
}
