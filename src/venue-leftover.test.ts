/**
 * `tex/venue-leftover`'s judge (`src/venue-leftover.ts`): where it reads — the venue lines wherever
 * they stand, the front matter always, the body only with `body` — and a name the parser gave no
 * place. The rule as ESLint runs it, on whole papers, is in `src/tex-venue-rules.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import type { Outline } from "./domain/tex-document.ts";
import { resolvePreset } from "./presets.ts";
import {
  frontMatterEnd,
  judgeLeftover,
  leftoverPlaces,
} from "./venue-leftover.ts";
import { PAPER, shipped, VENUES } from "../test/venue-rules-lint.ts";

/** An outline whose first section starts at `at` (null: no section; "unplaced": one with no place). */
const outline = (at: number | null | "unplaced"): Outline => ({
  sections:
    at === null
      ? []
      : [
          {
            title: "Introduction",
            place:
              at === "unplaced"
                ? { kind: "unplaced" }
                : { kind: "at", span: { start: at, end: at + 21 } },
          },
        ],
  backMatter: null,
  end: null,
});
const span = (start: number) => ({ start, end: start + 5 });

describe("frontMatterEnd", () => {
  it("is where the first section starts, or null without a placed one", () => {
    expect(
      [outline(100), outline(null), outline("unplaced")].map(frontMatterEnd),
    ).toEqual([100, null, null]);
  });
});

describe("leftoverPlaces — which prose is read", () => {
  it("by default the front matter only: before the first section, not after it, not unplaced", () => {
    const { read } = leftoverPlaces([], outline(100), []);
    expect([read(span(10)), read(span(150)), read(null)]).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("with `body: true`, everything, a name with no place included", () => {
    const { read } = leftoverPlaces([], outline(100), [{ body: true }]);
    expect([read(span(10)), read(span(150)), read(null)]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("a paper with no section is all front matter", () => {
    const { read } = leftoverPlaces([], outline(null), [{ body: false }]);
    expect([read(span(10)), read(null)]).toEqual([true, true]);
  });

  it("a venue line holds a name wherever it stands; an unplaced line holds none", () => {
    const { inLine } = leftoverPlaces(
      [{ kind: "at", span: { start: 200, end: 260 } }, { kind: "unplaced" }],
      outline(100),
      [],
    );
    expect([inLine(span(210)), inLine(span(10)), inLine(null)]).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("an option the schema does not declare is refused, not ignored", () => {
    expect(() =>
      leftoverPlaces([], outline(null), [{ bodies: true }]),
    ).toThrow();
  });
});

describe("judgeLeftover, on places the parser did not give", () => {
  const files = memoryFiles(shipped);
  const aidc = resolvePreset("paperlint:aidc-2026", `${PAPER}/paperlint.json`, {
    files,
    venuesDir: VENUES,
  });
  const preset = aidc.ok ? aidc.value : null;

  it("a venue line with no place holds no name; a parent's name no shipped venue carries is shown as written", () => {
    expect(preset).not.toBeNull();
    if (preset === null) return;
    const src = "Unlike AISec, and Gone 2025.";
    // The line is unplaced, so «AISec» without a year stands in prose: silent.
    const found = judgeLeftover(
      latexReader.renderedRuns(src),
      { ...preset, parentNames: ["Gone"] },
      [],
      leftoverPlaces([{ kind: "unplaced" }], latexReader.outline(src), []),
    );
    expect(found.map((f) => f.data)).toEqual([
      { name: "Gone", other: "Gone 2025", venue: "AIDC 2026" },
    ]);
  });
});
