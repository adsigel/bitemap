"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getSignedUploadUrl, saveSandwich } from "@/lib/sandwich-actions";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";

async function computeHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise<void>((resolve) => { image.onload = () => resolve(); });
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed"))),
      "image/jpeg",
      0.92
    )
  );
}

export default function UploadPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [srcUrl, setSrcUrl] = useState<string | null>(null);      // raw file — used by Cropper
  const [fileName, setFileName] = useState("sandwich.jpg");
  const [preview, setPreview] = useState<string | null>(null);    // cropped blob URL — shown in form
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);

  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [uploadedSlug, setUploadedSlug] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, [supabase]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSrcUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setPreview(null);
    setCroppedBlob(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setIsCropping(true);
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleCropConfirm() {
    if (!srcUrl || !croppedAreaPixels) return;
    const blob = await getCroppedImg(srcUrl, croppedAreaPixels);
    setCroppedBlob(blob);
    setPreview(URL.createObjectURL(blob));
    setIsCropping(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!croppedBlob || !title.trim()) return;

    setSubmitting(true);
    setStatus("Getting upload URL…");

    const { error: urlError, data: urlData } = await getSignedUploadUrl(fileName, "image/jpeg");
    if (urlError || !urlData) {
      setStatus(`Failed: ${urlError}`);
      setSubmitting(false);
      return;
    }

    setStatus("Uploading photo…");

    const uploadRes = await fetch(urlData.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: croppedBlob,
    });

    if (!uploadRes.ok) {
      setStatus(`Upload failed: ${uploadRes.statusText}`);
      setSubmitting(false);
      return;
    }

    setStatus("Submitting sandwich…");

    const imageHash = await computeHash(croppedBlob);
    const { error: saveError, id, slug } = await saveSandwich({
      title,
      description: "",
      imageUrl: urlData.publicUrl,
      imageHash,
      uploadedBy: currentUserId,
    });

    const baseProps = { title, ...(currentUserId ? { user_id: currentUserId } : {}) };

    if (saveError === "duplicate") {
      await track("Sandwich Uploaded", { ...baseProps, status: "rejected", failure_reason: "duplicate" });
      setStatus("This sandwich has already been submitted!");
      setSubmitting(false);
      return;
    }

    if (saveError === "not_a_sandwich") {
      await track("Sandwich Uploaded", { ...baseProps, status: "rejected", failure_reason: "not_a_sandwich" });
      setStatus("That doesn't look like a sandwich to us. Got a different photo?");
      setSubmitting(false);
      return;
    }

    if (saveError || !id) {
      setStatus(`Error: ${saveError}`);
      setSubmitting(false);
      return;
    }

    await track("Sandwich Uploaded", { ...baseProps, status: "success", sandwich_id: id });
    if (currentUserId) {
      router.push(`/sandwich/${slug ?? id}?submitted=1`);
    } else {
      setUploadedSlug(slug);
      setUploadedId(id);
      setSubmitting(false);
    }
  }

  // Always-present hidden file input so fileRef works from any UI state
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleFileChange}
    />
  );

  if (uploadedId) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center py-16 text-center">
        {fileInput}
        <div className="mb-2 text-4xl">🥪</div>
        <h1 className="mb-2 text-2xl font-bold">Sandwich submitted!</h1>
        <p className="mb-8 text-stone-500">
          It&apos;ll show up once we review it. Create an account to track your submissions.
        </p>
        <a
          href="/sign-in"
          className="mb-3 w-full rounded-xl bg-orange-500 px-4 py-3 text-center font-semibold text-white transition hover:bg-orange-600"
        >
          Create a free account
        </a>
        <a href={`/sandwich/${uploadedSlug ?? uploadedId}`} className="text-sm text-stone-400 hover:text-stone-600">
          Skip for now
        </a>
      </div>
    );
  }

  if (isCropping && srcUrl) {
    return (
      <div className="mx-auto max-w-lg">
        {fileInput}
        <h1 className="mb-1 text-center text-xl font-bold">Frame your sandwich</h1>
        <p className="mb-4 text-center text-sm text-stone-500">
          Drag to reposition, pinch or slide to zoom.
        </p>

        <div className="relative w-full overflow-hidden rounded-2xl bg-stone-900" style={{ aspectRatio: "4/3" }}>
          <Cropper
            image={srcUrl}
            crop={crop}
            zoom={zoom}
            aspect={4 / 3}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="mt-4 px-1">
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-orange-500"
            aria-label="Zoom"
          />
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={handleCropConfirm}
            className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600"
          >
            Use this crop
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-center text-sm text-stone-400 transition hover:text-stone-600"
          >
            Choose a different photo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      {fileInput}
      <h1 className="mb-1 text-center text-xl font-bold">Submit a sandwich</h1>
      <p className="mb-6 text-center text-sm text-stone-500">
        Got a sandwich with a bite taken? Share it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-stone-300 bg-stone-100 transition hover:border-orange-400 hover:bg-orange-100"
          style={{ aspectRatio: "4/3" }}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Preview" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-stone-400">
              <svg className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
              <span className="text-sm font-medium">Tap to choose a photo</span>
              <span className="text-xs">Camera roll or camera</span>
            </div>
          )}
        </button>

        {preview && (
          <div className="flex gap-4 text-sm text-stone-400">
            <button type="button" onClick={() => fileRef.current?.click()} className="underline transition hover:text-stone-600">
              Change photo
            </button>
            <button type="button" onClick={() => setIsCropping(true)} className="underline transition hover:text-stone-600">
              Re-crop
            </button>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">What sandwich is this?</label>
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
          disabled={submitting || !croppedBlob}
          className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:opacity-40"
        >
          {submitting ? status ?? "Uploading…" : "Submit sandwich"}
        </button>
      </form>
    </div>
  );
}
