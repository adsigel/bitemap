import { ViewTracker } from "@/components/ViewTracker";
import { SignInForm } from "@/app/sign-in/SignInForm";

function GhostSandoCard() {
  return (
    <div className="rounded-xl bg-stone-100 p-3 dark:bg-stone-900">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 rounded-lg bg-stone-300 dark:bg-stone-700" />
        <div className="min-w-0 flex-1 space-y-2 py-1">
          <div className="h-4 w-3/4 rounded bg-stone-300 dark:bg-stone-700" />
          <div className="flex gap-1">
            <div className="h-3 w-10 rounded-full bg-orange-200 dark:bg-orange-900" />
            <div className="h-3 w-14 rounded-full bg-amber-200 dark:bg-amber-900" />
          </div>
          <div className="h-3 w-1/3 rounded bg-stone-200 dark:bg-stone-800" />
        </div>
        <div className="flex shrink-0 items-end gap-0.5 pb-1">
          {[5, 9, 4, 12, 7].map((h, i) => (
            <div key={i} className="w-1 rounded-sm bg-stone-300 dark:bg-stone-600" style={{ height: h }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProfileTeaser({ biteCount }: { biteCount: number }) {
  return (
    <div className="mx-auto max-w-lg space-y-8">
      <ViewTracker event="Profile Viewed" properties={{ authenticated: false }} />

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 text-2xl dark:bg-stone-800">
          🥪
        </div>
        <div>
          <p className="font-semibold text-stone-800 dark:text-stone-100">You&apos;re biting as a guest</p>
          <p className="text-sm text-stone-500">Sign in to save this progress</p>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-8 text-center dark:border-stone-700 dark:bg-stone-800">
          <p className="text-xs text-stone-500 dark:text-stone-400">Bites Taken</p>
          <p className="mt-1 text-2xl font-bold">{biteCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-8 text-center dark:border-stone-700 dark:bg-stone-800">
          <p className="text-xs text-stone-500 dark:text-stone-400">Sandos Submitted</p>
          <p className="mt-1 text-2xl font-bold">0</p>
        </div>
      </div>

      <div className="relative rounded-xl border border-stone-200 bg-white px-6 py-8 text-center dark:border-stone-700 dark:bg-stone-800">
        <p className="text-xs text-stone-500 dark:text-stone-400">Your Bitemark</p>
        <div aria-hidden className="select-none" style={{ filter: "blur(5px)" }}>
          <p className="mt-2 text-3xl text-orange-500" style={{ fontWeight: 800 }}>Maverick</p>
          <p className="mt-2 text-stone-600 dark:text-stone-300">Your bites land where few others go.</p>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg">🔒</span>
        </div>
      </div>

      <div className="flex justify-center">
        <SignInForm next="/profile" />
      </div>

      <div>
        <h2 className="mb-3 font-semibold">Your Sandos</h2>
        <div className="relative">
          <div aria-hidden className="pointer-events-none select-none space-y-3" style={{ filter: "blur(4px)" }}>
            <GhostSandoCard />
            <GhostSandoCard />
          </div>
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <p className="rounded-full bg-white/90 px-4 py-2 text-center text-sm font-medium text-stone-600 shadow dark:bg-stone-900/90 dark:text-stone-300">
              🔒 Sign up free to unlock sando tracking and other cool features
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
