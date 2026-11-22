"use client";

import { useState } from "react";
import { useDebounceCallback, useMediaQuery } from "usehooks-ts";
import { Reveal } from "@/shared/ui/reveal";
import { Rubric, SectionHeading } from "@/shared/ui/section-heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Panel, type Stop } from "./panel.tsx";
import { StopsDown } from "./stops-down.tsx";

/**
 * The four checks as stops on one road, in order, on the quiet stone ground. From a tablet up, a
 * table of contents of the four stops in large serif numerals on the left, the open one in ink and
 * the others muted; on the right, the open stop's page, a white sheet with a hairline edge. A click
 * or the keyboard turns to an entry's page, and so does resting a mouse on it for HOVER_MS: only
 * where the pointer is fine and can hover, so a touch screen keeps tap-to-open, and only after the
 * delay, so a mouse sweeping across the index does not flick through the pages. On a phone the
 * stops run down the page and each opens in place.
 */
/** How long a mouse rests on an index entry before its page opens: long enough to pass over. */
const HOVER_MS = 120;

export function Journey({ stops }: { readonly stops: readonly Stop[] }) {
  const [open, setOpen] = useState(stops[0]?.n ?? "");
  const canHover = useMediaQuery("(hover: hover) and (pointer: fine)");
  const openOnRest = useDebounceCallback(setOpen, HOVER_MS);
  return (
    <section data-test="journey" className="bg-stone py-band">
      <div className="mx-auto max-w-page px-6 md:px-8">
        <Reveal>
          <Rubric n="01" name="Checks" />
          <div className="mt-12">
            <SectionHeading id="journey">
              Four checkpoints along the way.
            </SectionHeading>
          </div>
        </Reveal>

        <Tabs
          value={open}
          onValueChange={setOpen}
          orientation="vertical"
          className="mt-12 hidden grid-cols-12 gap-x-8 md:grid"
        >
          <TabsList
            aria-label="Checkpoints"
            className="col-span-5 flex flex-col self-start border-t border-border"
          >
            {stops.map((s) => (
              <TabsTrigger
                key={s.n}
                value={s.n}
                data-test="journey-stop"
                data-test-meta={JSON.stringify({ n: s.n })}
                onPointerEnter={() => {
                  if (canHover) openOnRest(s.n);
                }}
                onPointerLeave={() => {
                  openOnRest.cancel();
                }}
                className="group flex items-center gap-6 border-b border-border py-6 text-left text-faint transition-colors outline-none hover:text-foreground focus-visible:text-foreground motion-reduce:transition-none data-active:text-foreground"
              >
                <span className="w-24 shrink-0 font-display text-numeral font-quiet tabular-nums transition-colors group-data-active:text-primary motion-reduce:transition-none">
                  {s.n}
                </span>
                <span className="flex flex-col gap-2">
                  <span className="text-label font-medium text-muted-foreground uppercase">
                    {s.when}
                  </span>
                  <span className="font-display text-title font-quiet">
                    {s.short}
                  </span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {stops.map((s) => (
            <TabsContent
              key={s.n}
              value={s.n}
              data-test="journey-page"
              data-test-meta={JSON.stringify({ n: s.n })}
              className="col-span-7 border border-border bg-surface p-8 outline-none motion-reduce:animate-none lg:p-8 data-open:animate-in data-open:fade-in-0"
            >
              <Panel s={s} />
            </TabsContent>
          ))}
        </Tabs>

        <StopsDown stops={stops} />
      </div>
    </section>
  );
}
