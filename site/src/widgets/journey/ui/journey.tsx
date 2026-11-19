"use client";

import { useSyncExternalStore } from "react";
import { IndexVariant } from "./index-variant.tsx";
import type { Stop } from "./panel.tsx";
import { ShelfVariant } from "./shelf-variant.tsx";

/**
 * Which of the two desktop designs the page shows, while the author chooses: `?journey=shelf` shows
 * the shelf, anything else the index. The static HTML is the index; the query is read after it
 * loads. The switch goes once the author has chosen, with the variant not chosen.
 */
const variantNow = (): "index" | "shelf" =>
  new URLSearchParams(window.location.search).get("journey") === "shelf"
    ? "shelf"
    : "index";

const noSubscription = () => () => undefined;

/**
 * The four checks as stops on one road, in order, one open at a time; on a phone the road runs down
 * the page and each stop opens in place.
 */
export function Journey({ stops }: { readonly stops: readonly Stop[] }) {
  const variant = useSyncExternalStore(
    noSubscription,
    variantNow,
    () => "index" as const,
  );
  return variant === "shelf" ? (
    <ShelfVariant stops={stops} />
  ) : (
    <IndexVariant stops={stops} />
  );
}
