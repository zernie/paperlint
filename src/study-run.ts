/** What a `paperlint studies` command on one study comes to: the lines it prints, or its refusal. */

/** A refusal: the exit code, and the line that explains it. */
export interface StudyRefusal {
  readonly code: 1 | 2;
  readonly line: string;
}

/** What a run came to: the lines it printed, or the refusal. */
export type StudyRun =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly refusal: StudyRefusal };

/** A refusal for the paper's state: exit 1. */
export const refusal = (line: string): StudyRefusal => ({ code: 1, line });

/** The run that is `r`. */
export const refused = (r: StudyRefusal): StudyRun => ({
  ok: false,
  refusal: r,
});
