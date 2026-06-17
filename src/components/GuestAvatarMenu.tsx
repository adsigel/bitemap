"use client";

import { useEffect, useRef, useState } from "react";

export function GuestAvatarMenu() {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  function openWithPosition() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        zIndex: 50,
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex items-center"
      onMouseEnter={() => { cancelClose(); openWithPosition(); }}
      onMouseLeave={scheduleClose}
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-xs dark:bg-stone-700">
        🥪
      </div>

      <button
        onClick={() => (open ? setOpen(false) : openWithPosition())}
        aria-label="Account menu"
        className="ml-1 text-stone-400 transition hover:text-stone-600"
      >
        ▾
      </button>

      {open && (
        <div
          style={menuStyle}
          className="w-36 rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <a
            href="/profile"
            className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            onClick={() => setOpen(false)}
          >
            View Profile
          </a>
          <a
            href="/sign-in"
            className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            onClick={() => setOpen(false)}
          >
            Sign in
          </a>
        </div>
      )}
    </div>
  );
}
