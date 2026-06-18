import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — Bitemap",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-sm text-stone-700 dark:text-stone-300">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">About Bitemap</h1>

      <section className="space-y-2">
        <p>
          Bitemap is a passion project born out of a love for sandwiches and data. Piggbybacking off the internet&apos;s{" "}
          <a
            href="https://www.youtube.com/watch?v=WZIVjeDOLMw"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 hover:underline"
          >
            love for debating trivialities
          </a>{" "}
          next work here.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">How does it work</h2>
        <p>
          Placeholder copy — replace with the real story. Something about keeping the pool fresh, giving every
          sandwich a fair shot at attention, and making each day&apos;s leaderboard feel like an event worth coming
          back for.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Got a sandwich worth biting?</h2>
        <p>
          Placeholder copy — invite people to upload their own sandwich and explain what happens after they submit
          one.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Questions</h2>
        <p>
          Reach us at <a href="mailto:hello@bitemap.food" className="text-orange-500 hover:underline">hello@bitemap.food</a>.
        </p>
      </section>
    </div>
  );
}
