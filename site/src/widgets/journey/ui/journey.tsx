"use client";

import { Reveal } from "@/shared/ui/reveal";
import { Rubric, SectionHeading } from "@/shared/ui/section-heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Panel, type Stop } from "./panel.tsx";
import { StopsDown } from "./stops-down.tsx";

/**
 * The four checks as stops on one road, in order, on the quiet stone ground. From a tablet up, a
 * table of contents of the four stops in large serif numerals on the left, the open one in ink and
 * the others muted; on the right, the open stop's page, a white sheet with a hairline edge. A click
 * on an entry turns to its page. On a phone the stops run down the page and each opens in place.
 */
export function Journey({ stops }: { readonly stops: readonly Stop[] }) {
  return (
    <section data-test="journey" className="bg-stone py-band">
      <div className="mx-auto max-w-page px-6 md:px-8">
        <Reveal>
          <Rubric
            n="01"
            name="Checks"
            deck="From the first file to the camera-ready"
          />
          <div className="mt-12">
            <SectionHeading id="journey">
              Four checkpoints along the way.
            </SectionHeading>
          </div>
        </Reveal>

        <Tabs
          defaultValue={stops[0]?.n}
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
