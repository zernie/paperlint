import Image from "next/image";
import { CommandLine } from "@/features/copy-command";
import { VenueCycle } from "@/features/cycle-venue";
import type { Explained } from "@/entities/finding";
import campus from "./campus.webp";

/** The opening: who it is for, what it does and the first command, over the campus etching. */
export function Hero({
  venues,
  install,
  caption,
  preview,
}: {
  readonly venues: readonly string[];
  /** The README's install commands, one per line; Copy joins them with `&&`. */
  readonly install: readonly string[];
  readonly caption: string;
  /** The README's first lint output, in plain words: what a first check says. */
  readonly preview: readonly Explained[];
}) {
  return (
    <section id="top" className="relative isolate overflow-hidden">
      <div className="mx-auto grid max-w-page grid-cols-1 gap-x-8 gap-y-16 px-6 pt-16 md:px-8 md:pt-24 lg:grid-cols-12 lg:pt-hero">
        <div className="lg:col-span-7">
          <h1 className="font-display text-display text-foreground">
            Writing a paper for <VenueCycle names={venues} />
          </h1>
          <p className="mt-8 max-w-prose text-lead text-copy">
            paperlint checks your LaTeX paper and its PDF against your
            venue&apos;s rules before peer review, and tells you in plain words
            what could get the paper sent back.
          </p>
          <div className="mt-10 max-w-xl">
            <CommandLine lines={install} caption={caption} />
            <p className="mt-4 text-sm text-muted-foreground">
              Free and open source · MIT licence ·{" "}
              <a
                href="#journey"
                className="underline decoration-border underline-offset-4 hover:text-foreground"
              >
                How it works
              </a>
            </p>
          </div>
        </div>
        <aside className="self-end rounded-md border border-border bg-surface p-8 lg:col-span-5">
          <p className="text-label font-medium text-muted-foreground uppercase">
            What a first check says
          </p>
          <ul className="mt-4">
            {preview.map((f) => (
              <li
                key={f.title}
                className="border-t border-border py-4 first:border-t-0"
              >
                <p
                  className={
                    f.level === "warning"
                      ? "text-label font-medium text-warn uppercase"
                      : "text-label font-medium text-error uppercase"
                  }
                >
                  {f.level === "warning" ? "Advice" : "Must fix"}
                </p>
                <p className="mt-1 font-display text-subtitle text-foreground">
                  {f.title}
                </p>
                <p className="mt-1 text-sm text-copy">{f.plain}</p>
              </li>
            ))}
          </ul>
        </aside>
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
