/**
 * The record of a build as a value: the one text it is parsed from, what a rule reads off it, and what
 * changed since it was made. The files it is about are `src/sources-record.test.ts`'s.
 */
import { describe, expect, it } from "vitest";
import { parseSha256 } from "./sha256.ts";
import {
  bodyInputs,
  changesSince,
  describeChanges,
  preambleInputs,
  serializeSourcesRecord,
  type SourcesRecord,
} from "./sources-record.ts";

const A = "a".repeat(64);
const B = "b".repeat(64);

const RECORD: SourcesRecord = {
  schema: 1,
  inputs: [
    { path: "paper.tex", role: "body" },
    { path: "macros.tex", role: "preamble" },
    { path: "sections/intro.tex", role: "body" },
  ],
  written: ["refs.bib"],
  bibdata: ["refs"],
  bibtex: {
    ran: true,
    databases: ["refs.bib"],
    keys: ["k1"],
    exit: 2,
    errors: [{ message: "bad", file: "refs.bib", line: 4 }],
  },
  sha256: { "paper.tex": A, "macros.tex": null },
};

describe("serializing a record", () => {
  it("is two-space JSON with a final newline, so a diff of two builds reads", () => {
    expect(serializeSourcesRecord({ ...RECORD, bibtex: { ran: false } })).toBe(
      `${JSON.stringify({ ...RECORD, bibtex: { ran: false } }, null, 2)}\n`,
    );
  });
});

describe("reading a record", () => {
  it("the body files are the main file and what TeX read after \\begin{document}, in the order it first read them", () => {
    expect(bodyInputs(RECORD)).toEqual(["paper.tex", "sections/intro.tex"]);
  });

  it("the preamble files are those it read only before", () => {
    expect(preambleInputs(RECORD)).toEqual(["macros.tex"]);
  });
});

describe("what changed since the record", () => {
  const now = (files: Readonly<Record<string, string>>) => (p: string) =>
    files[p] === undefined ? null : parseSha256(files[p]);

  it("a record whose files are as hashed has no change, a file absent then and now included", () => {
    expect(changesSince(RECORD, now({ "paper.tex": A }))).toEqual([]);
  });

  it("an edited file, a deleted one, and a file that appeared where there was none", () => {
    expect(changesSince(RECORD, now({ "macros.tex": B }))).toEqual([
      { path: "paper.tex", change: "deleted" },
      { path: "macros.tex", change: "added" },
    ]);
    expect(changesSince(RECORD, now({ "paper.tex": B }))).toEqual([
      { path: "paper.tex", change: "edited" },
    ]);
  });

  it("names the changes in a line a finding can carry", () => {
    expect(
      describeChanges([
        { path: "paper.tex", change: "edited" },
        { path: "sections/a.tex", change: "deleted" },
      ]),
    ).toBe("paper.tex edited, sections/a.tex deleted");
    expect(describeChanges([])).toBe("");
  });
});
