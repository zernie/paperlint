/**
 * `paperlint authors <paper>` — run the author-list check that ships in this package and, when it
 * passes, RECORD that it ran: `authorsVerified: <YYYY-MM-DD>` in the paper's `PIPELINE-STATUS.md`
 * frontmatter, the field `paper/author-list` reads.
 *
 * Until 3.0.0 the proof of a run was the word "bib-authors" somewhere in the scorecard's table,
 * and the lint message told the user to run a command the project had to configure
 * (`authorListCommand`). The check is this package's own script, so the command is too, and the
 * record is a field.
 *
 * The check exits 0 (every entry's authors match the version it cites), 1 (a mismatch) or 2 (some
 * entries could not be checked — DBLP did not answer). Only 0 is recorded: an audit that did not
 * reach every entry is not a pass, and writing its date would say it was.
 *
 * This file is the pure half: the decision and the frontmatter edit. `cli.ts` runs the script and
 * touches the disk.
 */
import { err, ok, type Result } from "./domain/result.ts";

export const RECORD_FIELD = "authorsVerified";

/**
 * `text` (a PIPELINE-STATUS.md) with `authorsVerified: <date>` set in its frontmatter: an existing
 * top-level line is replaced, otherwise the line is added before the closing `---`. The rest of
 * the file — comments, order, formatting — is left as it was: a YAML round-trip would rewrite all
 * of it. Only a top-level key starts in the first column, so a nested `authorsVerified` is never
 * the one replaced; `paper/author-list` then reads the field as any other.
 */
export function withAuthorsVerified(
  text: string,
  date: string,
): Result<string, string> {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!fm || fm[1] === undefined)
    return err(
      "it has no YAML frontmatter (`---` … `---`) to record the run in",
    );
  const body = fm[1];
  const line = `${RECORD_FIELD}: ${date}`;
  const lines = body.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`${RECORD_FIELD}:`));
  if (at >= 0) lines[at] = line;
  else lines.push(line);
  const start = text.indexOf("\n") + 1;
  const next =
    text.slice(0, start) + lines.join("\n") + text.slice(start + body.length);
  return ok(next);
}

/** What the check's exit code means for the record. */
export type AuthorsOutcome = "passed" | "mismatch" | "incomplete";

export const outcomeOf = (code: number | null): AuthorsOutcome =>
  code === 0 ? "passed" : code === 1 ? "mismatch" : "incomplete";
