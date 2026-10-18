/**
 * The guard over the pack list (`scripts/packed-links.ts`, #187): both halves — a planted link that
 * leaves the package, or leads to a file the package does not ship, is reported with the file, the
 * line, the link and what to do; links that stay inside, URLs, anchors and images are quiet — and the
 * real package, whose Markdown must hold no such link.
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  brokenLinkMessage,
  brokenLinks,
  hrefsOf,
  packedLinkProblems,
  packedPaths,
} from "./packed-links.ts";

const SHIPPED = new Set([
  "docs/a.md",
  "docs/rules/tex/b.md",
  "skills/x/SKILL.md",
  "skills/x/references/r.md",
  "src/code.ts",
]);
const check = (file: string, text: string) =>
  brokenLinks(new Map([[file, text]]), SHIPPED).map(brokenLinkMessage);

it("a link out of the package is reported: the file, the line, the link, where it leads, what to do", () => {
  const found = check(
    "skills/x/references/r.md",
    "# r\n\nSee [the source](../../../../other-project/notes.md) for more.\n",
  );
  // Guards: a planted link outside the package fails the check; the text tells the author which
  // file and line, which link, and the three ways out.
  expect(found).toEqual([
    "skills/x/references/r.md:3: the link `../../../../other-project/notes.md` leads outside the package (../other-project/notes.md), so it is broken in the published package. Rewrite it as text that names the source, link the public repository's URL, or — for a file that should ship — add it to `files` in package.json.",
  ]);
});

it("a link to a file inside the package that the pack list leaves out is reported", () => {
  // Guards: `fixtures/accepted-papers` exists in the repository and is not in the tarball.
  expect(
    check(
      "docs/rules/tex/b.md",
      "[x](../../../fixtures/accepted-papers/README.md)",
    ),
  ).toEqual([
    "docs/rules/tex/b.md:1: the link `../../../fixtures/accepted-papers/README.md` leads to `fixtures/accepted-papers/README.md`, which the package does not ship, so it is broken in the published package. Rewrite it as text that names the source, link the public repository's URL, or — for a file that should ship — add it to `files` in package.json.",
  ]);
});

it("links that stay inside the package, URLs, anchors, mail links and root paths are quiet; images and reference links are read", () => {
  const quiet = [
    "[a](../a.md) [b](tex/b.md#heading) [c](./../a.md?plain=1) [d](../../skills/x)",
    "[u](https://example.org/x) [m](mailto:a@b.c) [h](#here) [root](/docs/a.md)",
  ].join("\n");
  expect(check("docs/rules/c.md", quiet)).toEqual([]);
  // Guards: an image and a reference-style link are links too.
  expect(
    check(
      "docs/c.md",
      "![fig](gone.png)\n\n[ref][1]\n\n[1]: ../nowhere.md\n",
    ).map((m) => m.split(" leads")[0]),
  ).toEqual([
    "docs/c.md:1: the link `gone.png`",
    "docs/c.md:3: the link `../nowhere.md`",
  ]);
});

it("hrefsOf gives each link with its line, and none for code", () => {
  expect(
    hrefsOf("[a](x.md)\n\n```\n[b](y.md)\n```\n\n`[c](z.md)` and [d](w.md)\n"),
  ).toEqual([
    { href: "x.md", line: 1 },
    { href: "w.md", line: 7 },
  ]);
});

it("the real package: npm pack lists its files, and no Markdown it ships links to a path it does not ship", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  // Guards: the pack list is read, not assumed — it holds this guard's subject and not a file `files` excludes.
  const shipped = packedPaths(root);
  expect([
    shipped.has("package.json"),
    shipped.has("docs/rules/tex/heading-case.md"),
    shipped.has("fixtures/accepted-papers/README.md"),
  ]).toEqual([true, true, false]);
  expect(packedLinkProblems(root, shipped)).toEqual([]);
}, 60_000);

it("an invalid percent-escape in a link is read as written, not thrown at", () => {
  // Guards: `%ff` is no UTF-8 sequence; the link is judged by its text.
  expect(
    check("docs/a.md", "[x](%ff.md)").map((m) => m.split(" leads")[0]),
  ).toEqual(["docs/a.md:1: the link `%ff.md`"]);
});

it("a directory that is no package says so instead of passing", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "packed-links-")));
  try {
    // Guards: a failed `npm pack` is an error naming the command, never an empty list that finds nothing.
    expect(() => packedPaths(dir)).toThrow(
      /^npm pack --dry-run failed \(exit \d+\)/u,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
