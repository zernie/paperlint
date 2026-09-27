/**
 * markdown.mjs — the markup readers every script shares, on the shapes their callers rely on:
 * frontmatter blanked (offsets kept) or cut, headings from the parser (not from a `#` inside a
 * fence), sections by level, fences, paragraphs and tables. And the one thing a test run never
 * sees by accident: markdown-it failing to resolve, where every reader must degrade to its
 * documented empty value and `requireMarkdown` must refuse with exit 2.
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir, writeTree } from "../test/support.mjs";
import {
  blankFrontmatter,
  fences,
  frontmatterBlock,
  headings,
  requireMarkdown,
  paragraphs,
  sectionBody,
  splitSections,
  stripFences,
  stripFrontmatter,
  tables,
  thematicBreaks,
} from "./markdown.mjs";

const DOC = [
  "---", // 0
  "title: T", // 1
  "  ## not a heading, inside the frontmatter", // 2
  "---", // 3
  "# Title", // 4
  "", // 5
  "Intro para.", // 6
  "", // 7
  "## One", // 8
  "Body one.", // 9
  "", // 10
  "---", // 11
  "", // 12
  "after the rule", // 13
  "", // 14
  "```", // 15
  "## a heading in a fence", // 16
  "```", // 17
  "", // 18
  "    indented code", // 19
  "", // 20
  "### One.a", // 21
  "| a | b |", // 22
  "|---|:-:|", // 23
  "| 1 | 2 |", // 24
  "", // 25
  "## Two", // 26
  "last", // 27
].join("\n");

test("frontmatter: blanked with offsets kept, its body, cut; untouched when there is none", () => {
  assert.deepEqual(
    {
      blank: blankFrontmatter("---\na: 1\n---\nx").split("\n"),
      body: frontmatterBlock(DOC),
      none: [
        frontmatterBlock("x"),
        blankFrontmatter("x"),
        stripFrontmatter("x"),
      ],
      cut: stripFrontmatter("---\na: 1\n---\n\nx"),
    },
    {
      blank: ["   ", "    ", "   ", "x"],
      body: "title: T\n  ## not a heading, inside the frontmatter",
      none: [null, "x", "x"],
      cut: "\nx",
    },
  );
});

test("headings come from the parser: not from the frontmatter, not from a fence, not setext", () => {
  const offset = (line) => DOC.split("\n").slice(0, line).join("\n").length + 1;
  assert.deepEqual(headings(DOC + "\n\nSetext\n======\n"), [
    { depth: 1, text: "Title", line: 4, offset: offset(4) },
    { depth: 2, text: "One", line: 8, offset: offset(8) },
    { depth: 3, text: "One.a", line: 21, offset: offset(21) },
    { depth: 2, text: "Two", line: 26, offset: offset(26) },
  ]);
});

test("an empty ATX heading has empty text", () => {
  assert.deepEqual(
    headings("#\n").map((h) => [h.depth, h.text]),
    [[1, ""]],
  );
});

test("sectionBody: by level, optionally stopping at a rule; null when absent", () => {
  assert.deepEqual(
    [
      sectionBody(DOC, /^One$/).body.split("\n").slice(0, 4),
      sectionBody(DOC, /^One$/, { stopAtRule: true }).body,
      sectionBody(DOC, (h) => h.text === "Two").body,
      sectionBody(DOC, /^One$/, { depth: 1 }),
      sectionBody("## Last", /^Last$/).body,
      sectionBody(DOC, /^Two$/, { stopAtRule: true }).body,
    ],
    [["Body one.", "", "---", ""], "Body one.\n\n", "last", null, "", "last"],
  );
});

test("thematicBreaks: the `---` rules, not the frontmatter fences", () => {
  const offsets = thematicBreaks(DOC);
  assert.deepEqual(
    offsets.map((o) => DOC.slice(o, o + 3)),
    ["---"],
  );
});

test("splitSections: a preamble always first, then each heading of the level range", () => {
  assert.deepEqual(
    splitSections(DOC, { min: 2, max: 2 }).map((s) => [
      s.heading?.text ?? null,
      s.body.split("\n")[0],
    ]),
    [
      [null, "---"],
      ["One", "Body one."],
      ["Two", "last"],
    ],
  );
  assert.deepEqual(
    splitSections("## A").map((s) => [s.heading?.text ?? null, s.body]),
    [
      [null, ""],
      ["A", ""],
    ],
  );
});

test("fences and indented code, as content; stripped as lines, or blanked in place", () => {
  const src = "a\n```\nx\n```\n\n    y\nb";
  assert.deepEqual(
    {
      fences: fences(src),
      stripped: stripFences(src),
      blanked: stripFences(src, { blank: true }),
    },
    { fences: ["x\n", "y\n"], stripped: "a\n\nb", blanked: "a\n\n\n\n\n\nb" },
  );
});

test("paragraphs are line ranges; tables are rows of cells, the alignment row skipped", () => {
  assert.deepEqual(
    { paragraphs: paragraphs(DOC), tables: tables(DOC) },
    {
      paragraphs: [
        { line: 6, endLine: 7 },
        { line: 9, endLine: 10 },
        { line: 13, endLine: 14 },
        { line: 27, endLine: 28 },
      ],
      tables: [
        {
          line: 22,
          endLine: 25,
          rows: [
            ["a", "b"],
            ["1", "2"],
          ],
        },
      ],
    },
  );
});

const root = useTempDir("markdown-no-parser-");
writeTree(root, {
  // Registered with --import: resolving `markdown-it` fails, as it does with no node_modules.
  "no-markdown-it.mjs":
    "import { register } from 'node:module';\n" +
    "register('data:text/javascript,' + encodeURIComponent(\"export async function resolve(s, c, next) { if (s === 'markdown-it') throw Object.assign(new Error('gone'), { code: 'ERR_MODULE_NOT_FOUND' }); return next(s, c); }\"));\n",
  "probe.mjs":
    `const m = await import(${JSON.stringify(join(dirname(fileURLToPath(import.meta.url)), "markdown.mjs"))});\n` +
    "const t = '# H\\n\\n```\\nx\\n```\\n';\n" +
    "console.log(JSON.stringify([m.MD_AVAILABLE(), m.headings(t), m.thematicBreaks(t), m.fences(t), m.stripFences(t), m.paragraphs(t), m.tables(t)]));\n" +
    "m.requireMarkdown();\n" +
    "console.log('not reached');\n",
  "probe-plugin.mjs":
    `const m = await import(${JSON.stringify(join(dirname(fileURLToPath(import.meta.url)), "markdown.mjs"))});\n` +
    'm.requireMarkdown({ from: "file:///home/u/.claude/plugins/cache/paperlint/lib/markdown.mjs" });\n',
});

test("this file, told it runs from a plugin cache, sends its user to the npm package", () => {
  const r = runNode(join(root, "probe-plugin.mjs"), [], {
    nodeArgs: ["--import", join(root, "no-markdown-it.mjs")],
  });
  assert.deepEqual(
    [r.status, r.stderr.split("\n").slice(1, 2)],
    [
      2,
      [
        "  Running from a PLUGIN copy, which is installed without dependencies. Install the npm",
      ],
    ],
  );
});

test("with no markdown-it, every reader degrades to its empty value and requireMarkdown exits 2", () => {
  const r = runNode(join(root, "probe.mjs"), [], {
    nodeArgs: ["--import", join(root, "no-markdown-it.mjs")],
  });
  assert.deepEqual(r, {
    status: 2,
    stdout:
      JSON.stringify([false, [], [], [], "# H\n\n```\nx\n```\n", [], []]) +
      "\n",
    stderr:
      "markdown-it does not resolve — this script parses markup with a parser and without it would produce a confident zero instead of an error.\n" +
      "  Cured by `npm i` at the repo root.\n",
  });
});

test("splitSections of a document with no heading is the preamble alone; requireMarkdown is silent with a parser", () => {
  assert.deepEqual(
    [
      splitSections("just text").map((s) => [s.heading, s.body]),
      requireMarkdown(),
    ],
    [[[null, "just text"]], undefined],
  );
});

test("headings and thematic breaks read a token stream that breaks markdown-it's shape as empty text and offset 0", () => {
  // A heading not followed by its inline token, and blocks mapped past the end of the text.
  const parse = () => [
    { type: "heading_open", map: [9, 10], markup: "##", tag: "h2" },
    { type: "paragraph_open" },
    { type: "hr", map: [9, 10] },
  ];
  assert.deepEqual(
    [headings("x", { parse }), thematicBreaks("x", { parse })],
    [[{ depth: 2, text: "", line: 9, offset: 0 }], [0]],
  );
});

test("a copy running from a plugin cache without markdown-it is told to install the npm package", () => {
  // A plugin copy is installed without dependencies: here, a copy under `.claude/plugins/` with
  // no node_modules above it, so `markdown-it` does not resolve for real.
  const lib = join(root, ".claude", "plugins", "paperlint", "lib");
  mkdirSync(lib, { recursive: true });
  copyFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "markdown.mjs"),
    join(lib, "markdown.mjs"),
  );
  writeTree(lib, {
    "probe.mjs":
      'const m = await import("./markdown.mjs");\nm.requireMarkdown();\n',
  });
  const r = runNode(join(lib, "probe.mjs"), []);
  assert.deepEqual(
    [r.status, r.stderr.split("\n").slice(1)],
    [
      2,
      [
        "  Running from a PLUGIN copy, which is installed without dependencies. Install the npm",
        "  package in the project as well (`npm i paperlint`) and call it through",
        "  `npx paperlint`, which resolves from the project's own tree.",
        "",
      ],
    ],
  );
});
