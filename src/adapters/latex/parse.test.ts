/**
 * `parseLatex` keeps the trees of a bounded amount of source text: an editor session must not hold a tree for every
 * version of the paper it has seen (design §9, finding 5).
 */
import { describe, expect, it } from "vitest";
import { parseLatex } from "./index.ts";

describe("parseLatex's memo", () => {
  /** A distinct source of `kib` KiB that parses quickly: one long comment. */
  const source = (tag: string, kib: number) =>
    `${tag}\n%${"x".repeat(kib * 1024)}`;

  it("returns the same tree for the same text while it is kept", () => {
    const s = source("same", 1);
    expect(parseLatex(s)).toBe(parseLatex(s));
  });

  it("keeps up to 512 KiB of source: a paper's ten files stay, read in a cycle", () => {
    const files = Array.from({ length: 11 }, (_, i) =>
      source(`f${String(i)}`, 30),
    );
    const first = files.map((f) => parseLatex(f));
    expect(files.map((f) => parseLatex(f))).toEqual(first);
    expect(files.every((f, i) => parseLatex(f) === first[i])).toBe(true);
  });

  it("past 512 KiB the text used least recently goes first, a recently used one stays", () => {
    const big = Array.from({ length: 6 }, (_, i) =>
      source(`b${String(i)}`, 100),
    );
    const trees = big.slice(0, 5).map((f) => parseLatex(f));
    // Touch the oldest: it becomes the most recent, so the second is the one evicted.
    expect(parseLatex(big[0] ?? "")).toBe(trees[0]);
    parseLatex(big[5] ?? "");
    expect(parseLatex(big[0] ?? "")).toBe(trees[0]);
    expect(parseLatex(big[1] ?? "")).not.toBe(trees[1]);
  });
});
