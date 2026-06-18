import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StaticHeatmap } from "@/components/StaticHeatmap";
import { TestimonialsCarousel } from "@/components/TestimonialsCarousel";
import { AddSandoLink } from "@/components/AddSandoLink";

export const metadata: Metadata = {
  title: "Bitemap — Your bite vs. everyone else's",
  description: "Place your bite on a sandwich and see where everyone else bites too. Bitemap turns a simple question into something surprisingly social.",
  openGraph: {
    title: "Bitemap — Your bite vs. everyone else's",
    description: "Place your bite on a sandwich and see where everyone else bites too. Bitemap turns a simple question into something surprisingly social.",
    url: `${process.env.NEXT_PUBLIC_SITE_URL}/welcome`,
    siteName: "Bitemap",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bitemap — Your bite vs. everyone else's",
    description: "Place your bite on a sandwich and see where everyone else bites too.",
  },
};

export default async function WelcomePage() {
  const supabase = await createClient();

  const { data: featured } = await supabase
    .from("sandwiches_with_count")
    .select("id, title, image_url")
    .eq("approved", true)
    .order("bite_count", { ascending: false })
    .limit(1)
    .single();

  const bites: { x: number; y: number }[] = [];
  if (featured) {
    const { data } = await supabase
      .from("bites")
      .select("x, y")
      .eq("sandwich_id", featured.id);
    bites.push(...(data ?? []));
  }

  return (
    <div className="-mx-4 -my-8">

      {/* Hero */}
      <section className="px-4 py-16">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <h1 className="mb-5 text-4xl font-bold leading-tight text-stone-900 dark:text-white sm:text-5xl">
              Where would you bite?
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-stone-500 dark:text-stone-400">
              Tap where you&apos;d take your
              next bite on a real sandwich, then see exactly where everyone else did. Five fresh sandos, every day.
            </p>
            <div className="mb-10">
              <Link
                href="/"
                className="inline-block rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
              >
                Bite today&apos;s sandos →
              </Link>
            </div>
          </div>

          {featured ? (
            <StaticHeatmap imageUrl={featured.image_url} bites={bites} title={featured.title} />
          ) : (
            <div className="aspect-[4/3] rounded-2xl bg-stone-100 dark:bg-stone-800" />
          )}
        </div>
      </section>

      {/* Divider */}
      <div className="mx-4 border-t border-stone-200 dark:border-stone-700" />

      {/* How it works */}
      <section className="px-4 py-16">
        <h2 className="mb-10 text-center text-2xl font-bold text-stone-900 dark:text-white">How it works</h2>
        <div className="grid gap-10 sm:grid-cols-3">
          <div className="text-center">
            <div className="mb-4 text-4xl">👆</div>
            <h3 className="mb-2 font-semibold text-stone-800 dark:text-stone-100">Place your bite</h3>
            <p className="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
              Tap wherever you&apos;d take your next bite. No wrong answers, just your taste.
            </p>
          </div>
          <div className="text-center">
            <div className="mb-4 text-4xl">🔥</div>
            <h3 className="mb-2 font-semibold text-stone-800 dark:text-stone-100">Watch the map fill in</h3>
            <p className="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
              See where the crowd bit. Corner biter? Center attacker? The map doesn&apos;t lie.
            </p>
          </div>
          <div className="text-center">
            <div className="mb-4 text-4xl">📅</div>
            <h3 className="mb-2 font-semibold text-stone-800 dark:text-stone-100">Come back tomorrow</h3>
            <p className="text-sm leading-relaxed text-stone-500 dark:text-stone-400">
              Five new sandos drop every day. Today&apos;s are only here today.
            </p>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="mx-4 border-t border-stone-200 dark:border-stone-700" />

      {/* Testimonials */}
      <section className="px-4 py-16">
        <h2 className="mb-10 text-center text-2xl font-bold text-stone-900 dark:text-white">Backhanded praise for Bitemap</h2>
        <TestimonialsCarousel />
      </section>

      {/* Divider */}
      <div className="mx-4 border-t border-stone-200 dark:border-stone-700" />

      {/* Upload CTA */}
      <section className="px-4 py-16 text-center">
        <h2 className="mb-3 text-2xl font-bold text-stone-900 dark:text-white">
          Got a sandwich worth arguing over?
        </h2>
        <p className="mb-8 text-stone-500 dark:text-stone-400">
          Add it, and it might headline tomorrow&apos;s drop.
        </p>
        <AddSandoLink
          source="welcome"
          className="inline-block rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
        >
          Add a sando
        </AddSandoLink>
      </section>

      {/* CTA footer */}
      <section className="bg-orange-500 px-4 py-16 text-center">
        <h2 className="mb-3 text-3xl font-bold text-white">Ready to place your bite?</h2>
        <p className="mb-8 text-orange-100">
          Free to use. No account required to start biting.
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-white px-6 py-3 font-semibold text-orange-500 transition hover:bg-orange-50"
        >
          Open Bitemap →
        </Link>
      </section>

    </div>
  );
}
