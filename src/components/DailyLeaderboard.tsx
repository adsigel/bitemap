"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AddSandoLink } from "@/components/AddSandoLink";
import { GenericAvatarIcon } from "@/components/GenericAvatarIcon";

const EMOJIS = ["🥪", "🥪", "🥪", "🥙", "🌯", "🫓", "🍞"];
const COUNT = 28;

interface Piece {
  emoji: string;
  left: number;
  delay: number;
  duration: number;
  size: number;
}

export interface LeaderboardEntry {
  id: string;
  slug: string | null;
  title: string;
  imageUrl: string;
  biteCount: number;
  rank: number;
  isOwn: boolean;
  uploaderName: string | null;
  uploaderAvatarUrl: string | null;
}

interface Props {
  entries: LeaderboardEntry[];
  isFinal: boolean;
  isAuthed: boolean;
}

// Google avatar URLs occasionally fail when hotlinked directly by the
// browser (intermittent rate-limiting on lh3.googleusercontent.com).
// next/image fetches server-side instead, same as the header avatar which
// doesn't have this problem; onError still falls back just in case.
function UploaderAvatar({ url, name }: { url: string | null; name: string }) {
  const [errored, setErrored] = useState(false);
  if (!url || errored) return <GenericAvatarIcon iconClassName="h-3.5 w-3.5" />;
  return (
    <Image
      src={url}
      alt={name}
      width={22}
      height={22}
      className="h-full w-full object-cover"
      onError={() => setErrored(true)}
    />
  );
}

export function DailyLeaderboard({ entries, isFinal, isAuthed }: Props) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    setPieces(
      Array.from({ length: COUNT }, () => ({
        emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
        left: Math.random() * 100,
        delay: Math.random() * 4,
        duration: 3 + Math.random() * 4,
        size: 1.2 + Math.random() * 1.6,
      }))
    );
  }, []);

  return (
    <div className="relative flex min-h-[70vh] flex-col items-center justify-center text-center">
      <style>{`
        @keyframes sandwich-fall {
          0%   { transform: translateY(-80px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(110vh)  rotate(720deg); opacity: 0.4; }
        }
      `}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="pointer-events-none select-none"
          style={{
            position: "fixed",
            top: 0,
            left: `${p.left}%`,
            fontSize: `${p.size}rem`,
            animation: `sandwich-fall ${p.duration}s ${p.delay}s infinite linear backwards`,
            zIndex: 0,
          }}
        >
          {p.emoji}
        </span>
      ))}

      <div className="relative z-10 w-full max-w-2xl space-y-8 px-6 py-12">
        <div className="space-y-3">
          <p className="text-6xl">🏆</p>
          <h1 className="text-2xl font-bold">You bit all 5 of today&apos;s sandos</h1>
          <p className="text-stone-500 dark:text-stone-400">
            {isFinal ? "Here's how today's lineup ended up." : "Here's how today's lineup stands."}
          </p>
        </div>

        <ol className="space-y-2 text-left">
          {entries.map((e) => {
            const isTop = e.rank === 1;
            return (
              <li key={e.id}>
                <a
                  href={`/sandwich/${e.slug ?? e.id}?ref=daily-leaderboard`}
                  className={`group flex items-center gap-4 rounded-lg p-3 transition hover:bg-stone-100 dark:hover:bg-stone-800 ${
                    isTop ? "bg-orange-50 dark:bg-orange-950/30" : ""
                  }`}
                >
                  <span className={`w-7 shrink-0 text-center text-base font-bold ${isTop ? "text-orange-500" : "text-stone-400"}`}>
                    {e.rank}
                  </span>
                  <div
                    className="shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800"
                    style={{ position: "relative", width: 64, height: 64 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={e.imageUrl}
                      alt={e.title}
                      className="object-cover transition duration-200 group-hover:scale-105"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-base ${
                        isTop ? "font-bold text-stone-900 dark:text-stone-100" : "font-medium text-stone-700 dark:text-stone-300"
                      }`}
                    >
                      {e.title} {e.isOwn && <span className="text-orange-500">(yours)</span>}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-5 w-5 shrink-0 overflow-hidden rounded-full">
                        <UploaderAvatar url={e.uploaderAvatarUrl} name={e.uploaderName ?? "Admin"} />
                      </div>
                      <span className="truncate text-sm text-stone-400">
                        {e.uploaderName ?? "Admin"} {isTop && "🏆"}
                      </span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-base ${isTop ? "font-bold text-orange-600 dark:text-orange-400" : "text-stone-400"}`}>
                    {e.biteCount}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>

        <div className="space-y-3 border-t border-stone-200 pt-6 dark:border-stone-800">
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">New sandos drop tomorrow 🌅</p>

          {isAuthed ? (
            <a
              href="/explore"
              className="block rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
            >
              Explore older sandos →
            </a>
          ) : (
            <>
              <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-4 text-center dark:border-orange-900/40 dark:bg-orange-950/30">
                <p className="text-sm font-medium text-stone-700 dark:text-stone-200">
                  Sign up to receive your Bitemark and see how you compare to biters everywhere.
                </p>
                <a
                  href="/sign-in"
                  className="mt-3 inline-block rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
                >
                  Create a free account
                </a>
              </div>
              <a href="/explore" className="block text-sm text-stone-500 underline dark:text-stone-400">
                Or explore older sandos →
              </a>
            </>
          )}

          <AddSandoLink source="daily_leaderboard" className="block text-sm text-stone-500 underline dark:text-stone-400">
            Or upload your own for a future day
          </AddSandoLink>
        </div>
      </div>
    </div>
  );
}
