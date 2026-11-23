/**
 * The block `lint-edited` prints for one tool call (`src/lint-edited-hook.ts`), from each paper's
 * outcome. One Bash command can name files in two papers, and each is linted on its own: a paper
 * that throws must not drop another's report, because that paper's snapshot is already written and
 * its errors would never be shown again. A paper that failed is named in the block; when no paper
 * has a report, the first failure is thrown, for the hook's one line on stderr.
 */
import { zip } from "remeda";
import { messageOf } from "./domain/text.ts";

/** What Claude Code reads from a PostToolUse hook's stdout: the reason goes next to the tool result. */
export interface BlockOutput {
  readonly decision: "block";
  readonly reason: string;
}

/** The line after the findings: what happened to the edit, and what the findings are. */
const KEPT =
  "paperlint lint-edited: the edit was kept; the errors above are the ones it introduced.";

const whyOf = (r: Readonly<PromiseRejectedResult>): unknown => r.reason;

/** Each paper's formatted report ("" for none) or its failure, in the order of `dirs`. */
export function blockOf(
  outcomes: readonly PromiseSettledResult<string>[],
  dirs: readonly string[],
): BlockOutput | null {
  const reports = outcomes.flatMap((r) =>
    r.status === "fulfilled" && r.value !== "" ? [r.value] : [],
  );
  const failed = zip(outcomes, dirs).flatMap(([r, dir]) =>
    r.status === "rejected" ? [{ dir, why: whyOf(r) }] : [],
  );
  if (reports.length === 0 && failed[0] !== undefined) throw failed[0].why;
  if (reports.length === 0) return null;
  const notLinted = failed.map(({ dir, why }) => {
    const [first] = messageOf(why).split("\n");
    return `paperlint lint-edited: ${dir} was not linted: ${String(first)}`;
  });
  return {
    decision: "block",
    reason: `${[...reports, ...notLinted].join("\n")}\n${KEPT}`,
  };
}
