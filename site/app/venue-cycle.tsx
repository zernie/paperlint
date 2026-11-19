"use client";

import { useEffect, useState } from "react";

/** The headline's venue: each shipped preset in turn, every 2.4 s; the first one only when the reader asks for less motion. */
export function VenueCycle({ names }: { readonly names: readonly string[] }) {
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return undefined;
    const timer = window.setInterval(
      () => setAt((i) => (i + 1) % names.length),
      2400,
    );
    return () => window.clearInterval(timer);
  }, [names.length]);
  return (
    <span className="venue" aria-live="off">
      <span key={at} className="venue-name">
        {names[at]}
      </span>
    </span>
  );
}
