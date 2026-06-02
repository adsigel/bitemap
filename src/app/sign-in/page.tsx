import { SignInForm } from "./SignInForm";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-16 text-center">
      <div className="mb-2 text-4xl">🥪</div>
      <h1 className="mb-2 text-2xl font-bold">Create an account</h1>
      <p className="mb-8 text-stone-500">
        Save your bite history across devices and track your Commonality Score.
      </p>
      {error === "auth_failed" && (
        <p className="mb-4 text-sm text-red-500">Sign-in failed. Please try again.</p>
      )}
      <SignInForm next={next} />
    </div>
  );
}
