"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion";
import { Panel, type Stop } from "./panel.tsx";

/**
 * The road on a phone: the four stops down the page, each opening in place, one at a time. On the
 * night band an open stop is a paper plate; on paper it opens under its title.
 */
export function StopsDown({
  stops,
  night,
}: {
  readonly stops: readonly Stop[];
  readonly night: boolean;
}) {
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={stops[0]?.n}
      data-test="journey-down"
      className={
        night
          ? "mt-12 border-t border-night-edge md:hidden"
          : "mt-12 border-t border-border md:hidden"
      }
    >
      {stops.map((s) => (
        <AccordionItem
          key={s.n}
          value={s.n}
          className={
            night ? "border-b border-night-edge" : "border-b border-border"
          }
        >
          <AccordionTrigger
            data-test="journey-stop"
            data-test-meta={JSON.stringify({ n: s.n })}
            className={
              night
                ? "group flex w-full items-baseline gap-4 py-4 text-left text-on-ink-faint data-open:text-on-ink"
                : "group flex w-full items-baseline gap-4 py-4 text-left text-muted-foreground data-open:text-foreground"
            }
          >
            <span
              className={
                night
                  ? "w-16 shrink-0 font-display text-title tabular-nums group-data-open:text-sand"
                  : "w-16 shrink-0 font-display text-title tabular-nums group-data-open:text-primary"
              }
            >
              {s.n}
            </span>
            <span className="font-display text-subtitle">{s.short}</span>
          </AccordionTrigger>
          <AccordionContent className="overflow-hidden motion-reduce:animate-none data-open:animate-accordion-down data-closed:animate-accordion-up">
            <div className={night ? "mb-6 bg-paper p-6" : "pb-8"}>
              <Panel s={s} />
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
