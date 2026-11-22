// The hero's four short facts. Each is backed by the repository (site/CLAUDE.md, "Only What
// Ships"), and facts.test.ts fails when its source stops saying it:
// - the count is the venue grid's own, read from docs/venues.md, never typed;
// - "references": docs/references.md says `paperlint build` checks every entry of the bibliography
//   against the services that know about published work (the build is online; lint reports it
//   offline);
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
  { word: "References", label: "every entry looked up", tone: "sage" },
  { word: "No AI", label: "needed", tone: "ink" },
  { word: "Free", label: `${license} licence`, tone: "sand" },
];
