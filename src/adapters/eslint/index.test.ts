import type { ESLint, Linter } from "eslint";
import { expect, test } from "vitest";
import { err, ok } from "../../domain/result.ts";
import {
  isEmptyLintSet,
  lintFindings,
  submissionLinter,
  type OnLintResults,
} from "./index.ts";

const paperDir = "/work/paper";
const result = (
  filePath: string,
  messages: readonly Linter.LintMessage[],
): ESLint.LintResult => ({
  filePath,
  messages: [...messages],
  suppressedMessages: [],
  errorCount: 0,
  fatalErrorCount: 0,
  warningCount: 0,
  fixableErrorCount: 0,
  fixableWarningCount: 0,
  usedDeprecatedRules: [],
});
const warning: Linter.LintMessage = {
  ruleId: "tex/example",
  severity: 1,
  message: "a warning",
  line: 3,
  column: 2,
};
const fatal: Linter.LintMessage = {
  ruleId: null,
  severity: 2,
  fatal: true,
  message: "Parsing error",
  line: 5,
  column: 1,
};

test("a finding's file is relative to the paper directory, with forward slashes, or a dot for the directory itself", () => {
  const found = lintFindings(
    [
      result(`${paperDir}/sections/intro.tex`, [warning]),
      result("/work/paper/sections\\win.tex", [warning]),
      result(paperDir, [warning]),
    ],
    paperDir,
  );
  expect(found).toStrictEqual(
    ok([
      { ...warning, file: "sections/intro.tex" },
      { ...warning, file: "sections/win.tex" },
      { ...warning, file: "." },
    ]),
  );
});

test("a fatal message makes the whole lint fail, one line per fatal message", () => {
  const found = lintFindings(
    [
      result(`${paperDir}/a.tex`, [warning, fatal]),
      result(`${paperDir}/b.tex`, [{ ...fatal, line: 9, message: "Broken" }]),
    ],
    paperDir,
  );
  expect(found).toStrictEqual(
    err("a.tex:5:1 — Parsing error\nb.tex:9:1 — Broken"),
  );
});

test("the linter reports the lint of what the run produced", async () => {
  const lint = submissionLinter(
    (_dir, _cwd, onResults: OnLintResults) => {
      onResults([result(`${paperDir}/a.tex`, [warning])]);
      return Promise.resolve("");
    },
    () => null,
  );
  expect(await lint(paperDir, "/work")).toStrictEqual(
    ok({
      errors: [],
      warnings: [{ ...warning, file: "a.tex" }],
      abstractWarnings: [],
      introductionWarnings: [],
    }),
  );
});

test("the linter passes the paper and the working directory to the run", async () => {
  const seen: (readonly [string, string])[] = [];
  const lint = submissionLinter(
    (dir, cwd, onResults) => {
      seen.push([dir, cwd]);
      onResults([]);
      return Promise.resolve("");
    },
    () => null,
  );
  await lint(paperDir, "/elsewhere");
  expect(seen).toStrictEqual([[paperDir, "/elsewhere"]]);
});

test("a fatal message in the run's results is the linter's failure", async () => {
  const lint = submissionLinter(
    (_dir, _cwd, onResults) => {
      onResults([result(`${paperDir}/a.tex`, [fatal])]);
      return Promise.resolve("");
    },
    () => null,
  );
  expect(await lint(paperDir, "/work")).toStrictEqual(
    err("a.tex:5:1 — Parsing error"),
  );
});

test("a run that ends with a problem and no report is the linter's failure with that problem", async () => {
  const lint = submissionLinter(
    () => Promise.resolve("no config found"),
    () => null,
  );
  expect(await lint(paperDir, "/work")).toStrictEqual(err("no config found"));
});

test("a run that ends silently without a report fails, and says so", async () => {
  const lint = submissionLinter(
    () => Promise.resolve(""),
    () => null,
  );
  expect(await lint(paperDir, "/work")).toStrictEqual(
    err("paperlint lint did not produce a report"),
  );
});

test("a run that throws is the linter's failure with the error's message", async () => {
  const lint = submissionLinter(
    () => Promise.reject(new Error("boom")),
    () => null,
  );
  expect(await lint(paperDir, "/work")).toStrictEqual(err("boom"));
});

test("an empty lint set is recognised by ESLint's message template or its wording, and nothing else is", () => {
  expect([
    isEmptyLintSet({ messageTemplate: "file-not-found" }),
    isEmptyLintSet({ messageTemplate: "all-matched-files-ignored" }),
    isEmptyLintSet(new Error("No files matching 'x' were found.")),
    isEmptyLintSet(new Error("disk on fire")),
    isEmptyLintSet("not an error object"),
  ]).toStrictEqual([true, true, true, false, false]);
});
