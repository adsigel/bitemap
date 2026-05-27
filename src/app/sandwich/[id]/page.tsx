import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BiteCanvas } from "@/components/BiteCanvas";
import { SandwichViewTracker } from "@/components/SandwichViewTracker";

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
        imageUrl={sandwich.image_url}
        initialBites={bites ?? []}
      />
    </div>
  );
}
