"use client";

import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion";
import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading } from "@/shared/ui/section-heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

export interface Stop {
  readonly n: string;
  /** The stop's name on the road, one or two words. */
  readonly short: string;
  readonly when: string;
  readonly title: string;
  readonly text: ReactNode;
  readonly badge: string;
  /** Whether the stop's checks run without the author turning them on. */
  readonly on: boolean;
  readonly example: ReactNode;
}

const Badge = ({ s }: { readonly s: Stop }) => (
  <p
    className={
      s.on
        ? "mt-6 inline-block rounded-full border border-primary px-3 py-1 text-sm text-primary"
        : "mt-6 inline-block rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
    }
  >
    {s.badge}
  </p>
);

/** One stop's panel: what it checks on the left, a real finding on the right. */
const Panel = ({ s }: { readonly s: Stop }) => (
  <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-12">
    <div className="lg:col-span-5">
      <p className="text-label font-medium text-muted-foreground uppercase">
        {s.when}
      </p>
      <h3 className="mt-3 font-display text-title text-foreground">
        {s.title}
      </h3>
      <p className="mt-4 max-w-prose text-body text-copy">{s.text}</p>
      <Badge s={s} />
    </div>
    <div className="lg:col-span-7">{s.example}</div>
  </div>
);

/**
 * The four checks as stops on one road. From a tablet up, the road runs across the page and a
 * click on a stop opens its panel underneath; on a phone the road runs down the page, and each
 * stop opens in place.
 */
export function Journey({ stops }: { readonly stops: readonly Stop[] }) {
  return (
    <section className="mx-auto max-w-page px-6 pt-section md:px-8">
      <Reveal>
        <SectionHeading
          label="From the first file to the camera-ready"
          id="journey"
        >
          Four checkpoints along the way.
        </SectionHeading>
      </Reveal>

      <Tabs defaultValue={stops[0]?.n} className="mt-16 hidden md:block">
        <TabsList
          className="relative grid grid-cols-4"
          aria-label="Checkpoints"
        >
          <span
            aria-hidden
            className="absolute inset-x-12 top-6 h-2 -translate-y-1/2 rounded-full bg-road"
          />
          {stops.map((s) => (
            <TabsTrigger
              key={s.n}
              value={s.n}
              className="group relative flex flex-col items-center gap-3 text-muted-foreground transition-colors outline-none hover:text-foreground data-active:text-foreground"
            >
              <span className="grid size-12 place-items-center rounded-full border border-border bg-background font-display text-xl text-muted-foreground transition-colors group-hover:border-primary group-focus-visible:border-primary group-data-active:border-primary group-data-active:bg-primary group-data-active:text-primary-foreground">
                {s.n}
              </span>
              <span className="text-sm font-medium">{s.short}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {stops.map((s) => (
          <TabsContent
            key={s.n}
            value={s.n}
            className="mt-12 border-t border-border pt-12 outline-none data-open:animate-in data-open:fade-in-0"
          >
            <Panel s={s} />
          </TabsContent>
        ))}
      </Tabs>

      <Accordion
        type="single"
        collapsible
        defaultValue={stops[0]?.n}
        className="relative mt-12 md:hidden"
      >
        <span
          aria-hidden
          className="absolute inset-y-6 left-6 w-2 -translate-x-1/2 rounded-full bg-road"
        />
        {stops.map((s) => (
          <AccordionItem key={s.n} value={s.n} className="relative">
            <AccordionTrigger className="group flex w-full items-center gap-4 py-3 text-left">
              <span className="relative grid size-12 shrink-0 place-items-center rounded-full border border-border bg-background font-display text-xl text-muted-foreground group-data-open:border-primary group-data-open:bg-primary group-data-open:text-primary-foreground">
                {s.n}
              </span>
              <span className="font-display text-subtitle text-foreground">
                {s.short}
              </span>
            </AccordionTrigger>
            <AccordionContent className="overflow-hidden pl-16 data-open:animate-accordion-down data-closed:animate-accordion-up">
              <div className="pt-2 pb-8">
                <Panel s={s} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
