import { createClient } from "@/lib/supabase/server";
import { renameSandwich, unpublishSandwich, toggleFeatured, removeRepeatSlot } from "./actions";
import { TimelapseExporter } from "@/components/TimelapseExporter";
import { PrintHeatmapButton } from "@/components/PrintHeatmapButton";
import { PolygonEditor } from "@/components/PolygonEditor";
import { PendingCard } from "@/components/PendingCard";
import { todayET, addDays, PIPELINE_DAYS } from "@/lib/daily-set";

export const dynamic = "force-dynamic";

function formatDayLabel(day: string, isToday: boolean): string {
  const weekdayDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
  return isToday ? `Today — ${weekdayDate}` : weekdayDate;
}

export default async function AdminReviewPage() {
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

  const slotSandwichIds = [...new Set((pipelineSlots ?? []).map((s) => s.sandwich_id))];
  const { data: slotSandwiches } =
    slotSandwichIds.length > 0
      ? await supabase.from("sandwiches").select("id, title, image_url").in("id", slotSandwichIds)
      : { data: [] };
  const slotSandwichMap = new Map((slotSandwiches ?? []).map((s) => [s.id, s]));

  const slotsByDay = new Map<string, { sandwich_id: string; is_new_release: boolean }[]>();
  for (const row of pipelineSlots ?? []) {
    const list = slotsByDay.get(row.date) ?? [];
    list.push({ sandwich_id: row.sandwich_id, is_new_release: row.is_new_release });
    slotsByDay.set(row.date, list);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Sandwich review queue</h1>
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
            }}
          />
        ))}
      </div>

      <h2 className="mb-4 mt-12 text-lg font-bold">Upcoming days</h2>
      <div className="space-y-4">
        {pipelineDays.map((day) => {
          const isToday = day === today;
          const daySlots = slotsByDay.get(day) ?? [];
          return (
            <div
              key={day}
              className="rounded-xl border border-stone-200 p-4 dark:border-stone-700"
            >
              <p className="mb-3 text-sm font-semibold text-stone-700 dark:text-stone-300">
                {formatDayLabel(day, isToday)}
              </p>
              <div className="grid grid-cols-5 gap-2">
                {daySlots.map((slot) => {
                  const sandwich = slotSandwichMap.get(slot.sandwich_id);
                  if (!sandwich) return null;
                  return (
                    <div key={slot.sandwich_id} className="text-center">
                      <div
                        className="relative mb-1 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800"
                        style={{ aspectRatio: "1" }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={sandwich.image_url}
                          alt={sandwich.title}
                          className="object-cover"
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                        />
                        {slot.is_new_release && (
                          <span className="absolute left-1 top-1 rounded bg-orange-500 px-1 text-[10px] font-bold text-white">
                            NEW
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-stone-600 dark:text-stone-300">{sandwich.title}</p>
                      {!isToday && !slot.is_new_release && (
                        <form action={removeRepeatSlot.bind(null, day, slot.sandwich_id)}>
                          <button
                            type="submit"
                            className="mt-0.5 text-[10px] text-stone-400 underline hover:text-stone-600 dark:hover:text-stone-300"
                          >
                            Swap
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
                {Array.from({ length: Math.max(0, 5 - daySlots.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="rounded-lg border border-dashed border-stone-200 dark:border-stone-700"
                    style={{ aspectRatio: "1" }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mb-4 mt-12 text-lg font-bold">Approved sandwiches</h2>
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
                    await toggleFeatured(sandwich.id, !sandwich.featured);
                  }}
                >
                  <button
                    type="submit"
                    className={`rounded-lg border px-3 py-1.5 text-xs transition hover:bg-stone-50 dark:hover:bg-stone-800 ${
                      sandwich.featured
                        ? "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400"
                        : "border-stone-200 text-stone-500 dark:border-stone-700 dark:text-stone-400"
                    }`}
                  >
                    {sandwich.featured ? "🏆 Unfeature" : "Feature"}
                  </button>
                </form>
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
  );
}
