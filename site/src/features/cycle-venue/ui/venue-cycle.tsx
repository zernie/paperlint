"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useInterval } from "usehooks-ts";

/** One name and its question mark, as the headline sets it. */
const Name = ({ name }: { readonly name: string }) => (
  <>
    <span className="text-primary italic">{name}</span>?
  </>
);

/**
 * The headline's venue, followed by its question mark: each shipped preset in turn, the first one
 * only for a reader who asks for less motion. Every name is laid out, invisible, in the one grid
 * cell the shown name animates in, so the box is always as tall as the longest name at the
 * current width and changing names never moves the page (`test/browser/hero.browser.ts`).
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
    <span
      data-test="venue-cycle"
      data-test-meta={JSON.stringify({ names })}
      className="grid lg:inline-grid"
    >
      {names.map((name) => (
        <span
          key={name}
          aria-hidden="true"
          className="invisible col-start-1 row-start-1"
        >
          <Name name={name} />
        </span>
      ))}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={names[at]}
          data-test="venue-name"
          data-test-meta={JSON.stringify({ name: names[at] })}
          className="col-start-1 row-start-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <Name name={names[at] ?? ""} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
