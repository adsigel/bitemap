"use client";

import { useEffect, useState } from "react";
import { AddSandoLink } from "@/components/AddSandoLink";

const EMOJIS = ["🥪", "🥪", "🥪", "🥙", "🌯", "🫓", "🍞"];
const COUNT = 28;

interface Piece {
  emoji: string;
  left: number;
  delay: number;
  duration: number;
  size: number;
}

export interface RecommendedSandwich {
  id: string;
  slug: string | null;
  title: string;
  imageUrl: string;
  newBites: number;
}

interface Props {
  recommended?: RecommendedSandwich[];
}

export function KillScreen({ recommended = [] }: Props) {
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

      <div className="relative z-10 w-full max-w-lg space-y-8 px-6 py-12">
        <div className="space-y-4">
          <p className="text-6xl">🏆</p>
          <h1 className="text-2xl font-bold">And Alexander wept, for there were no more bites to take.</h1>
          <p className="text-stone-500 dark:text-stone-400">
            You&apos;ve left your mark. Keep the fun going by adding another sando.
          </p>
          <AddSandoLink
            source="all_done"
            className="mt-2 inline-block rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
          >
            Add a Sando →
          </AddSandoLink>
        </div>

        {recommended.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
              See what&apos;s changed since you bit these
            </p>
            <div className="grid grid-cols-3 gap-2">
              {recommended.map((s) => (
                <a
                  key={s.id}
                  href={`/sandwich/${s.slug ?? s.id}?ref=all-done`}
                  className="group block text-left"
                >
                  <div
                    className="overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800"
                    style={{ position: "relative", width: "100%", aspectRatio: "1" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.imageUrl}
                      alt={s.title}
                      className="object-cover transition duration-200 group-hover:scale-105"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                    />
                    {s.newBites > 0 && (
                      <div
                        className="rounded-full bg-orange-500 text-xs font-bold text-white shadow"
                        style={{ position: "absolute", top: 8, right: 8, zIndex: 1, padding: "2px 8px" }}
                      >
                        +{s.newBites}
                      </div>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs font-medium text-stone-700 dark:text-stone-300">
                    {s.title}
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
