// The hero's four short facts. Each is backed by the repository (site/CLAUDE.md, "Only What
// Ships"), and facts.test.ts fails when its source stops saying it:
// - the count is the venue grid's own, read from docs/venues.md, never typed;
// - "offline": the README's table says `paperlint lint` runs offline, and docs/references.md that
//   lint reports the reference check offline (building looks references up online, so the fact
//   names the checks, not the build);
// - "no AI needed": the README's words for the linter;
// - the licence: package.json's `license`.

/** One fact: a short word set large in the serif, in its own colour, over a small muted label. */
export interface Fact {
  readonly word: string;
  readonly label: string;
  readonly tone: "accent" | "sage" | "ink" | "sand";
}

/** The hero's facts, in order, from the venue count and the package's licence. */
export const facts = (venues: number, license: string): readonly Fact[] => [
  { word: String(venues), label: "venue presets", tone: "accent" },
  { word: "Offline", label: "checks run on your computer", tone: "sage" },
  { word: "No AI", label: "needed", tone: "ink" },
  { word: "Free", label: `${license} licence`, tone: "sand" },
];
