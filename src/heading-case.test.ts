/**
 * `tex/heading-case` through the whole CLI, on small paper trees: what turns it on and what it says
 * once it is on, the fixes `--fix` writes, a heading in an included file, and the escape hatch. The
 * words the judge asks for are tested where it lives (`src/domain/heading-case.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { run } from "./cli.ts";
import { headingCaseRule } from "./heading-case.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const Results = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        severity: z.number(),
        line: z.number().optional(),
        message: z.string(),
      }),
    ),
  }),
);

const ACM = "\\documentclass[sigconf]{acmart}";
const doc = (body: string): string =>
  `${ACM}\n\\begin{document}\n${body}\n\\end{document}\n`;

const paper = (
  tex: string,
  settings: Record<string, unknown> | null,
  extra: Record<string, string> = {},
): Record<string, string> => ({
  "package.json": '{"name":"consumer","private":true}',
  "papers/p/PIPELINE-STATUS.md": "---\nstages: []\n---\n# PIPELINE-STATUS\n",
  "papers/p/paper.tex": tex,
  ...(settings === null
    ? {}
    : { "papers/p/paperlint.json": JSON.stringify(settings) }),
  ...extra,
});

/** Lint the tree; the messages of `tex/heading-case` as `file:line message`, and the project dir. */
async function lint(
  tree: Record<string, string>,
  args: readonly string[] = [],
): Promise<{ found: string[]; dir: string }> {
  const dir = writeTree(useTempDir("paperlint-heading-case-"), tree);
  const out: string[] = [];
  await run(["lint", "--json", ...args], {
    cwd: dir,
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: () => undefined,
  });
  const found = Results.parse(JSON.parse(out.join("\n"))).flatMap((r) =>
    r.messages
      .filter((m) => m.ruleId === "tex/heading-case")
      .map(
        (m) =>
          `${r.filePath.slice(dir.length + 1)}:${String(m.line)}:${String(m.severity)} ${m.message}`,
      ),
  );
  return { found, dir };
}

const PRESET = { extends: "paperlint:acm-sigconf" };
const SENTENCE_CASE = [
  "\\section{Related work}",
  "\\subsection{The advertised savings don't show up}",
  "\\section{Method: a cost-aware, correctness-gated harness}",
  "\\subsection{A ceiling for any output-trimming tool}",
].join("\n");
const HEADLINE_CASE = [
  "\\section{Related Work}",
  "\\subsection{The Advertised Savings Don't Show Up}",
  "\\section{Method: A Cost-Aware, Correctness-Gated Harness}",
  "\\subsection{A Ceiling for Any Output-Trimming Tool}",
].join("\n");

describe("tex/heading-case on a paper that extends an ACM preset", () => {
  it("🔴 reports every sentence-case heading, as an error, on its line", async () => {
    const { found } = await lint(paper(doc(SENTENCE_CASE), PRESET));
    expect(found.map((f) => f.slice(0, f.indexOf(" ")))).toEqual([
      "papers/p/paper.tex:3:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:5:2",
      "papers/p/paper.tex:5:2",
      "papers/p/paper.tex:5:2",
      "papers/p/paper.tex:5:2",
      "papers/p/paper.tex:6:2",
      "papers/p/paper.tex:6:2",
      "papers/p/paper.tex:6:2",
      "papers/p/paper.tex:6:2",
    ]);
    expect(found[0]).toContain("capitalize «work» → «Work»");
  });

  it("🔴 stays silent on the corrected headings", async () => {
    expect((await lint(paper(doc(HEADLINE_CASE), PRESET))).found).toEqual([]);
  });

  it("--fix writes the corrected headings, and a second run is clean", async () => {
    const tree = paper(doc(SENTENCE_CASE), PRESET);
    const { dir } = await lint(tree, ["--fix"]);
    expect(readFileSync(join(dir, "papers/p/paper.tex"), "utf8")).toBe(
      doc(HEADLINE_CASE),
    );
    const again: string[] = [];
    await run(["lint", "--json"], {
      cwd: dir,
      log: (...a: unknown[]) => again.push(a.join(" ")),
      err: () => undefined,
    });
    expect(again.join("\n")).not.toContain("tex/heading-case");
  });

  it("the paper turns it off in its own paperlint.json", async () => {
    const off = { ...PRESET, rules: { "tex/heading-case": "off" } };
    expect((await lint(paper(doc(SENTENCE_CASE), off))).found).toEqual([]);
  });

  it("the paper chooses another style: sentence style asks only for the first word", async () => {
    const own = {
      ...PRESET,
      rules: { "tex/heading-case": ["error", { style: "sentence" }] },
    };
    expect((await lint(paper(doc(SENTENCE_CASE), own))).found).toEqual([]);
    const { found } = await lint(paper(doc("\\section{related work}"), own));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("capitalize the first word");
  });

  it("a disable directive with its reason silences one heading", async () => {
    const body = [
      "% eslint-disable-next-line tex/heading-case -- the tool's own name is lowercase",
      "\\section{Evaluating vigiles}",
    ].join("\n");
    expect((await lint(paper(doc(body), PRESET))).found).toEqual([]);
  });
});

describe("tex/heading-case on a paper that does not extend an ACM preset", () => {
  it("🔴 is silent on a paper with no preset and on an IEEE preset", async () => {
    expect((await lint(paper(doc(SENTENCE_CASE), null))).found).toEqual([]);
    const ieee = { extends: "paperlint:aidc", kind: "short" };
    expect((await lint(paper(doc(SENTENCE_CASE), ieee))).found).toEqual([]);
  });

  it("a paper turns it on for itself", async () => {
    const own = {
      rules: { "tex/heading-case": ["error", { style: "headline" }] },
    };
    const { found } = await lint(paper(doc("\\section{Related work}"), own));
    expect(found).toHaveLength(1);
  });

  it("turned on with no style it says so once, and does not pass as a check that ran", async () => {
    const own = { rules: { "tex/heading-case": "error" } };
    const { found } = await lint(paper(doc("\\section{Related work}"), own));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("names no style");
  });
});

describe("tex/heading-case in the files a paper includes", () => {
  const tree = paper(
    doc("\\section{Introduction}\n\\input{sections/results}"),
    PRESET,
    { "papers/p/sections/results.tex": "\\section{Results and discussion}\n" },
  );

  it("reports a heading at its own file and line, and --fix edits that file", async () => {
    const { found, dir } = await lint(tree, ["--fix"]);
    expect(found).toEqual([]);
    expect(
      readFileSync(join(dir, "papers/p/sections/results.tex"), "utf8"),
    ).toBe("\\section{Results and Discussion}\n");
  });

  it("reports without --fix", async () => {
    const { found } = await lint(tree);
    expect(found.map((f) => f.slice(0, f.indexOf(" ")))).toEqual([
      "papers/p/sections/results.tex:1:2",
    ]);
  });
});

describe("the rule's own contract", () => {
  const rule = headingCaseRule({ latex: latexReader });

  it("takes a style and nothing else", () => {
    expect(rule.meta.schema).toEqual([
      {
        type: "object",
        properties: { style: { enum: ["headline", "sentence", "off"] } },
        required: ["style"],
        additionalProperties: false,
      },
    ]);
    expect(rule.meta.fixable).toBe("code");
  });

  it("a finding without a place is reported at the top of the file", () => {
    const reported: unknown[] = [];
    const sourceCode = {
      text: "",
      getLocFromIndex: (i: number) => ({ line: 1, column: i }),
    };
    rule
      .create({
        options: [{ style: "headline" }],
        sourceCode: { ...sourceCode, raw: "\\section{a\\emph{b}c}" },
        report: (d) => reported.push(d),
      })
      .root?.();
    expect(reported).toHaveLength(1);
  });
});
