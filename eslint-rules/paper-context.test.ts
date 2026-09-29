/**
 * The paper a linted file belongs to, as `paperlint lint` hands it in ESLint's settings, and the
 * reading of the paper's other files.
 */
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAPERLINT_SETTINGS,
  otherTexts,
  paperOf,
  textOnDisk,
} from "./paper-context.ts";

describe("paperOf", () => {
  it("the paper under settings.paperlint.paper", () => {
    const paper = { main: "/p/paper.tex", files: ["/p/paper.tex", "/p/a.tex"] };
    expect(paperOf({ [PAPERLINT_SETTINGS]: { paper } })).toEqual(paper);
  });

  it("none when lint handed none, or handed something else", () => {
    expect(paperOf({})).toBe(null);
    expect(paperOf({ [PAPERLINT_SETTINGS]: { paper: { main: 1 } } })).toBe(
      null,
    );
  });
});

describe("otherTexts", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-ctx-")));
  writeFileSync(join(dir, "a.tex"), "A");
  writeFileSync(join(dir, "b.tex"), "B");
  const paper = {
    main: join(dir, "a.tex"),
    files: [join(dir, "a.tex"), join(dir, "b.tex"), join(dir, "gone.tex")],
  };

  it("every file of the paper but the linted one; a file that cannot be read holds no text", () => {
    expect(otherTexts(paper, join(dir, "a.tex"))).toEqual(["B", ""]);
    expect(textOnDisk(join(dir, "gone.tex"))).toBe("");
  });

  it("none without a paper", () => {
    expect(otherTexts(null, join(dir, "a.tex"))).toEqual([]);
  });
});
