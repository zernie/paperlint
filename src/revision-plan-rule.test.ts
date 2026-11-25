/**
 * `revision-plan/record` through `paperlint lint`, the way a consumer runs it: off, the plan is not even
 * read; turned on by the set, in the root or in the paper's own settings, each defect is reported at
 * its field, at `warn`; no other JSON file of the paper is reached.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { run } from "./cli.ts";
import { useTempDir, writeTree } from "../test/support.ts";
import { lineOf, PLAN, planText } from "../test/revision-plan-fixture.ts";

const STATUS = "---\nstages: []\n---\n# PIPELINE-STATUS\n";
const TEX = "\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n";
const P = "papers/p";
const FILE = `${P}/revision-plan.json`;
const SET_ON = '{"rules":{"paperlint:revision-plan":"warn"}}';

/** A paper with its plan, and whatever else the case adds. */
const paper = (
  plan: string,
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> => ({
  [`${P}/PIPELINE-STATUS.md`]: STATUS,
  [`${P}/paper.tex`]: TEX,
  [FILE]: plan,
  ...extra,
});

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

/** `paperlint lint --json` over the tree: the files linted, and the messages on the plan. */
async function lint(tree: Readonly<Record<string, string>>) {
  const dir = writeTree(useTempDir("paperlint-plan-"), {
    "package.json": '{"name":"consumer","private":true}',
    ...tree,
  });
  const out: string[] = [];
  await run(["lint", "--json"], {
    cwd: dir,
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: () => undefined,
  });
  const results = Results.parse(JSON.parse(out.join("\n")));
  const rel = (p: string) => p.slice(dir.length + 1);
  return {
    files: results.map((r) => rel(r.filePath)),
    onPlan: results
      .filter((r) => rel(r.filePath) === FILE)
      .flatMap((r) =>
        r.messages.map((m) => ({
          ruleId: m.ruleId,
          severity: m.severity,
          line: m.line,
        })),
      ),
  };
}

/** The plan with its `written` field misspelt. */
const MISSPELT = planText({
  ...PLAN,
  writen: PLAN.written,
  written: undefined,
});

describe("revision-plan/record: off means silent", () => {
  it("🔴 the set off, a plan that is not even JSON is not linted", async () => {
    // Guards: an author who never turned the set on gets no finding, not even ESLint's parse error.
    const r = await lint(paper("{ not json"));
    expect(r.files).not.toContain(FILE);
    expect(r.onPlan).toEqual([]);
  });

  it("the set off, a plan with a misspelt key gets nothing", async () => {
    const r = await lint(paper(MISSPELT));
    expect(r.onPlan).toEqual([]);
  });
});

describe("revision-plan/record: turned on by the set", () => {
  it("🔴 is silent on a valid plan, and reaches it", async () => {
    const r = await lint(paper(planText(), { "paperlint.json": SET_ON }));
    expect(r.files).toContain(FILE);
    expect(r.onPlan).toEqual([]);
  });

  it("🔴 reports a misspelt key at its line, and the field it left out at the top, at warn", async () => {
    const r = await lint(paper(MISSPELT, { "paperlint.json": SET_ON }));
    expect(r.onPlan).toEqual([
      { ruleId: "revision-plan/record", severity: 1, line: 1 },
      {
        ruleId: "revision-plan/record",
        severity: 1,
        line: lineOf(MISSPELT, '"writen"'),
      },
    ]);
  });

  it("is reached when the paper's own paperlint.json turns the set on", async () => {
    const dup = planText({
      ...PLAN,
      remaining: [PLAN.remaining[0], { ...PLAN.remaining[1], id: "R1" }],
    });
    const r = await lint(
      paper(dup, {
        [`${P}/paperlint.json`]: SET_ON,
      }),
    );
    expect(r.onPlan).toEqual([
      {
        ruleId: "revision-plan/record",
        severity: 1,
        line: lineOf(dup, '"id": "R1"', 2),
      },
    ]);
  });

  it("an author's own severity raises it", async () => {
    const r = await lint(
      paper(MISSPELT, {
        "paperlint.json":
          '{"rules":{"paperlint:revision-plan":"warn","revision-plan/record":"error"}}',
      }),
    );
    expect(r.onPlan.map((m) => m.severity)).toEqual([2, 2]);
  });

  it("text that is not JSON is ESLint's parse error, not the rule's", async () => {
    const r = await lint(paper("{ not json", { "paperlint.json": SET_ON }));
    expect(r.onPlan).toEqual([{ ruleId: null, severity: 2, line: 1 }]);
  });
});
