"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useInterval } from "usehooks-ts";

/**
 * The headline's venue, followed by its question mark: each shipped preset in turn, the first one
 * only for a reader who asks for less motion. It keeps a two-line height on small screens and a
 * one-line height on large ones (the `venue-lines` utility), so changing names never moves the page.
 */
export function VenueCycle({ names }: { readonly names: readonly string[] }) {
  const reduce = useReducedMotion() === true;
  const [at, setAt] = useState(0);
  useInterval(
    () => {
      setAt((i) => (i + 1) % names.length);
    },
    reduce ? null : 2600,
  );
  return (
    <span className="block venue-lines lg:inline">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={names[at]}
          className="inline-block"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <span className="text-primary italic">{names[at]}</span>?
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
