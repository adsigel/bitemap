"use client";

import { useState } from "react";
import { PolygonEditor } from "@/components/PolygonEditor";
import { approveWithBounds, rejectSandwich, renameSandwich } from "@/app/admin/review/actions";
import type { Point } from "@/lib/types";

interface Sandwich {
  id: string;
  title: string;
  description: string | null;
  image_url: string;
  bite_bounds: Point[] | null;
  created_at: string;
}

export function PendingCard({ sandwich }: { sandwich: Sandwich }) {
  const [currentBounds, setCurrentBounds] = useState<Point[] | null>(sandwich.bite_bounds);
  const [approving, setApproving] = useState(false);

  async function handleApprove() {
    setApproving(true);
    await approveWithBounds(sandwich.id, currentBounds);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <PolygonEditor
        sandwichId={sandwich.id}
        imageUrl={sandwich.image_url}
        initialBounds={sandwich.bite_bounds}
        onPolygonChange={setCurrentBounds}
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
          <button
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {approving ? "Approving…" : "Approve"}
          </button>
          <form action={rejectSandwich.bind(null, sandwich.id)} className="flex-1">
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
  );
}
