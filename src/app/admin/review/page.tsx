import { createClient } from "@/lib/supabase/server";
import { renameSandwich, unpublishSandwich, swapRepeatSlot } from "./actions";
import { TimelapseExporter } from "@/components/TimelapseExporter";
import { PrintHeatmapButton } from "@/components/PrintHeatmapButton";
import { PolygonEditor } from "@/components/PolygonEditor";
import { PendingCard } from "@/components/PendingCard";
import { todayET, addDays, PIPELINE_DAYS } from "@/lib/daily-set";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "review", label: "Review" },
  { key: "queue", label: "Queue" },
  { key: "library", label: "Library" },
] as const;

type Tab = (typeof TABS)[number]["key"];

function formatDayLabel(day: string, isToday: boolean): string {
  const weekdayDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
  return isToday ? `Today — ${weekdayDate}` : weekdayDate;
}

// For date-only strings (YYYY-MM-DD) like daily_slots.date.
function formatShortDate(day: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(
    new Date(`${day}T12:00:00Z`)
  );
}

// For full timestamps like sandwiches.created_at.
function formatShortTimestamp(ts: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(
    new Date(ts)
  );
}

export default async function AdminReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; swapError?: string }>;
}) {
  const { tab: tabParam, swapError } = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : "review";

  const supabase = await createClient();

  const today = todayET();
  const pipelineDays = Array.from({ length: PIPELINE_DAYS }, (_, i) => addDays(today, i));

  const [{ data: pending }, { data: approved }, { data: pipelineSlots }] = await Promise.all([
    supabase
      .from("sandwiches")
      .select("*")
      .eq("approved", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("sandwiches_with_count")
      .select("*")
      .eq("approved", true)
      .order("bite_count", { ascending: false }),
    supabase
      .from("daily_slots")
      .select("date, sandwich_id, is_new_release")
      .gte("date", today)
      .lte("date", pipelineDays[pipelineDays.length - 1]),
  ]);

  const pendingUploaderIds = [...new Set((pending ?? []).map((s) => s.uploaded_by).filter((id): id is string => !!id))];
  const { data: pendingUploaderProfiles } =
    pendingUploaderIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", pendingUploaderIds)
      : { data: [] };
  const pendingUploaderNameMap = new Map((pendingUploaderProfiles ?? []).map((p) => [p.id, p.display_name]));

  const slotSandwichIds = [...new Set((pipelineSlots ?? []).map((s) => s.sandwich_id))];

  const [
    { data: slotSandwiches, error: slotSandwichesError },
    { data: history },
    { data: backlogCandidates, error: backlogError },
  ] = await Promise.all([
    slotSandwichIds.length > 0
      ? supabase
          .from("sandwiches_with_count")
          .select("id, title, image_url, created_at, uploaded_by, bite_count")
          .in("id", slotSandwichIds)
      : Promise.resolve({ data: [], error: null }),
    slotSandwichIds.length > 0
      ? supabase.from("daily_slots").select("sandwich_id, date").in("sandwich_id", slotSandwichIds).lt("date", today)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("sandwiches_with_count")
      .select("id, title, bite_count, uploaded_by")
      .eq("approved", true)
      .lt("first_featured_date", today)
      .order("title", { ascending: true }),
  ]);

  if (slotSandwichesError) console.error("slotSandwiches query error:", slotSandwichesError);
  if (backlogError) console.error("backlogCandidates query error:", backlogError);

  const slotSandwichMap = new Map((slotSandwiches ?? []).map((s) => [s.id, s]));

  const uploaderIds = [...new Set((slotSandwiches ?? []).map((s) => s.uploaded_by).filter((id): id is string => !!id))];
  const { data: uploaderProfiles } =
    uploaderIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", uploaderIds)
      : { data: [] };
  const uploaderNameMap = new Map((uploaderProfiles ?? []).map((p) => [p.id, p.display_name]));

  const lastFeaturedMap = new Map<string, string>();
  for (const row of history ?? []) {
    const current = lastFeaturedMap.get(row.sandwich_id);
    if (!current || row.date > current) lastFeaturedMap.set(row.sandwich_id, row.date);
  }

  // Base candidate pool for any swap: backlog sandwiches not already sitting
  // in some other slot in the pipeline window. Narrowed further per-day
  // below, so the dropdown never offers a choice that would violate the
  // per-uploader-per-day cap.
  const baseCandidates = (backlogCandidates ?? []).filter((c) => !slotSandwichIds.includes(c.id));

  const slotsByDay = new Map<string, { sandwich_id: string; is_new_release: boolean }[]>();
  for (const row of pipelineSlots ?? []) {
    const list = slotsByDay.get(row.date) ?? [];
    list.push({ sandwich_id: row.sandwich_id, is_new_release: row.is_new_release });
    slotsByDay.set(row.date, list);
  }

  // Two kinds of candidate for a given day's slot: an unused backlog
  // sandwich (simple 1-for-1 replace), or a sandwich currently scheduled
  // on a different non-today day (a full exchange -- the displaced
  // sandwich moves into this slot's old spot, so nothing is dropped).
  function candidatesForDay(day: string) {
    const uploadersToday = new Set(
      (slotsByDay.get(day) ?? [])
        .map((s) => slotSandwichMap.get(s.sandwich_id)?.uploaded_by)
        .filter((id): id is string => !!id)
    );

    const backlog = baseCandidates
      .filter((c) => !c.uploaded_by || !uploadersToday.has(c.uploaded_by))
      .map((c) => ({ id: c.id, title: c.title, biteCount: c.bite_count, currentDate: null as string | null }));

    const scheduledElsewhere = pipelineDays
      .filter((d) => d !== day && d !== today)
      .flatMap((d) =>
        (slotsByDay.get(d) ?? [])
          .filter((s) => !s.is_new_release)
          .map((s) => slotSandwichMap.get(s.sandwich_id))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .filter((s) => !s.uploaded_by || !uploadersToday.has(s.uploaded_by))
          .map((s) => ({ id: s.id, title: s.title, biteCount: s.bite_count, currentDate: d }))
      );

    return { backlog, scheduledElsewhere };
  }

  return (
    <div className={`mx-auto ${tab === "queue" ? "max-w-5xl" : "max-w-2xl"}`}>
      <h1 className="mb-4 text-xl font-bold">Admin</h1>

      <nav className="mb-8 flex gap-1 border-b border-stone-200 dark:border-stone-700">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={t.key === "review" ? "/admin/review" : `/admin/review?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "border-orange-500 text-orange-600 dark:text-orange-400"
                : "border-transparent text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            }`}
          >
            {t.label}
            {t.key === "review" && pending?.length ? ` (${pending.length})` : ""}
          </a>
        ))}
      </nav>

      {tab === "review" && (
        <div>
          <p className="mb-6 text-stone-500 dark:text-stone-400">
            {pending?.length
              ? `${pending.length} sandwich${pending.length === 1 ? "" : "es"} pending approval`
              : "All clear — nothing pending."}
          </p>
          <div className="space-y-6">
            {pending?.map((sandwich) => (
              <PendingCard
                key={sandwich.id}
                sandwich={{
                  id: sandwich.id,
                  title: sandwich.title,
                  description: sandwich.description,
                  image_url: sandwich.image_url,
                  bite_bounds: sandwich.bite_bounds as { x: number; y: number }[] | null,
                  created_at: sandwich.created_at,
                  uploaderName: sandwich.uploaded_by ? pendingUploaderNameMap.get(sandwich.uploaded_by) ?? "Unknown" : "Admin",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "queue" && (
        <div>
          {swapError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              That swap couldn&apos;t be made — the sandwich you picked is no longer available for that day (it may have just been scheduled elsewhere, or its uploader already has a sandwich there). Refresh and try again.
            </div>
          )}
          <p className="mb-6 text-stone-500 dark:text-stone-400">
            Today through the next {PIPELINE_DAYS - 1} days. Swap a repeat slot to pull in a different backlog sandwich for that day.
          </p>
          <div className="space-y-4">
            {pipelineDays.map((day) => {
              const isToday = day === today;
              const daySlots = slotsByDay.get(day) ?? [];
              const dayCandidates = candidatesForDay(day);
              return (
                <div
                  key={day}
                  className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"
                >
                  <p className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">
                    {formatDayLabel(day, isToday)}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {daySlots.map((slot) => {
                      const sandwich = slotSandwichMap.get(slot.sandwich_id);
                      if (!sandwich) return null;
                      const uploaderName = sandwich.uploaded_by
                        ? uploaderNameMap.get(sandwich.uploaded_by) ?? "Unknown"
                        : "Admin";
                      const lastFeatured = lastFeaturedMap.get(slot.sandwich_id);
                      return (
                        <div
                          key={slot.sandwich_id}
                          className="rounded-lg border border-stone-100 p-2 dark:border-stone-800"
                          style={{ width: 256 }}
                        >
                          <div
                            className="relative mb-2 overflow-hidden rounded-md bg-stone-100 dark:bg-stone-800"
                            style={{ width: 256, height: 256 }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={sandwich.image_url}
                              alt={sandwich.title}
                              className="object-cover"
                              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                            />
                            {slot.is_new_release && (
                              <span className="absolute left-1 top-1 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                NEW
                              </span>
                            )}
                          </div>
                          <p className="truncate text-sm font-medium text-stone-700 dark:text-stone-300">
                            {sandwich.title}
                          </p>
                          <p className="mb-2 text-xs text-stone-400">
                            {sandwich.bite_count} bites · by {uploaderName}
                            <br />
                            uploaded {formatShortTimestamp(sandwich.created_at)} · last featured{" "}
                            {lastFeatured ? formatShortDate(lastFeatured) : "never"}
                          </p>
                          {!isToday && !slot.is_new_release && (
                            dayCandidates.backlog.length + dayCandidates.scheduledElsewhere.length > 0 ? (
                              <form
                                action={swapRepeatSlot.bind(null, day, slot.sandwich_id)}
                                className="flex items-center gap-1"
                              >
                                <select
                                  name="newSandwichId"
                                  defaultValue=""
                                  required
                                  className="min-w-0 flex-1 rounded border border-stone-200 bg-white px-1 py-1 text-xs dark:border-stone-700 dark:bg-stone-800"
                                >
                                  <option value="" disabled>
                                    Swap for…
                                  </option>
                                  {dayCandidates.backlog.length > 0 && (
                                    <optgroup label="Backlog">
                                      {dayCandidates.backlog.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.title} ({c.biteCount})
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  {dayCandidates.scheduledElsewhere.length > 0 && (
                                    <optgroup label="Currently scheduled">
                                      {dayCandidates.scheduledElsewhere.map((c) => (
                                        <option key={c.id} value={c.id}>
                                          {c.title} ({c.biteCount}) — {formatShortDate(c.currentDate!)}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                                <button
                                  type="submit"
                                  className="rounded border border-stone-200 px-2 py-1 text-xs text-stone-500 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
                                >
                                  Swap
                                </button>
                              </form>
                            ) : (
                              <p className="text-xs text-stone-300 dark:text-stone-600">No candidates available</p>
                            )
                          )}
                        </div>
                      );
                    })}
                    {Array.from({ length: Math.max(0, 5 - daySlots.length) }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="rounded-lg border border-dashed border-stone-200 dark:border-stone-700"
                        style={{ width: 256, height: 256 }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === "library" && (
        <div>
          <p className="mb-6 text-stone-500 dark:text-stone-400">
            {approved?.length ?? 0} live sandwich{approved?.length === 1 ? "" : "es"}
          </p>
          <div className="space-y-6">
            {approved?.map((sandwich) => (
              <div
                key={sandwich.id}
                className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900"
              >
                <PolygonEditor
                  sandwichId={sandwich.id}
                  imageUrl={sandwich.image_url}
                  initialBounds={sandwich.bite_bounds as { x: number; y: number }[] | null}
                />
                <div className="p-4">
                  <form action={renameSandwich.bind(null, sandwich.id)} className="mb-1 flex gap-2">
                    <input
                      name="title"
                      defaultValue={sandwich.title}
                      className="flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm font-semibold text-stone-800 focus:border-orange-400 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500 dark:focus:border-orange-500"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-stone-200 px-3 py-1 text-xs text-stone-600 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-700"
                    >
                      Rename
                    </button>
                  </form>
                  <p className="text-xs text-stone-400 dark:text-stone-500">
                    {sandwich.bite_count} bite{sandwich.bite_count === 1 ? "" : "s"}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <form
                      action={async () => {
                        "use server";
                        await unpublishSandwich(sandwich.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-500 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
                      >
                        Unpublish
                      </button>
                    </form>
                  </div>
                  <TimelapseExporter
                    sandwichId={sandwich.id}
                    title={sandwich.title}
                    imageUrl={sandwich.image_url}
                    biteCount={sandwich.bite_count}
                  />
                  <div className="mt-2">
                    <PrintHeatmapButton
                      sandwichId={sandwich.id}
                      title={sandwich.title}
                      imageUrl={sandwich.image_url}
                      biteCount={sandwich.bite_count}
                      biteBounds={sandwich.bite_bounds as { x: number; y: number }[] | null}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
