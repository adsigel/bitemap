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
          Bitemap is a passion project born out of a love for sandwiches and data. Piggybacking off the internet&apos;s{" "}
          <a
            href="https://knowyourmeme.com/memes/wheres-your-next-bite-sandwich-debate"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 hover:underline"
          >
            love for debating trivialities
          </a>{", "}
          I wanted to create a fun way to bring data into those conversations. Every day, a different set of sandwiches are 
          featured. You tap where you&apos;d take your next bite, then you see a heatmap of where everyone else did, and see if you 
          bite with the crowd or go your own way. That&apos;s it.  
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">How did you make it?</h2>
        <p>
          I&apos;m a career product guy, and AI-assisted development is all the rage. So, yes, this 
          sucker runs on vibe code—with a healthy dose of human QA. Bitemap is a chance for me to experiment with new things with 
          technology, as well as marketing, design, and community building. Shipping is cool, but traction is cooler. I like 
          having a project with actual users to provide data and feedback to make Bitemap better and better. It found an early 
          audience on Reddit, which is wild.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Does Bitemap make any money?</h2>
        <p>
          It sure doesn&apos;t, but it does take money to keep it running. If you&apos;re enjoying Bitemap and want 
          to support my work, you can{" "}
          <a
            href="https://ko-fi.com/bitemap"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 hover:underline"
          >
            donate a couple bucks
          </a>{" "} to help me cover development costs. Now, go get biting.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Questions</h2>
        <p>
          Shoot a note to <a href="mailto:hello@bitemap.food" className="text-orange-500 hover:underline">hello@bitemap.food</a>.
        </p>
      </section>
    </div>
  );
}
