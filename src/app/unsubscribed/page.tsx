import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Unsubscribed — Bitemap",
};

export default async function UnsubscribedPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const { ok } = await searchParams;
  const failed = ok === "0";

  return (
    <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-stone-900">
        {failed ? "Something went wrong" : "You're unsubscribed"}
      </h1>
      <p className="text-stone-500">
        {failed
          ? "We couldn't find that link. If you're still getting emails you don't want, reply to any of them and we'll take care of it."
          : "You won't get daily recap or bite-milestone emails anymore. You'll still hear about your own sandwich's review status."}
      </p>
      <Link href="/" className="inline-block text-orange-500 hover:underline">
        Back to Bitemap
      </Link>
    </div>
  );
}
