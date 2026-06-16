"use client";

import { useState } from "react";
import Image from "next/image";
import { saveBounds } from "@/app/admin/review/actions";
import type { Point } from "@/lib/types";

interface Props {
  sandwichId: string;
  imageUrl: string;
  initialBounds: Point[] | null;
  onPolygonChange?: (bounds: Point[] | null) => void;
}

// SVG coordinate space matches the 4:3 aspect ratio so circles stay round.
const W = 100;
const H = 75;

const CLOSE_THRESHOLD = 0.04; // normalised distance to snap-close on first point

export function PolygonEditor({ sandwichId, imageUrl, initialBounds, onPolygonChange }: Props) {
  const [saved, setSaved] = useState<Point[]>(initialBounds ?? []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Point[]>([]);
  const [closed, setClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasSaved = saved.length >= 3;

  function startEditing() {
    setDraft([]);
    setClosed(false);
    setSaveError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft([]);
    setClosed(false);
    setEditing(false);
    onPolygonChange?.(saved.length >= 3 ? saved : null);
  }

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!editing || closed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (draft.length >= 3) {
      const d = Math.hypot(x - draft[0].x, y - draft[0].y);
      if (d < CLOSE_THRESHOLD) {
        setClosed(true);
        onPolygonChange?.(draft);
        return;
      }
    }
    setDraft(prev => [...prev, { x, y }]);
  }

  async function handleSave() {
    if (!closed || draft.length < 3) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveBounds(sandwichId, draft);
      setSaved(draft);
      setEditing(false);
      onPolygonChange?.(draft);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setSaveError(null);
    try {
      await saveBounds(sandwichId, null);
      setSaved([]);
      setEditing(false);
      setDraft([]);
      setClosed(false);
      onPolygonChange?.(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setSaving(false);
    }
  }

  const points = editing ? draft : saved;
  const isClosed = editing ? closed : hasSaved;

  const pathD = points.length > 1
    ? `M ${points.map(p => `${p.x * W} ${p.y * H}`).join(" L ")}${isClosed ? " Z" : ""}`
    : null;

  return (
    <div>
      <div
        className={`relative aspect-[4/3] w-full bg-stone-100 dark:bg-stone-800 ${editing && !closed ? "cursor-crosshair" : "cursor-default"}`}
        onClick={handleClick}
      >
        <Image src={imageUrl} alt="Sandwich" fill className="object-cover" sizes="672px" />

        {points.length > 0 && (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {pathD && (
              <path
                d={pathD}
                fill={isClosed ? "rgba(249,115,22,0.15)" : "none"}
                stroke="rgb(249,115,22)"
                strokeWidth="0.6"
                strokeLinejoin="round"
              />
            )}
            {points.map((p, i) => {
              const isFirst = i === 0;
              const snapTarget = isFirst && editing && !closed && draft.length >= 3;
              return (
                <circle
                  key={i}
                  cx={p.x * W}
                  cy={p.y * H}
                  r={snapTarget ? 3.5 : 2}
                  fill="white"
                  stroke="rgb(249,115,22)"
                  strokeWidth="0.7"
                />
              );
            })}
          </svg>
        )}
      </div>

      {/* Toolbar */}
      {saveError && (
        <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {saveError}
        </div>
      )}
      <div className="flex items-center gap-3 border-t border-stone-100 bg-stone-50 px-3 py-2 text-xs dark:border-stone-800 dark:bg-stone-900">
        {!editing ? (
          <>
            <span className="flex-1 text-stone-400 dark:text-stone-500">
              {hasSaved ? `Bounds set — ${saved.length} points` : "No bounds set"}
            </span>
            {hasSaved && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="text-red-600 transition hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
              >
                Clear
              </button>
            )}
            <button
              onClick={startEditing}
              className="font-medium text-orange-500 transition hover:text-orange-600"
            >
              {hasSaved ? "Edit bounds" : "Set bounds"}
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-stone-500 dark:text-stone-400">
              {closed
                ? `${draft.length} points — polygon closed`
                : draft.length === 0
                ? "Click the image to place points"
                : draft.length < 3
                ? `${draft.length} point${draft.length === 1 ? "" : "s"} — keep clicking`
                : "Click the first point to close, or use the button →"}
            </span>
            {!closed && draft.length >= 3 && (
              <button
                onClick={() => { setClosed(true); onPolygonChange?.(draft); }}
                className="font-medium text-orange-500 transition hover:text-orange-600"
              >
                Close polygon
              </button>
            )}
            <button
              onClick={() => { setDraft([]); setClosed(false); }}
              className="text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
            >
              Clear
            </button>
            {closed && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="font-medium text-emerald-600 transition hover:text-emerald-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            <button
              onClick={cancelEditing}
              className="text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
