"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion";
import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading } from "@/shared/ui/section-heading";
import { Panel, type Stop } from "./panel.tsx";
import { StopsDown } from "./stops-down.tsx";

/**
 * Variant B, the shelf: the four stops as four bound volumes standing side by side, each a dark
 * spine with its number and its name running down it. One volume is open, its spine in the accent
 * and its page spread out beside it; a click on another spine closes it and opens that one.
 */
export function ShelfVariant({ stops }: { readonly stops: readonly Stop[] }) {
  return (
    <section
      data-test="journey"
      data-test-meta={JSON.stringify({ variant: "shelf" })}
      className="border-t border-border py-24 md:py-32"
    >
      <div className="mx-auto max-w-page px-6 md:px-8">
        <Reveal>
          <SectionHeading
            label="From the first file to the camera-ready"
            id="journey"
          >
            Four checkpoints along the way.
          </SectionHeading>
        </Reveal>

        <Accordion
          type="single"
          defaultValue={stops[0]?.n}
          aria-label="Checkpoints"
          className="mt-16 hidden border-y-8 border-night md:flex"
        >
          {stops.map((s) => (
            <AccordionItem
              key={s.n}
              value={s.n}
              className="group/volume flex border-l border-night-edge first:border-l-0 data-open:min-w-0 data-open:flex-1"
            >
              <AccordionTrigger
                data-test="journey-stop"
                data-test-meta={JSON.stringify({ n: s.n })}
                className="flex w-16 shrink-0 flex-col items-center gap-6 bg-night py-6 text-on-ink-muted transition-colors outline-none group-data-open/volume:bg-primary group-data-open/volume:text-on-ink hover:text-on-ink focus-visible:text-on-ink motion-reduce:transition-none lg:w-24"
              >
                <span className="font-display text-title tabular-nums">
                  {s.n}
                </span>
                <span className="font-display text-subtitle spine-text">
                  {s.short}
                </span>
                <span
                  aria-hidden
                  className={
                    s.on
                      ? "mt-auto size-2 bg-sand"
                      : "mt-auto size-2 border border-on-ink-muted"
                  }
                />
              </AccordionTrigger>
              <AccordionContent
                data-test="journey-page"
                className="min-w-0 flex-1 bg-surface p-8 motion-reduce:animate-none lg:p-12 data-open:animate-in data-open:fade-in-0"
              >
                <Panel s={s} split />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <StopsDown stops={stops} night={false} />
      </div>
    </section>
  );
}
