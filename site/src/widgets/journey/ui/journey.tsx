"use client";

import { motion, useReducedMotion, useScroll } from "motion/react";
import { useRef, type ReactNode } from "react";
import { Reveal } from "@/shared/ui/reveal";
import { SectionHeading } from "@/shared/ui/section-heading";

export interface Stop {
  readonly n: string;
  readonly when: string;
  readonly title: string;
  readonly text: string;
  readonly badge: string;
  /** Whether the stop's checks run without the author turning them on. */
  readonly on: boolean;
  readonly example: ReactNode;
}

/** The four checks as stops on one road; the road draws itself as the reader scrolls. */
export function Journey({ stops }: { readonly stops: readonly Stop[] }) {
  const road = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() === true;
  const { scrollYProgress } = useScroll({
    target: road,
    offset: ["start 70%", "end 70%"],
  });
  return (
    <section className="mx-auto max-w-page px-6 pt-section md:px-8">
      <Reveal className="grid grid-cols-1 gap-x-8 gap-y-12 lg:grid-cols-12">
        <SectionHeading
          label="From the first file to the camera-ready"
          id="journey"
        >
          Four checkpoints along the way.
        </SectionHeading>
        <p className="max-w-prose text-lead text-copy lg:col-span-7 lg:col-start-5">
          The venue&apos;s checks run once the PDF is built, the folder check on
          every run, the study checks once you run a study. The writing limits
          stay off until you turn them on.
        </p>
      </Reveal>
      <div ref={road} className="relative mt-20">
        <div
          aria-hidden
          className="absolute inset-y-0 left-6 hidden w-6 -translate-x-1/2 rounded-full bg-road lg:block"
        >
          <motion.div
            className="mx-auto h-full w-0.5 origin-top bg-primary"
            style={{ scaleY: reduce ? 1 : scrollYProgress }}
          />
        </div>
        <ol>
          {stops.map((s) => (
            <li
              key={s.n}
              className="relative grid grid-cols-1 gap-8 border-t border-border py-24 first:border-t-0 first:pt-0 lg:grid-cols-12 lg:border-t-0"
            >
              <div className="lg:col-span-1">
                <span className="relative z-1 grid size-12 place-items-center rounded-full border border-border bg-background font-display text-xl text-primary">
                  {s.n}
                </span>
              </div>
              <Reveal className="lg:col-span-5">
                <p className="text-label font-medium text-muted-foreground uppercase">
                  {s.when}
                </p>
                <h3 className="mt-3 font-display text-title text-foreground">
                  {s.title}
                </h3>
                <p className="mt-4 text-body text-copy">{s.text}</p>
                <p
                  className={
                    s.on
                      ? "mt-6 inline-block rounded-full border border-primary px-3 py-1 text-sm text-primary"
                      : "mt-6 inline-block rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
                  }
                >
                  {s.badge}
                </p>
              </Reveal>
              <Reveal className="lg:col-span-6">{s.example}</Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
