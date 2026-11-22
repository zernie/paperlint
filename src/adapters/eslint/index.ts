import type { ESLint } from "eslint";
import { relative } from "node:path";
import { flatMap, map, partition } from "remeda";
import { z } from "zod";
import { err, ok, type Result } from "../../domain/result.ts";
import {
  lintFindingLine,
  submissionLint,
  type LintFinding,
  type PaperSections,
} from "../../domain/submission-lint.ts";
import { messageOf } from "../../domain/text.ts";
import type { SubmissionLinter } from "../../ports/submission-lint.ts";

export {
  LINT_FORMAT,
  lintExitCode,
  lintResultFor,
  lintText,
  printLintResults,
} from "./report.io.ts";

const lintFailure = z
  .object({
    messageTemplate: z.string().optional(),
    message: z.string().optional(),
  })
  .catch({});

/** ESLint throws when the paths match no files or only ignored files. */
export function isEmptyLintSet(e: unknown): boolean {
  const { messageTemplate, message } = lintFailure.parse(e);
  return (
    messageTemplate === "file-not-found" ||
    messageTemplate === "all-matched-files-ignored" ||
    message?.toLowerCase().includes("no files matching") === true
  );
}

/** Translate ESLint's structured diagnostics at the adapter boundary. */
export function lintFindings(
  results: readonly ESLint.LintResult[],
  paperDir: string,
): Result<readonly LintFinding[], string> {
  const [fatal, findings] = partition(
    flatMap(results, ({ filePath, messages }) =>
      map(messages, (m) => ({
        ...m,
        file: relative(paperDir, filePath).replaceAll("\\", "/") || ".",
      })),
    ),
    (m) => m.fatal === true,
  );
  return fatal.length === 0
    ? ok(findings)
    : err(map(fatal, lintFindingLine).join("\n"));
}

export type OnLintResults = (results: readonly ESLint.LintResult[]) => void;
type RunPaperLint = (
  paperDir: string,
  cwd: string,
  onResults: OnLintResults,
) => Promise<string>;

export const submissionLinter =
  (
    runLint: RunPaperLint,
    sectionsOf: (paperDir: string) => PaperSections | null,
  ): SubmissionLinter =>
  (paperDir, cwd) =>
    new Promise((settle) => {
      const accept: OnLintResults = (results) => {
        const findings = lintFindings(results, paperDir);
        settle(
          findings.ok
            ? ok(submissionLint(findings.value, sectionsOf(paperDir)))
            : findings,
        );
      };
      void runLint(paperDir, cwd, accept).then(
        (problem) => {
          settle(err(problem || "paperlint lint did not produce a report"));
        },
        (e: unknown) => {
          settle(err(messageOf(e)));
        },
      );
    });
