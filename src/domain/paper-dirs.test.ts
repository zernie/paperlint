import { describe, expect, test } from "vitest";
import { dirname } from "node:path";
import { papersReached, type PaperTree } from "./paper-dirs.ts";

/** A disk holding exactly `files`, its folders the ones those files imply. */
const treeOf = (files: readonly string[]): PaperTree => {
  const dirs = new Set(
    files.flatMap((f) => {
      const up = (d: string): readonly string[] =>
        d === "/" ? [] : [d, ...up(dirname(d))];
      return up(dirname(f));
    }),
  );
  return {
    isFile: (p) => files.includes(p),
    subfolders: (dir) =>
      [...dirs]
        .filter((d) => dirname(d) === dir && !d.endsWith("/extra"))
        .sort(),
  };
};

/** The project every row reads: three papers, a source-only one, a copy in each place one is kept. */
const PROJECT = treeOf([
  "/w/paperlint.json",
  "/w/papers/p/paper.tex",
  "/w/papers/p/PIPELINE-STATUS.md",
  "/w/papers/p/reviews/r.md",
  "/w/papers/p/reviews/snapshot/paper.tex",
  "/w/papers/p/reviews/snapshot/PIPELINE-STATUS.md",
  "/w/papers/p/old/paper.tex",
  "/w/papers/p/_build/paper.tex",
  "/w/papers/p/extra/2025/paper.tex",
  "/w/papers/q/PIPELINE-STATUS.md",
  "/w/archive/2025/s/paper.tex",
  "/w/archive/2025/s/reviews/r.md",
  "/w/archive/2025/s/reviews/snapshot/PIPELINE-STATUS.md",
  "/w/archive/notes/todo.md",
]);

describe("the papers a path reaches (#582)", () => {
  test.each([
    [
      "the project root: every paper below it, none inside one",
      ["/w"],
      ["/w/archive/2025/s", "/w/papers/p", "/w/papers/q"],
    ],
    ["a papers directory", ["/w/papers"], ["/w/papers/p", "/w/papers/q"]],
    [
      "a folder two levels above a paper",
      ["/w/archive"],
      ["/w/archive/2025/s"],
    ],
    ["a paper with both markers", ["/w/papers/p"], ["/w/papers/p"]],
    ["a paper with only its scorecard", ["/w/papers/q"], ["/w/papers/q"]],
    [
      "a paper with only its source",
      ["/w/archive/2025/s"],
      ["/w/archive/2025/s"],
    ],
    [
      "a review card's folder, a snapshot beside it",
      ["/w/papers/p/reviews"],
      ["/w/papers/p"],
    ],
    [
      "the same, in a source-only paper",
      ["/w/archive/2025/s/reviews"],
      ["/w/archive/2025/s"],
    ],
    [
      "a build copy named itself",
      ["/w/papers/p/_build"],
      ["/w/papers/p/_build"],
    ],
    [
      "a snapshot named itself",
      ["/w/papers/p/reviews/snapshot"],
      ["/w/papers/p/reviews/snapshot"],
    ],
    ["a folder with no paper at or below it", ["/w/archive/notes"], []],
    ["a paper kept under extra/", ["/w/papers/p/extra/2025"], ["/w/papers/p"]],
    [
      "two paths reaching one paper",
      ["/w/papers/p", "/w/papers/p/reviews"],
      ["/w/papers/p"],
    ],
  ] as const)("%s", (_, dirs, papers) => {
    expect(papersReached(dirs, PROJECT)).toEqual(papers);
  });
});
