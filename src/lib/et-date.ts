// Pure date helpers, no imports -- safe to use from client or server code.
// Kept separate from daily-set.ts so client bundles (e.g. pick-next-sandwich.ts)
// don't pull in the service-role admin client.

/** Today's calendar date in US Eastern, as YYYY-MM-DD. */
export function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function etOffsetHours(dateStr: string): number {
  // Probe at noon UTC so the result is unambiguous regardless of offset.
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const tz = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  })
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  return tz === "EDT" ? 4 : 5;
}

/** UTC instant range [start, end) covering one ET calendar day. */
export function etDayBounds(dateStr: string): { start: Date; end: Date } {
  const offset = etOffsetHours(dateStr);
  const start = new Date(`${dateStr}T${String(offset).padStart(2, "0")}:00:00Z`);
  const nextDay = addDays(dateStr, 1);
  const nextOffset = etOffsetHours(nextDay);
  const end = new Date(`${nextDay}T${String(nextOffset).padStart(2, "0")}:00:00Z`);
  return { start, end };
}
