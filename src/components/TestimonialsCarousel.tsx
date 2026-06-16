"use client";

import { useState, useEffect, useRef } from "react";

const testimonials = [
  { quote: "This is far more entertaining than it should be.", handle: "thatguyinstarbucks" },
  { quote: "I was going to say this is really stupid.. but then I clicked through 10 sandwiches.", handle: "Extremely_Peaceful" },
  { quote: "Thought it sounded so silly. Clicked it.... Wtf.... Ok I'd bite there..... No way who tf takes a bit there... 15 sandwiches in I guess I'm weird 😅", handle: "Vengeful-Melon" },
  { quote: "OMG - it made me really hungry!!!!", handle: "SighFor" },
  { quote: "My wife and I sitting on the couch giggling and saying “this is so stupid” but we are both 10+ sandwiches in and cracking up", handle: "nbnicholas"},
  { quote: "This is so mildly entertaining that I kept wanting to know where everyone else is going to take a bite in each wich. I love it", handle: "BettaSplendens1"},
  { quote: "So dumb. So simple. So addictive. So freaking great!", handle: "cwheel13"},
];

const FADE_MS = 300;

export function TestimonialsCarousel() {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);
  const fadeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function goTo(i: number) {
    if (fadeTimeout.current) clearTimeout(fadeTimeout.current);
    setVisible(false);
    fadeTimeout.current = setTimeout(() => {
      setCurrent(i);
      setVisible(true);
    }, FADE_MS);
  }

  useEffect(() => {
    const timer = setInterval(() => {
      goTo((current + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => () => { if (fadeTimeout.current) clearTimeout(fadeTimeout.current); }, []);

  const { quote, handle } = testimonials[current];

  return (
    <div className="mx-auto max-w-xl">
      <figure className="flex flex-col rounded-2xl bg-stone-100 px-10 py-10 text-center dark:bg-stone-800" style={{ minHeight: 240 }}>
        <div
          className="flex flex-1 flex-col items-center justify-center transition-opacity duration-300"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <blockquote className="text-base leading-relaxed text-stone-700 dark:text-stone-200">
            &ldquo;{quote}&rdquo;
          </blockquote>
          <figcaption className="mt-6 text-sm font-medium text-stone-400 dark:text-stone-500">— u/{handle}</figcaption>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to quote ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current ? "w-6 bg-orange-400" : "w-2 bg-stone-300 hover:bg-stone-400 dark:bg-stone-600 dark:hover:bg-stone-500"
              }`}
            />
          ))}
        </div>
      </figure>
    </div>
  );
}
