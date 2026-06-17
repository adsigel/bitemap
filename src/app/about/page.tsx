import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Bitemap",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-sm text-stone-700">
      <h1 className="text-2xl font-bold text-stone-900">About Bitemap</h1>

      <section className="space-y-2">
        <p>
          Bitemap started as a simple question: where would you take the next bite of a sandwich? Every day we
          feature a small set of sandwiches, and everyone who bites gets to see how their bite compares to
          everyone else&apos;s.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900">Why a daily set</h2>
        <p>
          Placeholder copy — replace with the real story. Something about keeping the pool fresh, giving every
          sandwich a fair shot at attention, and making each day&apos;s leaderboard feel like an event worth coming
          back for.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900">Got a sandwich worth biting?</h2>
        <p>
          Placeholder copy — invite people to upload their own sandwich and explain what happens after they submit
          one.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900">Questions</h2>
        <p>
          Reach us at <a href="mailto:hello@bitemap.food" className="text-orange-500 hover:underline">hello@bitemap.food</a>.
        </p>
      </section>
    </div>
  );
}
