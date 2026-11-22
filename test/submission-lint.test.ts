import { expect, test, vi } from "vitest";
import { join } from "node:path";
import { err, ok } from "../src/domain/result.ts";
import { usageProblem, submissionSections } from "../src/submission.ts";
import { latexReader } from "../src/adapters/latex/index.ts";
import { sourcesCodec } from "../src/adapters/sources-record/index.ts";
import { memoryFiles } from "../src/adapters/memory/index.ts";
import { submissionLint } from "../src/domain/submission-lint.ts";
import { run as runCli, runHook } from "../src/cli.ts";
import { useTempDir, writeTree } from "./support.ts";
import {
  ARGS,
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

test("the CLI counts a missing required file in the paper folder as a lint error before any portal request", async () => {
  const cwd = useTempDir("paperlint-submission-structure-");
  writeTree(cwd, {
    "venue.jsonc": venue({ kind: "hotcrp", url: `${SITE}/` }),
    "papers/p/paperlint.json": JSON.stringify({
      extends: "../../venue.jsonc",
      submission: { id: 7 },
    }),
    "papers/p/paper.tex": [
      "\\documentclass{article}",
      "\\begin{document}",
      "\\end{document}",
    ].join("\n"),
    // A paper-like neighbour with a source but without the required PIPELINE-STATUS.md.
    "papers/p/draft/paper.tex": "\\documentclass{article}\n",
    "papers/p/paper.pdf": Buffer.from(PDF),
    "papers/p/_build/paper.facts.json": facts(),
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
    expect(out.join("\n")).toContain("PIPELINE-STATUS.md");
    expect(requests).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

test("--allow-lint-errors needs a nonempty reason, --save and a send, and then the command line is usable", () => {
  const problem =
    "--allow-lint-errors needs a nonempty reason and --save on submission new or update";
  const send = { ...ARGS, sub: "update", save: true } as const;
  expect([
    usageProblem({ ...send, allowLintErrors: "Known exception" }),
    usageProblem({ ...send, allowLintErrors: "  " }),
    usageProblem({ ...send, allowLintErrors: "--submit" }),
    usageProblem({ ...send, save: false, allowLintErrors: "Known exception" }),
    usageProblem({ ...ARGS, allowLintErrors: "Known exception" }),
  ]).toStrictEqual([null, problem, problem, problem, problem]);
});

test("a dry run reports a lint that could not finish and still exits 0, a save exits 2", async () => {
  const lintPaper = () => Promise.resolve(err("paper lint could not run"));
  const dry = await run({ sub: "update" }, { lintPaper });
  const saved = await run({ sub: "update", save: true }, { lintPaper });
  expect([dry.code, dry.errs, saved.code, saved.errs]).toStrictEqual([
    0,
    ["lint could not finish: paper lint could not run"],
    2,
    ["lint could not finish: paper lint could not run"],
  ]);
});

test("a paper folder without a main source has no sections to read", () => {
  expect(
    submissionSections("/w/papers/p", {
      files: memoryFiles({}),
      latex: latexReader,
      codec: sourcesCodec,
    }),
  ).toBeNull();
});

test("--allow-lint-errors is refused outside a submission send, before any command runs", async () => {
  const cwd = useTempDir("paperlint-allow-lint-errors-");
  const message =
    "--allow-lint-errors is only for submission new or update with --save";
  const attempt = async (argv: readonly string[]) => {
    const errs: string[] = [];
    const code = await runCli(argv, {
      cwd,
      log: () => {},
      err: (line: string) => {
        errs.push(line);
      },
    });
    return { code, errs: errs.join("\n") };
  };
  const lint = await attempt(["lint", "--allow-lint-errors", "x"]);
  const bare = await attempt(["--allow-lint-errors", "x"]);
  const help = await attempt(["--help", "--allow-lint-errors", "x"]);
  const show = await attempt([
    "submission",
    "show",
    "papers/p",
    "--allow-lint-errors",
    "x",
  ]);
  expect(
    [lint, bare, help, show].map((r) => [r.code, r.errs.includes(message)]),
  ).toStrictEqual([
    [2, true],
    [2, false],
    [0, false],
    [2, false],
  ]);
  expect(show.errs).toContain(
    "--allow-lint-errors needs a nonempty reason and --save on submission new or update",
  );
});
