import type { Metadata } from "next";
import { Suspense } from "react";
import { Fustat } from "next/font/google";
import { AmplitudeProvider } from "@/components/AmplitudeProvider";
import { AccountCreatedTracker } from "@/components/AccountCreatedTracker";
import { Header } from "@/components/Header";
import { DonationLink } from "@/components/DonationLink";
import "./globals.css";

const fustat = Fustat({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Bitemap",
  description: "Where would you take your next bite?",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${fustat.className} flex min-h-screen flex-col bg-stone-50 text-stone-900 antialiased dark:bg-stone-950 dark:text-stone-100`}>
        <AmplitudeProvider apiKey={process.env.AMPLITUDE_API_KEY!}>
        <Suspense fallback={null}><AccountCreatedTracker /></Suspense>
        <Header />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-stone-200 bg-white px-4 py-3 text-xs text-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-500">
          <div className="flex items-center justify-center gap-6">
            <span>© 2026 Bitemap</span>
            <a href="/about" className="hover:text-stone-600">About</a>
            <a href="/privacy" className="hover:text-stone-600">Privacy</a>
            <a href="/tos" className="hover:text-stone-600">Terms</a>
            <DonationLink source="footer" className="hover:text-stone-600">Support Bitemap ☕</DonationLink>
          </div>
        </footer>
        </AmplitudeProvider>
      </body>
    </html>
  );
}
