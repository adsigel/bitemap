import { createClient } from "@/lib/supabase/server";
import { approveSandwich, rejectSandwich, renameSandwich } from "./actions";
import { TimelapseExporter } from "@/components/TimelapseExporter";
import { PolygonEditor } from "@/components/PolygonEditor";

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
              {sandwich.description && (
                <p className="text-sm text-stone-500">{sandwich.description}</p>
              )}
              <p className="mt-1 text-xs text-stone-400">
                Submitted {new Date(sandwich.created_at).toLocaleString()}
              </p>
              <div className="mt-4 flex gap-3">
                <form
                  action={async () => {
                    "use server";
                    await approveSandwich(sandwich.id);
                  }}
                  className="flex-1"
                >
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-green-500 px-4 py-2 font-medium text-white transition hover:bg-green-600"
                  >
                    Approve
                  </button>
                </form>
                <form
                  action={async () => {
                    "use server";
                    await rejectSandwich(sandwich.id);
                  }}
                  className="flex-1"
                >
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2 font-medium text-red-600 transition hover:bg-red-100"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </div>
          </div>
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
              <TimelapseExporter
                sandwichId={sandwich.id}
                title={sandwich.title}
                imageUrl={sandwich.image_url}
                biteCount={sandwich.bite_count}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
