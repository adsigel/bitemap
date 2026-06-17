import { createClient } from "@/lib/supabase/server";
import { todayET, addDays } from "@/lib/et-date";

export const dynamic = "force-dynamic";

const TOP_N = 10;

interface RankedSandwich {
  id: string;
  slug: string | null;
  title: string;
  imageUrl: string;
  biteCount: number;
}

function startOfWeek(dateStr: string): string {
  const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(dateStr, -dayOfWeek);
}

async function aggregateRange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sandwichDetails: Map<string, { title: string; image_url: string; slug: string | null }>,
  start: string,
  end: string
): Promise<RankedSandwich[]> {
  if (start > end) return [];

  const { data } = await supabase
    .from("daily_leaderboard_results")
    .select("sandwich_id, bite_count")
    .gte("date", start)
    .lte("date", end);

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    totals.set(row.sandwich_id, (totals.get(row.sandwich_id) ?? 0) + row.bite_count);
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id, biteCount]) => {
      const details = sandwichDetails.get(id);
      return {
        id,
        slug: details?.slug ?? null,
        title: details?.title ?? "Unknown sandwich",
        imageUrl: details?.image_url ?? "",
        biteCount,
      };
    });
}

function Section({ title, entries }: { title: string; entries: RankedSandwich[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-stone-400">No data yet.</p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e, i) => (
            <li key={e.id}>
              <a
                href={`/sandwich/${e.slug ?? e.id}?ref=leaderboard`}
                className="group flex items-center gap-3 rounded-lg p-2 transition hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <span className="w-6 shrink-0 text-center text-sm font-bold text-stone-400">{i + 1}</span>
                <div
                  className="shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800"
                  style={{ position: "relative", width: 48, height: 48 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.imageUrl}
                    alt={e.title}
                    className="object-cover transition duration-200 group-hover:scale-105"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-700 dark:text-stone-300">{e.title}</p>
                  <p className="text-xs text-stone-400">
                    {e.biteCount} {e.biteCount === 1 ? "bite" : "bites"}
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const today = todayET();
  const yesterday = addDays(today, -1);
  const thisWeekStart = startOfWeek(today);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const lastWeekEnd = addDays(thisWeekStart, -1);

  const { data: allResults } = await supabase
    .from("daily_leaderboard_results")
    .select("sandwich_id")
    .gte("date", lastWeekStart)
    .lte("date", yesterday);

  const allIds = [...new Set((allResults ?? []).map((r) => r.sandwich_id))];

  const sandwichDetails = new Map<string, { title: string; image_url: string; slug: string | null }>();
  if (allIds.length > 0) {
    const { data: sandwiches } = await supabase
      .from("sandwiches")
      .select("id, title, image_url, slug")
      .in("id", allIds);
    sandwiches?.forEach((s) => sandwichDetails.set(s.id, s));
  }

  const [yesterdayTop, thisWeekTop, lastWeekTop] = await Promise.all([
    aggregateRange(supabase, sandwichDetails, yesterday, yesterday),
    aggregateRange(supabase, sandwichDetails, thisWeekStart, yesterday),
    aggregateRange(supabase, sandwichDetails, lastWeekStart, lastWeekEnd),
  ]);

  return (
    <div className="mx-auto max-w-lg space-y-10 px-4 py-8">
      <h1 className="text-2xl font-bold">Leaderboard</h1>
      <Section title="Yesterday's top bites" entries={yesterdayTop} />
      <Section title="This week's top bites" entries={thisWeekTop} />
      <Section title="Last week's top bites" entries={lastWeekTop} />
    </div>
  );
}
