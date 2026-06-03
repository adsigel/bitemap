"use client";

import { useState, useRef } from "react";
import { getSignedUploadUrl, saveSandwich } from "@/lib/sandwich-actions";

export default function AdminUploadPage() {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;

    const data = new FormData(formRef.current);
    const title = data.get("title") as string;
    const description = data.get("description") as string;
    const file = data.get("image") as File;

    if (!file?.size) return;

    setSubmitting(true);
    setStatus("Getting upload URL…");

    // Step 1: get signed URL from server (uses service role key)
    const { error: urlError, data: urlData } = await getSignedUploadUrl(file.name, file.type);
    if (urlError || !urlData) {
      setStatus(`Failed: ${urlError}`);
      setSubmitting(false);
      return;
    }

    setStatus("Uploading image…");

    // Step 2: upload directly from browser to Supabase storage
    const uploadRes = await fetch(urlData.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!uploadRes.ok) {
      setStatus(`Upload failed: ${uploadRes.statusText}`);
      setSubmitting(false);
      return;
    }

    setStatus("Saving sandwich…");

    // Step 3: save the DB record server-side
    const { error: saveError } = await saveSandwich({
      title,
      description,
      imageUrl: urlData.publicUrl,
      approved: true,
    });

    if (saveError) {
      setStatus(`DB error: ${saveError}`);
    } else {
      setStatus("Done! Sandwich added.");
      formRef.current.reset();
    }
    setSubmitting(false);
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-6 text-xl font-bold">Add a sandwich</h1>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input
            name="title"
            type="text"
            required
            placeholder="e.g. Italian Sub"
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Description <span className="text-stone-400">(optional)</span>
          </label>
          <input
            name="description"
            type="text"
            placeholder="e.g. Classic deli-style"
            className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Image</label>
          <input
            name="image"
            type="file"
            accept="image/*"
            required
            className="w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-orange-600 hover:file:bg-orange-100"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-orange-500 px-4 py-2.5 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {submitting ? "Uploading…" : "Add sandwich"}
        </button>
        {status && (
          <p className="text-center text-sm text-stone-500">{status}</p>
        )}
      </form>
    </div>
  );
}
