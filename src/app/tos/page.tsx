import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Bitemap",
};

export default function TosPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-sm text-stone-700 dark:text-stone-300">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">Terms of Service</h1>
      <p className="text-stone-500 dark:text-stone-400">Last updated May 31, 2026</p>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">The basics</h2>
        <p>Bitemap is a site for sharing and exploring sandwich bite patterns. By using it, you agree to these terms. We can remove content or accounts that are abusive or off-topic.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Uploading sandwiches</h2>
        <p>Only upload photos you have the right to share. By submitting one, you give Bitemap permission to display it on the site. Keep it food-related.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">No guarantees</h2>
        <p>Bitemap is provided as-is. We don&apos;t promise it&apos;ll always be up or that data will never be lost. Use it accordingly.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Liability</h2>
        <p>We&apos;re not liable for indirect or consequential damages from using the service, to the extent allowed by law.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Changes</h2>
        <p>We may update these terms. Continued use after changes means you accept them.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Questions</h2>
        <p>Reach us at <a href="mailto:hello@bitemap.food" className="text-orange-500 hover:underline">hello@bitemap.food</a>.</p>
      </section>
    </div>
  );
}
