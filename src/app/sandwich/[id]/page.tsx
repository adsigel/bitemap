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
  const { data: sandwich } = await supabase
    .from("sandwiches")
    .select("title, description, image_url")
    .eq("id", id)
    .single();

  if (!sandwich) return {};

  const description = sandwich.description ?? "Where would you take your next bite?";

  return {
    title: `${sandwich.title} — Bitemap`,
    description,
    openGraph: {
      title: sandwich.title,
      description,
      images: [{ url: sandwich.image_url, width: 1200, height: 900 }],
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
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { id } = await params;
  const { submitted } = await searchParams;
  const supabase = await createClient();

  const [{ data: sandwich }, { data: bites }] =
    await Promise.all([
      supabase.from("sandwiches").select("*").eq("id", id).single(),
      supabase.from("bites").select("x, y").eq("sandwich_id", id),
    ]);

  if (!sandwich) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <SandwichViewTracker sandwichId={sandwich.id} title={sandwich.title} />
      <h1 className="mb-1 text-center text-xl font-bold">{sandwich.title}</h1>
      {sandwich.description && (
        <p className="mb-2 text-center text-stone-500">{sandwich.description}</p>
      )}
      {submitted && !sandwich.approved && (
        <p className="mb-4 text-center text-sm text-amber-600">
          Your sandwich is pending review and will appear for others once approved.
        </p>
      )}
      <BiteCanvas
        sandwichId={sandwich.id}
        title={sandwich.title}
        imageUrl={sandwich.image_url}
        initialBites={bites ?? []}
      />
    </div>
  );
}
