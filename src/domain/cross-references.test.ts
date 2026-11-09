/**
 * `sameNumberClashes` on real parses of body prose, against labels as the build's `.aux` gave them
 * (test/fixtures/tex-output/ref-list-include/ and ref-kinds/, read by the adapter's own tests).
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "../adapters/latex/index.ts";
import {
  joins,
  referenceLists,
  sameNumberClashes,
  type Labels,
  type ListMember,
} from "./cross-references.ts";

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** The labels of the captured IEEEtran paper, and of the article whose figure and table are both 1. */
const LABELS: Labels = new Map([
  ["sec:check", { number: "II-A", kind: "subsection" }],
  ["sec:rq2", { number: "II-A", kind: "subsection" }],
  ["sec:rq3", { number: "II-B", kind: "subsection" }],
  ["fig:a", { number: "1", kind: "figure" }],
  ["tab:a", { number: "1", kind: "table" }],
  ["sec:method", { number: "1", kind: "section" }],
]);

/** The clashes in `body`, as keys and the number they share. */
const clashes = (body: string, labels: Labels = LABELS) =>
  sameNumberClashes(latexReader.bodyProse(doc(body)), labels).map((c) => ({
    first: c.first.key,
    second: c.second.key,
    number: c.number,
  }));

describe("sameNumberClashes — two labels of one list that print one number", () => {
  it("🔴 the planted list: sec:check and sec:rq2 both print II-A", () => {
    // Guards: the defect that reached a paper — "Sections II-A, II-A and II-B".
    expect(
      clashes("Sections~\\ref{sec:check}, \\ref{sec:rq2} and~\\ref{sec:rq3}."),
    ).toEqual([{ first: "sec:check", second: "sec:rq2", number: "II-A" }]);
  });

  it("the place of a finding is the later reference", () => {
    const src = doc("Sections~\\ref{sec:check} and~\\ref{sec:rq2}.");
    const [c] = sameNumberClashes(latexReader.bodyProse(src), LABELS);
    expect(c && src.slice(c.second.span.start, c.second.span.end)).toBe(
      "\\ref{sec:rq2}",
    );
  });

  it("one \\cref naming two labels is a list by itself", () => {
    // Guards: cleveref printed "section II-A" once for \\cref{sec:check,sec:rq2} (measured) — one
    // place where two were meant.
    expect(clashes("See \\cref{sec:check,sec:rq2}.")).toEqual([
      { first: "sec:check", second: "sec:rq2", number: "II-A" },
    ]);
  });

  it("a range, 'or' and an ampersand join a list too", () => {
    expect(clashes("Sections~\\ref{sec:check}--\\ref{sec:rq2}.")).toHaveLength(
      1,
    );
    expect(clashes("Section~\\ref{sec:check} or \\ref{sec:rq2}.")).toHaveLength(
      1,
    );
    expect(
      clashes("Sections~\\ref{sec:check} \\& \\ref{sec:rq2}."),
    ).toHaveLength(1);
  });

  it("plain \\ref prints no kind: a section and a figure that both print 1 read as one number twice", () => {
    // Guards: measured — "Sections 1 and 1" from \\ref{sec:method} and~\\ref{fig:a}.
    expect(clashes("Sections~\\ref{sec:method} and~\\ref{fig:a}.")).toEqual([
      { first: "sec:method", second: "fig:a", number: "1" },
    ]);
  });

  it("each later member is paired with the first earlier one it clashes with", () => {
    const labels: Labels = new Map([
      ["a", { number: "3", kind: "section" }],
      ["b", { number: "3", kind: "section" }],
      ["c", { number: "3", kind: "section" }],
    ]);
    expect(clashes("\\ref{a}, \\ref{b} and \\ref{c}.", labels)).toEqual([
      { first: "a", second: "b", number: "3" },
      { first: "a", second: "c", number: "3" },
    ]);
  });
});

describe("sameNumberClashes — what stays silent", () => {
  it("🔴 two labels with different numbers", () => {
    expect(
      clashes("Sections~\\ref{sec:check} and~\\ref{sec:rq3} answer it."),
    ).toEqual([]);
  });

  it("one label referenced twice, in separate sentences or in one list", () => {
    // Guards: the rule is about DIFFERENT labels; a repeat of one label is not this defect.
    expect(
      clashes("See Section~\\ref{sec:check}. Again, Section~\\ref{sec:rq2}."),
    ).toEqual([]);
    expect(clashes("Sections~\\ref{sec:check} and~\\ref{sec:check}.")).toEqual(
      [],
    );
  });

  it("references the text does not join: another word, a citation or math between them", () => {
    expect(
      clashes("Section~\\ref{sec:check} and Figure~\\ref{sec:rq2}."),
    ).toEqual([]);
    expect(
      clashes("Section~\\ref{sec:check} \\cite{k} \\ref{sec:rq2}."),
    ).toEqual([]);
    expect(clashes("Section~\\ref{sec:check} $x$ \\ref{sec:rq2}.")).toEqual([]);
  });

  it("\\cref and \\autoref print the kind: Figure 1 and Table 1 are two places", () => {
    // Guards: measured — "Figure 1 and table 1 and Figure 1 and Table 1" from this source.
    expect(
      clashes(
        "\\Cref{fig:a,tab:a} and \\autoref{fig:a} and~\\autoref{tab:a} differ in kind.",
      ),
    ).toEqual([]);
  });

  it("a kind-printing command still clashes with one that prints no kind", () => {
    // "Figure 1 and 1": the second 1 carries no kind to tell it apart.
    expect(clashes("\\cref{fig:a} and \\ref{tab:a}.")).toHaveLength(1);
  });

  it("a label the build does not know, and a command that prints no number", () => {
    // Guards: an unknown label is LaTeX's "undefined references", not a number to compare.
    expect(clashes("\\ref{sec:check} and \\ref{nowhere}.")).toEqual([]);
    expect(clashes("\\pageref{sec:check} and \\pageref{sec:rq2}.")).toEqual([]);
  });

  it("no labels at all: a paper that was not built", () => {
    expect(
      clashes("Sections~\\ref{sec:check} and~\\ref{sec:rq2}.", new Map()),
    ).toEqual([]);
  });
});

describe("referenceLists and joins", () => {
  it("lists are cut at a full stop and at a passage break", () => {
    const keys = (l: readonly ListMember[]) => l.map((m) => m.key);
    const lists = referenceLists(
      latexReader.bodyProse(
        doc("\\ref{a} and \\ref{b}. \\ref{c}\n\n\\ref{d}, \\ref{e}"),
      ),
    ).map(keys);
    expect(lists).toEqual([["a", "b"], ["c"], ["d", "e"]]);
  });

  it("joins: commas and joiners only, in any case", () => {
    expect(joins(", ")).toBe(true);
    expect(joins(" AND ")).toBe(true);
    expect(joins("")).toBe(true);
    expect(joins(" and Figure ")).toBe(false);
  });
});
