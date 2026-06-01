import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { BiteCanvas } from "@/components/BiteCanvas";
import { SandwichViewTracker } from "@/components/SandwichViewTracker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { data: sandwich } = await supabase
    .from("sandwiches")
    .select("title, description, image_url, slug")
    .eq(isUuid ? "id" : "slug", id)
    .single();

  if (!sandwich) return {};

  const description = sandwich.description
    ? `${sandwich.description} — Tap where you'd take your next bite on Bitemap.`
    : `Tap where you'd bite this ${sandwich.title}. See where everyone else bites too.`;

  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/sandwich/${sandwich.slug ?? id}`;

  return {
    title: `${sandwich.title} — Bitemap`,
    description,
    openGraph: {
      title: sandwich.title,
      description,
      url,
      type: "website",
      images: [{ url: sandwich.image_url, width: 1200, height: 900, alt: sandwich.title }],
      siteName: "Bitemap",
    },
    twitter: {
      card: "summary_large_image",
      title: sandwich.title,
      description,
      images: [sandwich.image_url],
    },
  };
}

export default async function SandwichPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submitted?: string; share?: string }>;
}) {
  const { id } = await params;
  const { submitted, share } = await searchParams;
  const supabase = await createClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const { data: sandwich } = await supabase
    .from("sandwiches")
    .select("*")
    .eq(isUuid ? "id" : "slug", id)
    .single();

  if (!sandwich) notFound();

  const { data: bites } = await supabase
    .from("bites")
    .select("x, y")
    .eq("sandwich_id", sandwich.id);

  let uploaderName: string | null = null;
  if (sandwich.uploaded_by) {
    const { data: uploader } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", sandwich.uploaded_by)
      .single();
    uploaderName = uploader?.display_name ?? null;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SandwichViewTracker sandwichId={sandwich.id} title={sandwich.title} />
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold">{sandwich.title}</h1>
        <span className="shrink-0 text-sm text-stone-500">
          {uploaderName ? `Added by ${uploaderName}` : "Added anonymously"}
        </span>
      </div>
      {sandwich.description && (
        <p className="mb-2 text-stone-500">{sandwich.description}</p>
      )}
      {submitted && !sandwich.approved && (
        <p className="mb-4 text-center text-sm text-amber-600">
          We&apos;ll send you an email once your sandwich is live — usually just a few minutes.
        </p>
      )}
      <BiteCanvas
        sandwichId={sandwich.id}
        slug={sandwich.slug}
        title={sandwich.title}
        imageUrl={sandwich.image_url}
        initialBites={bites ?? []}
        autoShare={share === "1"}
        submitted={!!submitted}
      />
    </div>
  );
}
