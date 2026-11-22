import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  presetName,
  readmeContent,
  venueCount,
  venueGrid,
} from "@/shared/lib/readme";
import { facts } from "./facts.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const read = (rel: string): string => readFileSync(root + rel, "utf8");

describe("facts", () => {
  it("states the count and the licence it is given, and the three backed facts", () => {
    expect(facts(19, "MIT")).toEqual([
      { word: "19", label: "venue presets", tone: "accent" },
      { word: "References", label: "every entry looked up", tone: "sage" },
      { word: "No AI", label: "needed", tone: "ink" },
      { word: "Free", label: "MIT licence", tone: "sand" },
    ]);
  });

  it("counts the same venues the venue grid shows", () => {
    const readme = read("README.md");
    const grid = venueGrid(
      read("docs/venues.md"),
      readmeContent(readme).venues,
      (id) => presetName(read(`presets/${id}.jsonc`)),
    );
    const shown = grid.fields
      .flatMap((f) => f.conferences)
      .flatMap((c) => [c.id, ...c.workshops.map((w) => w.id)]);
    expect(venueCount(grid)).toBe(shown.length);
    expect(facts(venueCount(grid), "MIT")[0]?.word).toBe(String(shown.length));
  });

  it("is still backed: every reference looked up, no AI, the MIT licence", () => {
    const readme = read("README.md");
    expect(read("docs/references.md")).toContain(
      "`paperlint build` checks every entry of a paper's bibliography against the services that know\nabout published work",
    );
    expect(readme).toContain("a command-line tool, no AI needed.");
    expect(
      (JSON.parse(read("package.json")) as { readonly license: string })
        .license,
    ).toBe("MIT");
  });
});
