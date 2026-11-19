import Image from "next/image";
import { CommandLine } from "@/features/copy-command";
import { VenueCycle } from "@/features/cycle-venue";
import campus from "./campus.webp";

/** The opening: who it is for, what it does and the first command, over the campus etching. */
export function Hero({
  venues,
  install,
  caption,
}: {
  readonly venues: readonly string[];
  /** The README's install commands, one per line; Copy joins them with `&&`. */
  readonly install: readonly string[];
  readonly caption: string;
}) {
  return (
    <section id="top" className="relative isolate overflow-hidden">
      <div className="mx-auto max-w-page px-6 pt-hero md:px-8">
        <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-12">
          <div className="lg:col-span-12">
            <p className="text-label font-medium text-muted-foreground uppercase">
              For LaTeX papers, before peer review
            </p>
            <h1 className="mt-6 font-display text-hero text-foreground">
              Writing a paper
              <br />
              for <VenueCycle names={venues} />
            </h1>
          </div>
          <div className="mt-12 lg:col-span-6">
            <p className="text-lead text-copy">
              paperlint checks a LaTeX paper against your venue&apos;s rules —
              the page limit, the template, the fonts, the references — and
              flags what can get it sent back before peer review.
            </p>
          </div>
          <div className="mt-12 lg:col-span-5 lg:col-start-8">
            <CommandLine lines={install} caption={caption} />
            <p className="mt-4 text-sm text-muted-foreground">
              Free and open source · MIT licence
            </p>
            <a
              href="#journey"
              className="mt-2 inline-block text-sm text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
            >
              How it works, step by step
            </a>
          </div>
        </div>
      </div>
      {/* Decorative: an invented campus (site/CLAUDE.md, "Campus Not A Landmark"), a full-width band
          under the text, faded into the paper on every edge so no rectangle shows and no text sits
          on the drawing. */}
      <Image
        src={campus}
        alt=""
        aria-hidden
        priority
        sizes="100vw"
        className="pointer-events-none -z-1 -mt-16 h-campus w-full mask-campus object-cover object-bottom"
      />
    </section>
  );
}
