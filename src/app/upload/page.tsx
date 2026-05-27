"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSignedUploadUrl, saveSandwich } from "@/lib/sandwich-actions";
import { track } from "@/lib/track";

export default function UploadPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !title.trim()) return;

    setSubmitting(true);
    setStatus("Getting upload URL…");

    const { error: urlError, data: urlData } = await getSignedUploadUrl(file.name, file.type);
    if (urlError || !urlData) {
      setStatus(`Failed: ${urlError}`);
      setSubmitting(false);
      return;
    }

    setStatus("Uploading photo…");

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

    setStatus("Submitting sandwich…");

    const { error: saveError, id } = await saveSandwich({
      title,
      description: "",
      imageUrl: urlData.publicUrl,
    });

    if (saveError || !id) {
      setStatus(`Error: ${saveError}`);
      setSubmitting(false);
      return;
    }

    track("Sandwich Uploaded", { title, sandwich_id: id });
    router.push(`/sandwich/${id}?submitted=1`);
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 text-center text-xl font-bold">Submit a sandwich</h1>
      <p className="mb-6 text-center text-sm text-stone-500">
        Got a sandwich with a bite taken? Share it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Photo picker — large tap target, works with camera roll + camera on mobile */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-stone-300 bg-stone-100 transition hover:border-orange-400 hover:bg-orange-50"
          style={{ aspectRatio: "4/3" }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Preview"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-stone-400">
              <svg
                className="h-12 w-12"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
                />
              </svg>
              <span className="text-sm font-medium">Tap to choose a photo</span>
              <span className="text-xs">Camera roll or camera</span>
            </div>
          )}
        </button>

        {/* Hidden file input — accept="image/*" triggers native camera/library picker on mobile */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          required
          className="hidden"
          onChange={handleFileChange}
        />

        {preview && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sm text-stone-400 underline"
          >
            Change photo
          </button>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">
            What sandwich is this?
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="e.g. BLT on sourdough"
            className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !preview}
          className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-40"
        >
          {submitting ? status ?? "Uploading…" : "Submit sandwich"}
        </button>
      </form>
    </div>
  );
}
