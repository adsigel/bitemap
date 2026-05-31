"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";

export function DisplayNameEditor({ userId, initialName }: { userId: string; initialName: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    await supabase.from("profiles").update({ display_name: draft.trim() }).eq("id", userId);
    track("Username Edited");
    setName(draft.trim());
    setEditing(false);
    setSaving(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold">{name}</span>
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-stone-400 hover:text-stone-600"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={50}
        autoFocus
        className="rounded-lg border border-stone-200 px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setDraft(name); setEditing(false); } }}
      />
      <button
        onClick={handleSave}
        disabled={saving || !draft.trim()}
        className="rounded-lg bg-orange-500 px-3 py-1 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => { setDraft(name); setEditing(false); }}
        className="text-sm text-stone-400 hover:text-stone-600"
      >
        Cancel
      </button>
    </div>
  );
}
