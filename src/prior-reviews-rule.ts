/**
 * `cycle/prior-reviews-answered` (error) — on `paper.tex`: when the current attempt is open and the
 * attempt before it was rejected WITH reviews (`"desk": false`), every point in that rejection's
 * points file (`outcome.points`, `src/domain/reviewer-points.ts`) has an answer, and every changed
 * or argued answer names a `\section` this paper has. A reviewer at the next venue who read the old
 * reviews, or the same reviewer on a shared committee, sees an unanswered point as ignored feedback.
 *
 * ── WHAT DECIDES WHAT ───────────────────────────────────────────────────────────────
 *   a rejection that does not say `desk`, or a reviewed one with no `points`  → refused when
 *                                    `paperlint.json` is parsed (`cycle.ts`): every command, not this rule
 *   a points file missing, not YAML, or of the wrong shape → this rule, one error that says which
 *   a point unanswered, or answered in a place that is no section → this rule, one error per point
 *   the same, at `submission new|update --save` → refused there, nothing sent (`src/submission.ts`)
 *   whether that section really answers the point → no machine: `pc-panel-review`'s prior-reviews seat
 *
 * Only the attempt just before the open one is read: an earlier rejection's points were the earlier
 * attempt's to answer. A desk rejection, an open attempt after an acceptance or a withdrawal, no
 * attempt after the rejection yet, and the flat form (no `cycles`) have nothing to answer: silent.
 * Sections are the assembled paper's (`readPaper`: the includes the build recorded, spliced), as
 * `tex/required-section` reads them: `\section` and `\section*`, whitespace collapsed.
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import { readCycles } from "./cycle-rules.ts";
import type { Cycle, Cycles } from "./domain/cycle.ts";
import {
  judgeReviewerPoints,
  parseReviewerPoints,
  type PointProblem,
  type ReviewerPoint,
} from "./domain/reviewer-points.ts";
import type { ParseYaml } from "./ports/yaml.ts";
import { decoded, findingText, readPaper, reportInPaper } from "./tex-paper.ts";
import type {
  Located,
  TexRuleModule,
  TexVenueRuleDeps,
} from "./tex-venue-rules.ts";

export interface PriorReviewsDeps extends TexVenueRuleDeps {
  readonly yaml: ParseYaml;
}

/** The rejection whose points the open attempt must answer: its cycle, the file, and the open one. */
export interface PriorReviews {
  readonly rejected: Cycle;
  readonly file: string;
  readonly open: Cycle;
}

/** What reading the points file gave. */
export type PointsRead =
  | { readonly kind: "missing" }
  | { readonly kind: "broken"; readonly why: string }
  | { readonly kind: "read"; readonly points: readonly ReviewerPoint[] };

/** The reviewed rejection just before the open attempt, or null when there is none. Pure. */
export function priorReviewsOf(cycles: Cycles): PriorReviews | null {
  if (cycles.current.kind !== "cycle") return null;
  const open = cycles.current.cycle;
  const before = cycles.list[cycles.list.indexOf(open) - 1];
  const o = before?.outcome;
  if (before === undefined || o?.kind !== "rejected" || o.desk) return null;
  return { rejected: before, file: o.points, open };
}

/** One point's problem as a finding; `context` names the file and the two attempts. */
const problemFinding = (
  context: Readonly<Record<string, string>>,
  p: PointProblem,
): Located => ({ messageId: p.kind, data: { ...context, ...p }, at: null });

/** The findings for one prior rejection, given what its points file read as and the paper's sections. Pure. */
export function judgePriorReviews(
  prior: PriorReviews,
  read: PointsRead,
  sectionTitles: readonly string[],
): readonly Located[] {
  const ids = { id: prior.rejected.id, open: prior.open.id, file: prior.file };
  switch (read.kind) {
    case "missing":
      return [{ messageId: "missing", data: ids, at: null }];
    case "broken":
      return [{ messageId: "broken", data: { why: read.why }, at: null }];
    case "read": {
      const context = {
        file: prior.file,
        open: prior.open.id,
        rejected: prior.rejected.id,
      };
      return judgeReviewerPoints(read.points, sectionTitles).map((p) =>
        problemFinding(context, p),
      );
    }
  }
}

/** The points file of `prior`, read and parsed: missing, broken (why), or its points. */
function readPoints(
  dir: string,
  prior: PriorReviews,
  deps: PriorReviewsDeps,
): PointsRead {
  const text = decoded(deps.files.readBytes(callerPath(join(dir, prior.file))));
  if (text === null) return { kind: "missing" };
  const doc = deps.yaml(text);
  if (!doc.ok)
    return {
      kind: "broken",
      why: `${prior.file} does not parse as YAML: ${doc.error}`,
    };
  const points = parseReviewerPoints(doc.value, prior.file);
  return points.ok
    ? { kind: "read", points: points.value }
    : { kind: "broken", why: points.error };
}

const META: TexRuleModule["meta"] = {
  type: "problem",
  docs: {
    description:
      "the reviewers' points of the rejection before the open attempt are all answered, each changed or argued answer in a \\section this paper has",
    url: "https://github.com/zernie/paperlint/blob/main/docs/rules/cycle/prior-reviews-answered.md",
  },
  schema: [],
  messages: {
    missing:
      "cycle «{{id}}» was rejected with reviews, and its points file `{{file}}` is not in the paper folder — write it: one entry per reviewer point (id, reviewer, quote), each answered before «{{open}}» is sent",
    broken: "{{why}}",
    unanswered:
      '{{file}}: point {{id}} (reviewer {{reviewer}}) has no answer, and «{{open}}», the attempt after the rejection «{{rejected}}», is open — answer it: { "kind": "changed" | "argued", "where": "<the \\section title>" } or { "kind": "declined", "reason": "…" }',
    nowhere:
      "{{file}}: point {{id}} (reviewer {{reviewer}}) is answered in «{{where}}», and paper.tex has no \\section titled so — correct the title in the answer, or the section",
  },
};

/** The findings for one `paper.tex` and its text: none unless an open attempt follows a reviewed rejection. */
function findingsFor(
  filename: string,
  text: string,
  deps: PriorReviewsDeps,
): {
  readonly paper: ReturnType<typeof readPaper>;
  readonly found: readonly Located[];
} | null {
  const dir = dirname(filename);
  const cycles = readCycles(dir, deps);
  if (!cycles.ok || cycles.value === null) return null;
  const prior = priorReviewsOf(cycles.value);
  if (prior === null) return null;
  const paper = readPaper(filename, text, deps);
  const titles = deps.latex.outline(paper.text).sections.map((h) => h.title);
  const found = judgePriorReviews(prior, readPoints(dir, prior, deps), titles);
  return { paper, found };
}

/**
 * The same findings as lines, for a command that is not ESLint: `submission new|update --save`
 * refuses to send while there is one (`src/submission.ts`). One judgement, two callers.
 */
export function priorReviewsLines(
  filename: string,
  text: string,
  deps: PriorReviewsDeps,
): readonly string[] {
  const r = findingsFor(filename, text, deps);
  return (r?.found ?? []).map((f) => findingText(META.messages, f));
}

/** The `cycle` plugin's rule over the reviewers' points, for every `paper.tex`. */
export function priorReviewsRules(
  deps: PriorReviewsDeps,
): Readonly<Record<"prior-reviews-answered", TexRuleModule>> {
  return {
    "prior-reviews-answered": {
      meta: META,
      create(context) {
        if (basename(context.filename) !== "paper.tex") return {};
        return {
          root() {
            const sc = context.sourceCode;
            const r = findingsFor(context.filename, sc.raw ?? sc.text, deps);
            if (r !== null)
              reportInPaper(context, META.messages, r.paper, r.found);
          },
        };
      },
    },
  };
}

export const PRIOR_REVIEWS_RULE_LEVELS: Readonly<
  Record<"cycle/prior-reviews-answered", "error">
> = { "cycle/prior-reviews-answered": "error" };
