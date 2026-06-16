"use client";

import { useState } from "react";
import { getOrCreateReferralToken } from "@/lib/referral-actions";
import { Sparkline } from "@/components/Sparkline";
import { TimelapseButton } from "@/components/TimelapseButton";
import { updateCreatorContent } from "@/lib/creator-actions";

interface Props {
  id: string;
  slug?: string | null;
  title: string;
  imageUrl: string;
  biteCount: number;
  isHot: boolean;
  isFeatured: boolean;
  sparklineData: number[];
  userId: string;
  creatorFeatures?: boolean;
  creatorNote?: string | null;
  creatorUrl?: string | null;
}

export function SandwichCreatorCard({ id, slug, title, imageUrl, biteCount, isHot, isFeatured, sparklineData, userId, creatorFeatures, creatorNote: initialNote, creatorUrl: initialUrl }: Props) {
  const [isSharing, setIsSharing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [note, setNote] = useState(initialNote ?? "");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const weeklyBites = sparklineData.reduce((a, b) => a + b, 0);

  async function handleShare() {
    setIsSharing(true);
    try {
      const refToken = await getOrCreateReferralToken(userId).catch(() => null);
      const shareUrl = `https://bitemap.food/sandwich/${slug ?? id}${refToken ? `?ref=${refToken}` : ""}`;
      const text = `I put this ${title} on Bitemap — where would you bite?\n${shareUrl}`;
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text).catch(() => {});
      }
    } finally {
      setIsSharing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const { error } = await updateCreatorContent(id, note, url);
    if (error) {
      setSaveError(error);
    } else {
      setEditOpen(false);
    }
    setSaving(false);
  }

  return (
    <div className="rounded-xl bg-stone-100 p-3 dark:bg-stone-900">
      <a
        href={`/sandwich/${slug ?? id}`}
        className="mb-3 flex gap-3 transition hover:opacity-80"
      >
        <div
          className="relative shrink-0 overflow-hidden rounded-lg bg-stone-300 dark:bg-stone-700"
          style={{ width: 80, height: 80 }}
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={title} className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-stone-800 dark:text-stone-100">{title}</p>
          {(isHot || isFeatured) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {isHot && (
                <span className="rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs dark:border-stone-600 dark:bg-stone-700">
                  🔥 hot
                </span>
              )}
              {isFeatured && (
                <span className="rounded-full border border-stone-300 bg-white px-2 py-0.5 text-xs dark:border-stone-600 dark:bg-stone-700">
                  🏆 featured
                </span>
              )}
            </div>
          )}
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {biteCount} {biteCount === 1 ? "bite" : "bites"}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <Sparkline data={sparklineData} />
          {weeklyBites > 0 && (
            <p className="text-xs text-stone-400">+{weeklyBites} this week</p>
          )}
        </div>
      </a>

      <div className="flex gap-2">
        <button
          onClick={handleShare}
          disabled={isSharing}
          className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {isSharing ? "Sharing…" : "Share"}
        </button>
        {biteCount >= 50 && (
          <TimelapseButton
            sandwichId={id}
            title={title}
            imageUrl={imageUrl}
            biteCount={biteCount}
            className="flex-1"
          />
        )}
      </div>

      {creatorFeatures && (
        <div className="mt-3 border-t border-stone-200 pt-3 dark:border-stone-700">
          {!editOpen ? (
            <button
              onClick={() => setEditOpen(true)}
              className="text-xs text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
            >
              {note || url ? "Edit partner content" : "Add partner content"}
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Description (shown below the heatmap)"
                rows={2}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-400 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
              />
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="Link URL (https://…)"
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:border-orange-400 focus:outline-none dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:placeholder-stone-500"
              />
              {saveError && (
                <p className="text-xs text-red-500">{saveError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => { setEditOpen(false); setSaveError(null); }}
                  className="text-xs text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
