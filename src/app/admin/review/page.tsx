import { createClient } from "@/lib/supabase/server";
import { renameSandwich, unpublishSandwich, toggleFeatured } from "./actions";
import { TimelapseExporter } from "@/components/TimelapseExporter";
import { PrintHeatmapButton } from "@/components/PrintHeatmapButton";
import { PolygonEditor } from "@/components/PolygonEditor";
import { PendingCard } from "@/components/PendingCard";

export const dynamic = "force-dynamic";

export default async function AdminReviewPage() {
  const supabase = await createClient();

  const [{ data: pending }, { data: approved }] = await Promise.all([
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
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Sandwich review queue</h1>
      <p className="mb-6 text-stone-500">
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

      <h2 className="mb-4 mt-12 text-lg font-bold">Approved sandwiches</h2>
      <div className="space-y-6">
        {approved?.map((sandwich) => (
          <div
            key={sandwich.id}
            className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
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
                  className="flex-1 rounded-lg border border-stone-200 px-2 py-1 text-sm font-semibold focus:border-orange-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-stone-200 px-3 py-1 text-xs text-stone-600 transition hover:bg-stone-50"
                >
                  Rename
                </button>
              </form>
              <p className="text-xs text-stone-400">
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
                    className={`rounded-lg border px-3 py-1.5 text-xs transition hover:bg-stone-50 ${
                      sandwich.featured
                        ? "border-amber-300 text-amber-600"
                        : "border-stone-200 text-stone-500"
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
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-500 transition hover:bg-stone-50"
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
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
