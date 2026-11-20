import { expect, it } from "vitest";
import { copiesIn } from "./paper-copies.ts";

const NAMES = {
  config: "paperlint.json",
  markers: ["paper.tex", "PIPELINE-STATUS.md"],
};

it("names each folder below the paper that holds a paper's file and no settings file, once", () => {
  expect(
    copiesIn(
      [
        "paper.tex",
        "PIPELINE-STATUS.md",
        "refs.bib",
        "reviews/2026-11-20-second-opinion/paper.tex",
        "reviews/2026-11-20-second-opinion/PIPELINE-STATUS.md",
        "research/data/cut/runs/a/paper.tex",
        "research/data/cut/runs/a/refs.bib",
      ],
      NAMES,
    ),
  ).toEqual(["research/data/cut/runs/a", "reviews/2026-11-20-second-opinion"]);
});

it("keeps a folder with its own settings file, and never names the paper's top level", () => {
  expect(
    copiesIn(
      [
        "paperlint.json",
        "paper.tex",
        "part/paperlint.json",
        "part/paper.tex",
        "part/notes/draft.tex",
      ],
      NAMES,
    ),
  ).toEqual([]);
});
