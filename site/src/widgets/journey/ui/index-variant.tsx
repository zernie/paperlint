"use client";

import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading } from "@/shared/ui/section-heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Panel, type Stop } from "./panel.tsx";
import { StopsDown } from "./stops-down.tsx";

/**
 * Variant A, the index: on the night band, a table of contents of the four stops in large serif
 * numerals on the left, the open one lit and the others muted; on the right, the open stop's page
 * set like a plate. A click on an entry turns to its page.
 */
export function IndexVariant({ stops }: { readonly stops: readonly Stop[] }) {
  return (
    <section
      data-test="journey"
      data-test-meta={JSON.stringify({ variant: "index" })}
      className="bg-night py-24 md:py-32"
    >
      <div className="mx-auto max-w-page px-6 md:px-8">
        <Reveal>
          <SectionHeading
            night
            label="From the first file to the camera-ready"
            id="journey"
          >
            Four checkpoints along the way.
          </SectionHeading>
        </Reveal>

        <Tabs
          defaultValue={stops[0]?.n}
          orientation="vertical"
          className="mt-16 hidden grid-cols-12 gap-x-8 md:grid"
        >
          <TabsList
            aria-label="Checkpoints"
            className="col-span-5 flex flex-col self-start border-t border-night-edge"
          >
            {stops.map((s) => (
              <TabsTrigger
                key={s.n}
                value={s.n}
                data-test="journey-stop"
                data-test-meta={JSON.stringify({ n: s.n })}
                className="group flex items-center gap-6 border-b border-night-edge py-6 text-left text-on-ink-faint transition-colors outline-none hover:text-on-ink-muted focus-visible:text-on-ink motion-reduce:transition-none data-active:text-on-ink"
              >
                <span className="w-24 shrink-0 font-display text-numeral tabular-nums transition-colors group-data-active:text-sand motion-reduce:transition-none">
                  {s.n}
                </span>
                <span className="flex flex-col gap-2">
                  <span className="text-label font-medium uppercase">
                    {s.when}
                  </span>
                  <span className="font-display text-title">{s.short}</span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {stops.map((s) => (
            <TabsContent
              key={s.n}
              value={s.n}
              data-test="journey-page"
              className="col-span-7 bg-paper p-8 outline-none motion-reduce:animate-none lg:p-12 data-open:animate-in data-open:fade-in-0"
            >
              <Panel s={s} />
            </TabsContent>
          ))}
        </Tabs>

        <StopsDown stops={stops} night />
      </div>
    </section>
  );
}
