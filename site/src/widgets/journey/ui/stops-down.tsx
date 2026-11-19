"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion";
import { Panel, type Stop } from "./panel.tsx";

/**
 * The road on a phone: the four stops down the page, each opening in place as a white sheet, one at
 * a time.
 */
export function StopsDown({ stops }: { readonly stops: readonly Stop[] }) {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={stops[0]?.n}
      data-test="journey-down"
      className="mt-12 border-t border-border md:hidden"
    >
      {stops.map((s) => (
        <AccordionItem key={s.n} value={s.n} className="border-b border-border">
          <AccordionTrigger
            data-test="journey-stop"
            data-test-meta={JSON.stringify({ n: s.n })}
            className="group flex w-full items-baseline gap-4 py-4 text-left text-muted-foreground data-open:text-foreground"
          >
            <span className="w-16 shrink-0 font-display text-title tabular-nums group-data-open:text-primary">
              {s.n}
            </span>
            <span className="font-display text-subtitle">{s.short}</span>
          </AccordionTrigger>
          <AccordionContent className="overflow-hidden motion-reduce:animate-none data-open:animate-accordion-down data-closed:animate-accordion-up">
            <div className="mb-6 border border-border bg-surface p-6">
              <Panel s={s} />
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
