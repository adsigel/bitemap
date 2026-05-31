import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Bitemap",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 text-sm text-stone-700">
      <h1 className="text-2xl font-bold text-stone-900">Privacy Policy</h1>
      <p className="text-stone-500">Last updated May 31, 2026</p>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900">What we collect</h2>
        <p>If you use Bitemap without an account, we store a random ID in your browser to keep you from biting the same sandwich twice. That&apos;s it — no personal info.</p>
        <p>If you sign in with Google, we get your name, profile photo, and email. We show your name and photo on sandwiches you submit. Your email is stored by our auth provider (Supabase) but never shown publicly or shared with anyone.</p>
        <p>We store the bite coordinates you place, tied to your session or account.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900">How we use it</h2>
        <p>Bite coordinates are used to draw heatmaps and compute Bitemark scores. We also use Amplitude to track how people use the app — things like page views and feature interactions — so we can make it better. None of that data is personally identifiable.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900">Third-party services</h2>
        <p>We rely on a few services to run Bitemap:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Supabase</strong> — database, file storage, and authentication</li>
          <li><strong>Vercel</strong> — hosting</li>
          <li><strong>Google</strong> — sign-in</li>
          <li><strong>Amplitude</strong> — analytics</li>
        </ul>
        <p>Each has their own privacy policy.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900">Your data</h2>
        <p>You can update your display name anytime from your profile. To delete your account and data, email us.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900">Questions</h2>
        <p>Reach us at <a href="mailto:hello@bitemap.food" className="text-orange-500 hover:underline">hello@bitemap.food</a>.</p>
      </section>
    </div>
  );
}
