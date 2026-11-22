import Image from "next/image";
import { VenueCycle } from "@/features/cycle-venue";
import { Wordmark } from "@/shared/ui/wordmark";
import campus from "./campus.webp";

/** One short fact of the hero: a word in the serif in its own colour, over a small muted label. */
export interface HeroFact {
  readonly word: string;
  readonly label: string;
  readonly tone: "accent" | "sage" | "ink" | "sand";
}

const TONE: Readonly<Record<HeroFact["tone"], string>> = {
  accent: "font-display text-title text-primary",
  sage: "font-display text-title text-sage",
  ink: "font-display text-title text-foreground",
  sand: "font-display text-title text-sand-deep",
};

/**
 * The opening, set as a magazine's first spread: the cover line, the promise in a short lead, four
 * short facts, then the campus etching as the spread's plate. No command and no
 * links: a reader scrolls to what it checks, and the commands wait in Install, after the checks.
 */
export function Hero({
  venues,
  facts,
}: {
  readonly venues: readonly string[];
  /** Each backed by the repository (src/pages/home/model/facts.ts). */
  readonly facts: readonly HeroFact[];
}) {
  return (
    <section id="top" data-test="hero" className="pb-band">
      <div className="mx-auto max-w-page px-6 pt-16 md:px-8 md:pt-24">
        <h1
          data-test="hero-title"
          className="max-w-cover font-display text-cover text-foreground"
        >
          Writing a paper for <VenueCycle names={venues} />
        </h1>
        <p className="mt-8 max-w-measure text-lead text-copy">
          <Wordmark className="text-subtitle" /> checks your LaTeX paper and its
          PDF against your venue&apos;s rules before peer review, and tells you
          in plain words what could get the paper sent back.
        </p>
        <ul
          data-test="facts"
          className="mt-16 grid max-w-cover grid-cols-2 gap-8 md:grid-cols-4"
        >
          {facts.map((f) => (
            <li key={f.word}>
              <p className={TONE[f.tone]}>{f.word}</p>
              <p className="mt-1 text-sm text-muted-foreground">{f.label}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* The spread's plate (site/CLAUDE.md, "Campus Not A Landmark"): wide, cropped to its
          arcades, its edges dissolving into the paper. */}
      <div className="mx-auto mt-16 max-w-wide px-6 md:px-8">
        <Image
          src={campus}
          alt="An ink-and-wash etching of a campus: sandstone arcades, red tile roofs, palms."
          priority
          sizes="(min-width: 84rem) 84rem, 100vw"
          className="aspect-plate w-full mask-plate object-cover object-bottom"
        />
      </div>
    </section>
  );
}
