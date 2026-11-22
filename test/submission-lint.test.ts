import { expect, test, vi } from "vitest";
import { join } from "node:path";
import { err, ok } from "../src/domain/result.ts";
import { submissionLint } from "../src/domain/submission-lint.ts";
import { run as runCli, runHook } from "../src/cli.ts";
import { useTempDir, writeTree } from "./support.ts";
import {
  files,
  run,
  PDF,
  SITE,
  facts,
  newFiles,
  venue,
} from "./submission-fixtures.ts";

async function expectLintExceptionScreen(cwd: string): Promise<void> {
  const screen: string[] = [];
  await runHook("submission-confirm", {
    stdin: () =>
      JSON.stringify({
        cwd,
        transcript_path: join(cwd, "transcript.jsonl"),
        tool_name: "Bash",
        tool_input: {
          command:
            'npx paperlint submission update papers/p --save --allow-lint-errors "Known exception"',
        },
      }),
    out: (line) => {
      screen.push(line);
    },
  });
  const shown = screen.join("\n");
  expect(shown).toContain('"permissionDecision":"deny"');
  expect(shown).toContain(
    JSON.stringify('Allow lint errors: "Known exception"').slice(1, -1),
  );
  expect(shown).toContain("tex/max-paragraph-numbers");
}

const missingResult = submissionLint(
  [
    {
      file: "research/study/plan.md",
      severity: 2,
      ruleId: "repro/result-present",
      message: "Finished study has no result.json",
      line: 9,
    },
  ],
  null,
);

test.each(["new", "update"] as const)(
  "%s runs full lint before a portal save",
  async (sub) => {
    const input = { sub, submit: sub === "update" };
    const paperFiles = () => (sub === "new" ? newFiles({}) : files({}));
    const lintPaper = () => Promise.resolve(ok(missingResult));
    const blocked = await run(
      { ...input, save: true },
      { files: paperFiles(), lintPaper },
    );
    expect([blocked.code, blocked.seen[0]?.calls]).toStrictEqual([2, []]);
    expect(blocked.out).toContain(
      "  research/study/plan.md:9:1 repro/result-present — Finished study has no result.json",
    );

    const dry = await run(input, { files: paperFiles(), lintPaper });
    expect([dry.code, dry.seen[0]?.calls.length]).toStrictEqual([0, 1]);
    expect(dry.out).toContain(
      "lint: 1 error, 0 warnings (abstract: 0, introduction: 0)",
    );

    const allowed = await run(
      { ...input, save: true, allowLintErrors: "Known exception" },
      { files: paperFiles(), lintPaper },
    );
    expect([allowed.code, allowed.seen[0]?.calls.length]).toStrictEqual([0, 1]);
    expect(allowed.out).toContain('Allow lint errors: "Known exception"');
  },
);

test("an exception cannot approve a missing lint result", async () => {
  const r = await run(
    { sub: "update", save: true, allowLintErrors: "Known exception" },
    {
      lintPaper: () =>
        Promise.resolve(err("paper lint could not read its configuration")),
    },
  );
  expect([r.code, r.errs, r.seen[0]?.calls]).toStrictEqual([
    2,
    ["lint could not finish: paper lint could not read its configuration"],
    [],
  ]);
});

test("the CLI blocks on an error from the paper's own ESLint config before any portal request", async () => {
  const cwd = useTempDir("paperlint-submission-lint-");
  writeTree(cwd, {
    "paperlint.json": JSON.stringify({ structure: false }),
    "venue.jsonc": venue({ kind: "hotcrp", url: `${SITE}/` }),
    "papers/p/paperlint.json": JSON.stringify({
      extends: "../../venue.jsonc",
      submission: { id: 7 },
      rules: { "tex/max-paragraph-numbers": ["error", { max: 1 }] },
    }),
    "papers/p/paper.tex": [
      "\\documentclass{article}",
      "\\begin{document}",
      "\\begin{abstract}",
      "We ran 2 analyses on 3 datasets.",
      "\\end{abstract}",
      "\\end{document}",
    ].join("\n"),
    "papers/p/paper.pdf": Buffer.from(PDF),
    "papers/p/_build/paper.facts.json": facts(),
    "transcript.jsonl": "",
  });
  const requests = vi.fn();
  const out: string[] = [];
  vi.stubEnv("HOTCRP_TOKEN_127_0_0_1_9", "test-token");
  vi.stubGlobal("fetch", requests);
  try {
    const code = await runCli(["submission", "update", "papers/p", "--save"], {
      cwd,
      log: (line: string) => {
        out.push(line);
      },
      err: () => {},
    });
    expect(code).toBe(2);
    expect(out.join("\n")).toContain("tex/max-paragraph-numbers");
    expect(requests).not.toHaveBeenCalled();
    await expectLintExceptionScreen(cwd);
    expect(requests).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});
