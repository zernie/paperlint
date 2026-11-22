import type { Result } from "../domain/result.ts";
import type { SubmissionLint } from "../domain/submission-lint.ts";

/** A completed paper lint, or the reason it could not make a decision. */
export type SubmissionLintResult = Result<SubmissionLint, string>;

export type SubmissionLinter = (
  paperDir: string,
  cwd: string,
) => Promise<SubmissionLintResult>;
