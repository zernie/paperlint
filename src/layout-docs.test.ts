/**
 * The pages draw the layout the code enforces. Each page embeds the drawing between
 * `<!-- layout:begin … -->` and `<!-- layout:end -->`, and that block must equal the render of the
 * constants that decide what is allowed (`PAPER_LAYOUT_TREE`, `REPRO_LAYOUT_TREE`, `CORPUS_LAYOUT_TREE`, and
 * `PAPERS_LAYOUT_TREE`, which draws the paper folder beside the venues' corpora) — so a page cannot
 * show an entry the rule reports, or miss one it allows. Both halves: the committed pages match, and
 * a page with one entry changed or with no block at all does not.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURE_BY_DEFAULT,
  CURE_BY_FILE,
  KNOWN_CURES,
  PAPER_LAYOUT_TREE,
  PAPERS_LAYOUT_TREE,
} from "./domain/paper-layout.ts";
import { CORPUS_LAYOUT_TREE } from "./domain/corpus-layout.ts";
import { REPRO_LAYOUT_TREE } from "./domain/repro-layout.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const PAGES: readonly (readonly [string, string])[] = [
  ["docs/rules/paper/allowed-files-only.md", PAPER_LAYOUT_TREE],
  ["docs/rules/repro/allowed-files-only.md", REPRO_LAYOUT_TREE],
  ["docs/rules/corpus/allowed-files-only.md", CORPUS_LAYOUT_TREE],
  ["docs/layout.md", PAPERS_LAYOUT_TREE],
];

/** The drawing a page embeds, as its fenced block holds it; null when the page has no block. */
function embedded(page: string): string | null {
  const m =
    /<!-- layout:begin[^\n]*-->\n\n```text\n([\s\S]*?)\n```\n\n<!-- layout:end -->/u.exec(
      page,
    );
  return m === null ? null : (m[1] ?? null);
}

describe("the pages draw the layout the code enforces", () => {
  it.each(PAGES)("%s embeds the current render", (path, tree) => {
    expect(
      embedded(readFileSync(join(ROOT, path), "utf8")),
      `${path}: paste this between its layout markers:\n\n${tree}\n`,
    ).toBe(tree);
  });

  it("a page whose drawing lost an entry differs from the render", () => {
    const page = `<!-- layout:begin x -->\n\n\`\`\`text\n${PAPER_LAYOUT_TREE.replace(/\n[^\n]*extra\/[^\n]*/u, "")}\n\`\`\`\n\n<!-- layout:end -->\n`;
    expect(embedded(page)).not.toBe(PAPER_LAYOUT_TREE);
  });

  it("a page with no block has no drawing", () => {
    expect(embedded("# a page\n")).toBeNull();
  });
});

const tick = (s: string): string => `\`${s}\``;

/** Each destination the finding picks, with the backticked names or extensions its table row must hold. */
const ROWS: readonly (readonly string[])[] = [
  ...KNOWN_CURES.map((c) => [
    tick(c.kind === "dir" ? `${c.name}/` : c.name),
    c.cure,
  ]),
  ...CURE_BY_FILE.map((c) => [
    ...c.names.map(tick),
    ...c.extensions.map(tick),
    tick(c.cure),
  ]),
  [tick(CURE_BY_DEFAULT)],
];

/** The rows no single line of the page holds whole: a row lost, or its destination swapped. */
const unlisted = (page: string): readonly (readonly string[])[] => {
  const lines = page.split("\n");
  return ROWS.filter(
    (row) => !lines.some((line) => row.every((cell) => line.includes(cell))),
  );
};

describe("the rule's page lists every destination the one-line finding picks", () => {
  const page = readFileSync(
    join(ROOT, "docs/rules/paper/allowed-files-only.md"),
    "utf8",
  );

  it("paper/allowed-files-only has a line per known entry and per extension group, with its destination", () => {
    expect(unlisted(page)).toEqual([]);
  });

  it("a page whose two destinations are swapped, or without the list, is caught", () => {
    const swapped = page
      .replace("| `repro/data/` |", "| @@ |")
      .replace("| `repro/tools/` |", "| `repro/data/` |")
      .replace("| @@ |", "| `repro/tools/` |");
    expect(unlisted(swapped).length).toBeGreaterThan(0);
    expect(unlisted("# a page\n")).toEqual(ROWS);
  });
});
