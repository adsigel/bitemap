import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AmplitudeProvider } from "@/components/AmplitudeProvider";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

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
      <body className={`${geist.className} flex min-h-screen flex-col bg-stone-50 text-stone-900 antialiased`}>
        <AmplitudeProvider apiKey={process.env.AMPLITUDE_API_KEY!}>
        <header className="relative flex items-center justify-center border-b border-stone-200 bg-white px-4 py-3">
          <a href="/" className="text-lg font-semibold tracking-tight">
            🥪 Bitemap
          </a>
          <a
            href="/upload"
            className="absolute right-4 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600"
          >
            + Submit
          </a>
        </header>
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-stone-200 bg-white px-4 py-3 text-center text-xs text-stone-400">
          © 2026 Bitemap
        </footer>
        </AmplitudeProvider>
      </body>
    </html>
  );
}
