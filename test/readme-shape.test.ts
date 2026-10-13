/**
 * THE README STAYS A FRONT PAGE.
 *
 * It grew to 453 lines, install at line ~190, while its own header said "no section longer than one
 * screen" — a comment held nothing. These budgets do. When one turns red, move mechanics and edge
 * cases into docs/ and link them; raise a budget only as a decision, in the same commit that says why.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The whole file, in lines. Comparable tools: Vale 175, Biome 204, superpowers 399 (docs/prior-art/readme-structure.md). */
const MAX_LINES = 300;
/** One `##` section, heading to next heading: about one screen. */
const MAX_SECTION_LINES = 60;
/** The install command, by line: the first screen a reader scrolls, not a page further down. */
const MAX_INSTALL_LINE = 90;
const INSTALL = "npm i -D paperlint";

const README = readFileSync(
  join(import.meta.dirname, "..", "README.md"),
  "utf8",
);

/** The file's lines; the newline that ends the last one does not start another. */
const lineList = (text: string): string[] =>
  text.replace(/\n$/u, "").split("\n");

/** Each `##` section with its length in lines (its heading line included). */
function sections(text: string): { title: string; lines: number }[] {
  const lines = lineList(text);
  const starts = lines.flatMap((l, i) => (l.startsWith("## ") ? [i] : []));
  return starts.map((s, k) => ({
    title: lines[s] ?? "",
    lines: (starts[k + 1] ?? lines.length) - s,
  }));
}

/** What breaks the budgets, one line per breach; empty when the text keeps them. */
function breaches(text: string): string[] {
  const lines = lineList(text);
  const install = lines.findIndex((l) => l.includes(INSTALL)) + 1;
  return [
    ...(lines.length > MAX_LINES
      ? [`${String(lines.length)} lines, over ${String(MAX_LINES)}`]
      : []),
    ...sections(text)
      .filter((s) => s.lines > MAX_SECTION_LINES)
      .map(
        (s) =>
          `${s.title}: ${String(s.lines)} lines, over ${String(MAX_SECTION_LINES)}`,
      ),
    ...(install === 0 || install > MAX_INSTALL_LINE
      ? [
          `\`${INSTALL}\` at line ${String(install)}, not within the first ${String(MAX_INSTALL_LINE)}`,
        ]
      : []),
  ];
}

describe("the README stays a front page", () => {
  it("keeps every budget", () => {
    expect(breaches(README)).toEqual([]);
  });

  it("a section past one screen is reported by its heading", () => {
    const long = `${INSTALL}\n## Short\nx\n## Long\n${"x\n".repeat(MAX_SECTION_LINES)}`;
    expect(breaches(long)).toEqual([
      `## Long: ${String(MAX_SECTION_LINES + 1)} lines, over ${String(MAX_SECTION_LINES)}`,
    ]);
  });

  it("a file over budget, with install pushed down, is reported twice", () => {
    const bloated = `${"x\n".repeat(MAX_LINES)}${INSTALL}\n`;
    expect(breaches(bloated)).toEqual([
      `${String(MAX_LINES + 1)} lines, over ${String(MAX_LINES)}`,
      `\`${INSTALL}\` at line ${String(MAX_LINES + 1)}, not within the first ${String(MAX_INSTALL_LINE)}`,
    ]);
  });

  it("a README without the install command is reported", () => {
    expect(breaches("## Only\nx\n")).toEqual([
      `\`${INSTALL}\` at line 0, not within the first ${String(MAX_INSTALL_LINE)}`,
    ]);
  });
});
