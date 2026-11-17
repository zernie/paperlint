/**
 * EXPERIMENTAL, opt-in — two rules of the `cycle` plugin on `paper.tex` over the changelist
 * (src/changelist.ts): the open (or accepted) attempt's `versions/<cycle>/approved.tex` against the
 * draft, and `versions/<cycle>/changes.yaml`.
 *
 *   cycle/changes-since-approved           a number or `\cite` key the approved text had and the draft
 *                                          lacks that no entry's `drops` names; a changes.yaml that does
 *                                          not read or breaks its shape (a `cut` without `reader_loses`)
 *   cycle/changes-since-approved-coverage  a paragraph of the approved text that is not in the draft
 *                                          verbatim and that no entry's `before` covers
 *
 * Silent without cycles, without an approved copy, and when nothing of the approved text is gone. Two
 * rules because the first is an error and the second a warning, and a rule has one level.
 * TODO(changes-one-rule): one rule with two levels, once the engine allows a per-message level.
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  factsOf,
  parseChanges,
  removedFrom,
  uncovered,
  undeclared,
  type Change,
} from "./changelist.ts";
import { venueCycleOf } from "./domain/cycle.ts";
import { err, ok, type Result } from "./domain/result.ts";
import type { ParseYaml } from "./ports/yaml.ts";
import { decoded, readPaper, reportInPaper } from "./tex-paper.ts";
import type {
  Located,
  TexRuleModule,
  TexVenueRuleDeps,
} from "./tex-venue-rules.ts";
import { cyclesIn, versionsDir } from "./versions.ts";
import { rulePageUrl } from "./venue-rules.ts";

export interface ChangesDeps extends TexVenueRuleDeps {
  readonly yaml: ParseYaml;
}

const MESSAGES = {
  dropped:
    "«{{token}}» is in versions/{{cycle}}/approved.tex and not in paper.tex, and no entry of versions/{{cycle}}/changes.yaml lists it under `drops` — say why it went: add it to the entry that removed it",
  schema: "{{why}}",
  uncovered:
    "a paragraph of versions/{{cycle}}/approved.tex is not in paper.tex and no entry of changes.yaml has a `before` inside it or holding it: «{{head}}…»",
};

const meta = (url: string, what: string, type: "problem" | "suggestion") =>
  ({
    type,
    docs: { description: what, url: rulePageUrl(url) },
    schema: [],
    messages: MESSAGES,
  }) satisfies TexRuleModule["meta"];

interface Judged {
  readonly cycle: string;
  readonly paper: ReturnType<typeof readPaper>;
  readonly schema: readonly string[];
  readonly dropped: readonly string[];
  readonly gone: readonly string[];
}

const NOTHING: readonly string[] = [];

/** The entries of `changes.yaml` (none when there is no file), or what is wrong with it. */
function changesIn(
  folder: string,
  deps: ChangesDeps,
): Result<readonly Change[], readonly string[]> {
  const listed = decoded(
    deps.files.readBytes(callerPath(join(folder, "changes.yaml"))),
  );
  if (listed === null) return ok([]);
  const doc = deps.yaml(listed);
  return doc.ok
    ? parseChanges(doc.value ?? [])
    : err([`changes.yaml does not parse as YAML: ${doc.error}`]);
}

/** The comparison for one `paper.tex`, or null where there is nothing to compare with. */
function judged(
  filename: string,
  text: string,
  deps: ChangesDeps,
): Judged | null {
  const dir = dirname(filename);
  const cycles = cyclesIn(dir, deps.files);
  const c = cycles === null ? null : venueCycleOf(cycles.current);
  const folder = c === null ? "" : join(versionsDir(dir), c.id);
  const approved = decoded(
    deps.files.readBytes(callerPath(join(folder, "approved.tex"))),
  );
  if (c === null || approved === null) return null;
  const read = changesIn(folder, deps);
  const changes = read.ok ? read.value : [];
  const paper = readPaper(filename, text, deps);
  const removed = removedFrom(
    factsOf(approved, deps.latex.bodyProse(approved)),
    factsOf(paper.text, deps.latex.bodyProse(paper.text)),
  );
  return {
    cycle: c.id,
    paper,
    schema: read.ok ? NOTHING : read.error,
    dropped: undeclared(removed, changes),
    gone: uncovered(removed, changes).map((p) =>
      p.seen.split(" ").slice(0, 8).join(" "),
    ),
  };
}

const located = (
  j: Judged,
  which: "errors" | "coverage",
): readonly Located[] =>
  which === "errors"
    ? [
        ...j.schema.map((why) => ({
          messageId: "schema",
          data: { why },
          at: null,
        })),
        ...j.dropped.map((token) => ({
          messageId: "dropped",
          data: { token, cycle: j.cycle },
          at: null,
        })),
      ]
    : j.gone.map((head) => ({
        messageId: "uncovered",
        data: { head, cycle: j.cycle },
        at: null,
      }));

const changesRule = (
  m: TexRuleModule["meta"],
  which: "errors" | "coverage",
  deps: ChangesDeps,
): TexRuleModule => ({
  meta: m,
  create(context) {
    if (basename(context.filename) !== "paper.tex") return {};
    return {
      root() {
        const sc = context.sourceCode;
        const j = judged(context.filename, sc.raw ?? sc.text, deps);
        if (j !== null)
          reportInPaper(context, MESSAGES, j.paper, located(j, which));
      },
    };
  },
});

/** The two rules, for the `cycle` plugin. Off until a paper turns them on. */
export const changesRules = (
  deps: ChangesDeps,
): Readonly<
  Record<
    "changes-since-approved" | "changes-since-approved-coverage",
    TexRuleModule
  >
> => ({
  "changes-since-approved": changesRule(
    meta(
      "cycle/changes-since-approved",
      "EXPERIMENTAL: every number and citation the approved text had and the draft lacks is declared in changes.yaml, which has its shape",
      "problem",
    ),
    "errors",
    deps,
  ),
  "changes-since-approved-coverage": changesRule(
    meta(
      "cycle/changes-since-approved-coverage",
      "EXPERIMENTAL: every paragraph of the approved text that is gone from the draft is covered by an entry of changes.yaml",
      "suggestion",
    ),
    "coverage",
    deps,
  ),
});
