"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  generatePrintHeatmap,
  EXPORT_SIZES,
  type PrintTheme,
  type CaptionPosition,
  type ExportSize,
  type PolygonStyle,
} from "@/lib/print-heatmap";

interface Props {
  sandwichId: string;
  title: string;
  imageUrl: string;
  biteCount: number;
  biteBounds: { x: number; y: number }[] | null;
}

type BgOption = "solid" | "transparent";

const POLYGON_OPTIONS: { value: PolygonStyle; label: string }[] = [
  { value: "none",      label: "None" },
  { value: "subtle",    label: "Subtle" },
  { value: "alternate", label: "Alternate" },
];

const CAPTION_OPTIONS: { value: CaptionPosition; label: string }[] = [
  { value: "bottom-left",   label: "Left" },
  { value: "bottom-center", label: "Center" },
  { value: "bottom-right",  label: "Right" },
  { value: "exclude",       label: "None" },
];

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-stone-200 text-xs dark:border-stone-700">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2.5 py-1.5 text-center transition ${
            value === opt.value
              ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
              : "bg-white text-stone-500 hover:bg-stone-50 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800"
          }`}
        >
          {opt.label}
          {opt.sub && <span className="ml-1 opacity-60">{opt.sub}</span>}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-xs text-stone-400 dark:text-stone-500">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function PrintHeatmapButton({ sandwichId, title, imageUrl, biteCount, biteBounds }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [theme, setTheme] = useState<PrintTheme>("dark");
  const [size, setSize] = useState<ExportSize>("small-print");
  const [captionPosition, setCaptionPosition] = useState<CaptionPosition>("bottom-center");
  const [bg, setBg] = useState<BgOption>("solid");
  const [polygonStyle, setPolygonStyle] = useState<PolygonStyle>("none");
  const supabase = createClient();

  const sizeOptions = (Object.entries(EXPORT_SIZES) as [ExportSize, typeof EXPORT_SIZES[ExportSize]][]).map(
    ([key, { label, sub }]) => ({ value: key, label, sub })
  );

  async function handleGenerate() {
    if (status) return;
    try {
      setStatus("Fetching bites…");
      const { data: bites } = await supabase
        .from("bites")
        .select("x, y")
        .eq("sandwich_id", sandwichId);

      if (!bites?.length) { setStatus(null); return; }

      setStatus("Rendering…");
      const blob = await generatePrintHeatmap({
        bites,
        imageUrl,
        title,
        biteCount,
        theme,
        size,
        captionPosition,
        transparentBg: bg === "transparent",
        polygonStyle,
        biteBounds: biteBounds ?? null,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, "-")}-${size}-${theme}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setStatus(null);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-900">
      <Row label="Tone">
        <SegmentedControl
          options={[{ value: "dark" as PrintTheme, label: "Dark" }, { value: "light" as PrintTheme, label: "Light" }]}
          value={theme}
          onChange={setTheme}
        />
      </Row>
      <Row label="Size">
        <SegmentedControl options={sizeOptions} value={size} onChange={setSize} />
      </Row>
      <Row label="Caption">
        <SegmentedControl options={CAPTION_OPTIONS} value={captionPosition} onChange={setCaptionPosition} />
      </Row>
      <Row label="Polygon">
        {biteBounds && biteBounds.length >= 3 ? (
          <SegmentedControl options={POLYGON_OPTIONS} value={polygonStyle} onChange={setPolygonStyle} />
        ) : (
          <span className="text-xs text-stone-400 dark:text-stone-600">No polygon defined</span>
        )}
      </Row>
      <Row label="Background">
        <SegmentedControl
          options={[
            { value: "solid" as BgOption, label: "Solid" },
            { value: "transparent" as BgOption, label: "Transparent" },
          ]}
          value={bg}
          onChange={setBg}
        />
      </Row>
      <button
        onClick={handleGenerate}
        disabled={!!status}
        className="w-full rounded-lg border border-stone-200 bg-white py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
      >
        {status ?? "Generate print"}
      </button>
    </div>
  );
}
