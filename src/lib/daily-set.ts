import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export const SLOTS_PER_DAY = 5;
export const PIPELINE_DAYS = 4; // today + 3 future days

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

interface DaySlotRow {
  sandwich_id: string;
  sandwiches: { uploaded_by: string | null } | null;
}

async function getDaySlots(supabase: AdminClient, day: string): Promise<DaySlotRow[]> {
  const { data } = await supabase
    .from("daily_slots")
    .select("sandwich_id, sandwiches(uploaded_by)")
    .eq("date", day);
  return (data ?? []) as unknown as DaySlotRow[];
}

/**
 * Called once, at admin approval. Walks the pipeline forward from today and
 * places the sandwich in the first day with an open slot and no existing
 * slot from the same uploader (the per-uploader-per-day cap), extending the
 * pipeline if every day currently in it is full.
 */
export async function assignToSchedule(supabase: AdminClient, sandwichId: string): Promise<string> {
  const { data: sandwich, error } = await supabase
    .from("sandwiches")
    .select("uploaded_by")
    .eq("id", sandwichId)
    .single();
  if (error || !sandwich) throw new Error(error?.message ?? "sandwich not found");

  const today = todayET();
  let offset = 0;
  let day = today;

  while (true) {
    const slots = await getDaySlots(supabase, day);
    const uploaderTaken =
      !!sandwich.uploaded_by && slots.some((s) => s.sandwiches?.uploaded_by === sandwich.uploaded_by);
    if (slots.length < SLOTS_PER_DAY && !uploaderTaken) break;
    offset += 1;
    day = addDays(today, offset);
  }

  await supabase.from("daily_slots").insert({ date: day, sandwich_id: sandwichId, is_new_release: true });
  await supabase.from("sandwiches").update({ scheduled_for: day, first_featured_date: day }).eq("id", sandwichId);

  return day;
}

/**
 * Tops up every day in the pipeline window (today + PIPELINE_DAYS - 1) to
 * SLOTS_PER_DAY using backlog sandwiches (previously featured, not
 * currently slotted anywhere in the pipeline). Idempotent — safe to call
 * after every approval and again from the rollover cron.
 *
 * Selection order: longest-since-last-featured first. A backlog sandwich
 * with no daily_slots history at all (e.g. a v1 sandwich backfilled at
 * cutover) sorts first, ahead of anything with a recorded appearance.
 */
export async function fillPipeline(supabase: AdminClient): Promise<void> {
  const today = todayET();
  const pipelineDays = Array.from({ length: PIPELINE_DAYS }, (_, i) => addDays(today, i));
  const horizon = pipelineDays[pipelineDays.length - 1];

  const { data: pipelineSlots } = await supabase
    .from("daily_slots")
    .select("date, sandwich_id, sandwiches(uploaded_by)")
    .gte("date", today)
    .lte("date", horizon);

  const slotsByDay = new Map<string, { sandwich_id: string; uploaded_by: string | null }[]>();
  const slottedSandwichIds = new Set<string>();
  for (const row of (pipelineSlots ?? []) as unknown as (DaySlotRow & { date: string })[]) {
    slottedSandwichIds.add(row.sandwich_id);
    const list = slotsByDay.get(row.date) ?? [];
    list.push({ sandwich_id: row.sandwich_id, uploaded_by: row.sandwiches?.uploaded_by ?? null });
    slotsByDay.set(row.date, list);
  }

  const { data: backlog } = await supabase
    .from("sandwiches")
    .select("id, uploaded_by, first_featured_date")
    .eq("approved", true)
    .lt("first_featured_date", today);

  const candidates = (backlog ?? []).filter((s) => !slottedSandwichIds.has(s.id));

  const { data: history } = await supabase.from("daily_slots").select("sandwich_id, date").lt("date", today);
  const lastFeatured = new Map<string, string>();
  for (const row of history ?? []) {
    const current = lastFeatured.get(row.sandwich_id);
    if (!current || row.date > current) lastFeatured.set(row.sandwich_id, row.date);
  }
  candidates.sort((a, b) => (lastFeatured.get(a.id) ?? "").localeCompare(lastFeatured.get(b.id) ?? ""));

  const usedThisRun = new Set<string>(slottedSandwichIds);

  for (const day of pipelineDays) {
    const daySlots = slotsByDay.get(day) ?? [];
    const uploadersToday = new Set(daySlots.map((s) => s.uploaded_by).filter((id): id is string => !!id));
    let need = SLOTS_PER_DAY - daySlots.length;
    if (need <= 0) continue;

    const picked: typeof candidates = [];
    for (const candidate of candidates) {
      if (need <= 0) break;
      if (usedThisRun.has(candidate.id)) continue;
      if (candidate.uploaded_by && uploadersToday.has(candidate.uploaded_by)) continue;
      picked.push(candidate);
      usedThisRun.add(candidate.id);
      if (candidate.uploaded_by) uploadersToday.add(candidate.uploaded_by);
      need -= 1;
    }

    if (picked.length > 0) {
      await supabase
        .from("daily_slots")
        .insert(picked.map((s) => ({ date: day, sandwich_id: s.id, is_new_release: false })));
    }
  }
}

interface LeaderboardRow {
  sandwich_id: string;
  bite_count: number;
  rank: number;
}

/**
 * Midnight-ET rollover step: snapshots final bite counts/ranks for the day
 * that just ended into daily_leaderboard_results. Upserts, so it's safe to
 * re-run. Returns the snapshotted date, or null if that day had no slots
 * (shouldn't happen once the pipeline is warmed up, but defends against a
 * cold start).
 */
export async function rolloverDay(supabase: AdminClient): Promise<string | null> {
  const day = addDays(todayET(), -1);

  const { data: slots } = await supabase.from("daily_slots").select("sandwich_id").eq("date", day);
  if (!slots || slots.length === 0) return null;

  const { start, end } = etDayBounds(day);

  const counts = await Promise.all(
    slots.map(async ({ sandwich_id }) => {
      const { count } = await supabase
        .from("bites")
        .select("*", { count: "exact", head: true })
        .eq("sandwich_id", sandwich_id)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString());
      return { sandwich_id, bite_count: count ?? 0 };
    })
  );

  counts.sort((a, b) => b.bite_count - a.bite_count);
  const rows: (LeaderboardRow & { date: string })[] = counts.map((c, i) => ({
    date: day,
    sandwich_id: c.sandwich_id,
    bite_count: c.bite_count,
    rank: i + 1,
  }));

  await supabase.from("daily_leaderboard_results").upsert(rows);
  return day;
}
