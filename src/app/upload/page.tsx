"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getSignedUploadUrl, saveSandwich } from "@/lib/sandwich-actions";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/track";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = /\.(jpe?g|png|heic|heif|webp)$/i;

function isSupportedImageFile(file: File): boolean {
  // Some OS file pickers report an empty/generic type for HEIC/HEIF, so we
  // fall back to checking the extension rather than rejecting those files.
  if (file.type.startsWith("image/")) return true;
  return SUPPORTED_EXTENSIONS.test(file.name);
}

// HEIC only decodes in WebKit (Safari everywhere, and every browser on iOS
// is required to use WebKit under the hood) -- Chrome/Firefox/Edge on
// Android or desktop can't render it without a dedicated decoder, so we
// don't advertise HEIC support there. This only affects the hint copy, not
// the actual upload validation.
function isWebKitBrowser(): boolean {
  const ua = navigator.userAgent;
  const isIOSDevice = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOSDevice) return true;
  const isChromiumOrGecko = /Chrome|Chromium|CriOS|FxiOS|Firefox|Edg|OPR/.test(ua);
  return /Safari/.test(ua) && !isChromiumOrGecko;
}

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
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("That photo couldn't be opened. Try a JPEG or PNG instead."));
  });
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
  const [rejectedReason, setRejectedReason] = useState<"duplicate" | "not_a_sandwich" | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // Starts true to match SSR/initial-render markup, then narrows on mount
  // once we can check the UA — avoids a hydration mismatch.
  const [showHeicHint, setShowHeicHint] = useState(true);
  const titleFocusTracked = useRef(false);
  const titleChangeTracked = useRef(false);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    // Deliberately deferred to an effect rather than a lazy useState
    // initializer: computing this during the first client render would
    // mismatch the SSR'd markup (which has no navigator to check) for the
    // majority of users -- specifically Android/desktop Chrome, the case
    // this hint is for -- triggering a hydration warning on most page loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowHeicHint(isWebKitBrowser());
  }, []);

  function processFile(file: File) {
    if (!isSupportedImageFile(file)) {
      setFileError("That file type isn't supported. Use a JPEG, PNG, HEIC, or WEBP photo.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`That photo is too large — max ${MAX_FILE_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setFileError(null);
    setSrcUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setPreview(null);
    setCroppedBlob(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setIsCropping(true);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleCropConfirm() {
    if (!srcUrl || !croppedAreaPixels) return;
    track("Use Crop Clicked");
    try {
      const blob = await getCroppedImg(srcUrl, croppedAreaPixels);
      setCroppedBlob(blob);
      setPreview(URL.createObjectURL(blob));
      setIsCropping(false);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "That photo couldn't be processed. Try a different one.");
      setSrcUrl(null);
      setIsCropping(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!croppedBlob || !title.trim()) return;

    track("Submit Sandwich Clicked", { title, ...(currentUserId ? { user_id: currentUserId } : {}) });

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

    if (saveError === "duplicate" || saveError === "not_a_sandwich") {
      await track("Sandwich Uploaded", { ...baseProps, status: "rejected", failure_reason: saveError });
      setRejectedReason(saveError);
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

  function handleRetry() {
    setRejectedReason(null);
    setPreview(null);
    setCroppedBlob(null);
    setSrcUrl(null);
    setStatus(null);
    fileRef.current?.click();
  }

  // Always-present hidden file input so fileRef works from any UI state
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*,.heic,.heif"
      className="hidden"
      onChange={handleFileChange}
    />
  );

  if (rejectedReason) {
    const copy = {
      duplicate: {
        emoji: "🔁",
        heading: "We already have that one",
        body: "That exact photo is already in our library. Got a different shot of this sandwich, or another sandwich entirely?",
        cta: "Try a different photo",
      },
      not_a_sandwich: {
        emoji: "🤨",
        heading: "Our sandwich bouncer raised an eyebrow",
        body: "We couldn't confirm this was a sandwich. If you think we got it wrong, try again with a clearer photo.",
        cta: "Try again",
      },
    }[rejectedReason];

    return (
      <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center py-8 text-center">
        {fileInput}
        <div className="mb-2 text-4xl">{copy.emoji}</div>
        <h1 className="mb-2 text-2xl font-bold">{copy.heading}</h1>
        <p className="mb-8 text-stone-500">{copy.body}</p>
        <button
          onClick={handleRetry}
          className="mb-3 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white transition hover:bg-orange-600"
        >
          {copy.cta}
        </button>
        <a href="/" className="text-sm text-stone-400 hover:text-stone-600">
          Back to sandwiches
        </a>
      </div>
    );
  }

  if (uploadedId) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center py-8 text-center">
        {fileInput}
        <div className="mb-2 text-4xl">🥪</div>
        <h1 className="mb-2 text-2xl font-bold">Sandwich submitted!</h1>
        <p className="mb-8 text-stone-500">
          We&apos;ll review it, then schedule it for a future day. Create an account so we can email you the date.
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
        The best performing sandos already have a couple bites taken.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <button
          type="button"
          onClick={() => { track("Choose Photo Clicked"); fileRef.current?.click(); }}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          className={`relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${
            isDraggingOver
              ? "border-orange-400 bg-orange-100"
              : "border-stone-300 bg-stone-100 hover:border-orange-400 hover:bg-orange-100"
          }`}
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
              <span className="text-sm font-medium">Tap to choose a photo, or drag and drop</span>
              <span className="text-xs">Camera roll or camera</span>
            </div>
          )}
        </button>

        <p className="-mt-1 text-center text-xs text-stone-400">
          JPEG, PNG{showHeicHint ? ", or HEIC" : ""} · up to {MAX_FILE_BYTES / (1024 * 1024)}MB
        </p>

        {fileError && (
          <p className="text-center text-sm text-red-600">{fileError}</p>
        )}

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
            onChange={(e) => {
              setTitle(e.target.value);
              if (!titleChangeTracked.current) {
                titleChangeTracked.current = true;
                track("Sandwich Title Changed");
              }
            }}
            onFocus={() => {
              if (titleFocusTracked.current) return;
              titleFocusTracked.current = true;
              track("Sandwich Title Focused");
            }}
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
