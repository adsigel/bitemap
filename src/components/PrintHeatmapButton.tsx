"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { generatePrintHeatmap, type PrintTheme } from "@/lib/print-heatmap";

interface Props {
  sandwichId: string;
  title: string;
  imageUrl: string;
  biteCount: number;
}

export function PrintHeatmapButton({ sandwichId, title, imageUrl, biteCount }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<PrintTheme>("dark");
  const supabase = createClient();

  async function handleGenerate() {
    if (status) return;
    try {
      setStatus("Fetching bites…");
      const { data: bites } = await supabase
        .from("bites")
        .select("x, y")
        .eq("sandwich_id", sandwichId);

      if (!bites?.length) {
        setStatus(null);
        return;
      }

      setStatus("Rendering…");
      const blob = await generatePrintHeatmap({ bites, imageUrl, title, biteCount, theme });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, "-")}-print-${theme}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setStatus(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-stone-200 text-xs dark:border-stone-700">
        <button
          onClick={() => setTheme("dark")}
          className={`px-2.5 py-1.5 transition ${
            theme === "dark"
              ? "bg-stone-800 text-white"
              : "bg-white text-stone-500 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800"
          }`}
        >
          Dark
        </button>
        <button
          onClick={() => setTheme("light")}
          className={`px-2.5 py-1.5 transition ${
            theme === "light"
              ? "bg-stone-100 text-stone-900"
              : "bg-white text-stone-500 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800"
          }`}
        >
          Light
        </button>
      </div>
      <button
        onClick={handleGenerate}
        disabled={!!status}
        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      >
        {status ?? "Print heatmap"}
      </button>
    </div>
  );
}
