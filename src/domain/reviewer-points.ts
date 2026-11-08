/**
 * THE REVIEWERS' POINTS OF A REJECTED ATTEMPT, AND THEIR ANSWERS — the file a reviewed rejection
 * names (`"outcome": { "kind": "rejected", "desk": false, "points": "<file>" }`, `cycle.ts`), one
 * entry per point the reviews made, each answered as the next attempt answers it:
 *
 *   points:
 *     - id: A1
 *       reviewer: A
 *       quote: |
 *         The evaluation uses two repositories only.
 *       answer:
 *         kind: changed            # changed | argued | declined
 *         where: Threats to Validity   # changed, argued: the \section of paper.tex that answers it
 *     - id: B3
 *       reviewer: B
 *       quote: Why not compare against auto mode?
 *       answer:
 *         kind: declined
 *         reason: Auto mode did not exist when the runs were made.
 *
 * The shape is the journal response letter's (point, response, change, location; ACL Rolling
 * Review asks a resubmission for the same): kept in a file of its own rather than in
 * `paperlint.json`, because a review's quote spans lines and that file is strict JSON.
 *
 * ── WHAT IS DECIDED WHERE ───────────────────────────────────────────────────────────
 * The shape is refused when the file is read (`parseReviewerPoints`): an answer of no known kind, a
 * changed or argued answer without its place, a declined one without its reason, two points with
 * one id. Whether every point is answered, and whether each place is a section of the paper, is
 * judged once a later attempt is open (`judgeReviewerPoints`, through `cycle/prior-reviews-answered`
 * and `submission … --save`). Whether the section really answers the point is not decidable here.
 *
 * Parsed by hand: the domain imports no schema library (see `src/CLAUDE.md`).
 */
import { collapse } from "./tex-document.ts";
import { unknownKey } from "./deadline.ts";
import { isRecord } from "./record.ts";
import { err, ok, type Result } from "./result.ts";

/** How the next attempt answers a point: changed or argued in a section, or declined with a reason. */
export type Answer =
  | { readonly kind: "changed" | "argued"; readonly where: string }
  | { readonly kind: "declined"; readonly reason: string };

/** One point a review made, and its answer — null until it has one. */
export interface ReviewerPoint {
  readonly id: string;
  readonly reviewer: string;
  readonly quote: string;
  readonly answer: Answer | null;
}

/** What is wrong with the answers, once a later attempt is open. */
export type PointProblem =
  | {
      readonly kind: "unanswered";
      readonly id: string;
      readonly reviewer: string;
    }
  | {
      readonly kind: "nowhere";
      readonly id: string;
      readonly reviewer: string;
      readonly where: string;
    };

const ANSWER_KEYS = {
  changed: ["kind", "where"],
  argued: ["kind", "where"],
  declined: ["kind", "reason"],
} as const;

const nonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";

const isAnswerKind = (v: unknown): v is Answer["kind"] =>
  v === "changed" || v === "argued" || v === "declined";

/** An answer's own fields, once its kind is known. */
function answerFields(
  kind: Answer["kind"],
  v: Readonly<Record<string, unknown>>,
  at: string,
): Result<Answer, string> {
  if (kind === "declined")
    return nonEmpty(v["reason"])
      ? ok({ kind, reason: v["reason"] })
      : err(`${at}: a declined answer says why: "reason": one sentence`);
  return nonEmpty(v["where"])
    ? ok({ kind, where: v["where"] })
    : err(
        `${at}: a ${kind} answer says where: "where": the title of the \\section in paper.tex that answers it`,
      );
}

/** A point's `answer`: absent is null; anything else is one of the three shapes, or refused. */
function parseAnswer(v: unknown, at: string): Result<Answer | null, string> {
  if (v === undefined || v === null) return ok(null);
  const kind = isRecord(v) ? v["kind"] : undefined;
  if (!isRecord(v) || !isAnswerKind(kind))
    return err(
      `${at}: "answer.kind" is changed, argued or declined, got ${JSON.stringify(kind ?? v)}`,
    );
  const unknown = unknownKey(
    v,
    ANSWER_KEYS[kind],
    `${at}.answer`,
    `a ${kind} answer's`,
  );
  return unknown === null ? answerFields(kind, v, at) : err(unknown);
}

const POINT_KEYS = ["id", "reviewer", "quote", "answer"];

/** One entry of `points`, or why it is not one. */
function parsePoint(v: unknown, at: string): Result<ReviewerPoint, string> {
  if (!isRecord(v)) return err(`${at} is not a mapping`);
  const unknown = unknownKey(v, POINT_KEYS, at, "a point's");
  if (unknown !== null) return err(unknown);
  const { id, reviewer, quote } = v;
  if (!nonEmpty(id) || !nonEmpty(reviewer) || !nonEmpty(quote))
    return err(
      `${at} needs "id", "reviewer" and "quote", each non-empty text (the quote verbatim from the review)`,
    );
  const answer = parseAnswer(v["answer"], `${at} (${id})`);
  return answer.ok ? ok({ id, reviewer, quote, answer: answer.value }) : answer;
}

/** The first id that an earlier point already has, as the refusal that names both. */
function duplicateId(
  points: readonly ReviewerPoint[],
  file: string,
): string | null {
  const ids = points.map((p) => p.id);
  const dup = points.flatMap((p, at) => {
    const first = ids.indexOf(p.id);
    return first < at ? [{ id: p.id, at, first }] : [];
  })[0];
  return dup === undefined
    ? null
    : `${file}: points[${String(dup.at)}]: the id "${dup.id}" is points[${String(dup.first)}]'s too — each point is answered once, by its id`;
}

/** The points file's parsed YAML → its points, or the one line that says what is wrong. */
export function parseReviewerPoints(
  doc: unknown,
  file: string,
): Result<readonly ReviewerPoint[], string> {
  if (!isRecord(doc)) return err(`${file}: not a mapping with \`points\``);
  const unknown = unknownKey(doc, ["points"], file, "the file's");
  if (unknown !== null) return err(unknown);
  const list = doc["points"];
  if (!Array.isArray(list) || list.length === 0)
    return err(
      `${file}: \`points\` is not a non-empty list — a reviewed rejection has at least one point to answer`,
    );
  const read = list.reduce<Result<readonly ReviewerPoint[], string>>(
    (acc, p: unknown, i) => {
      if (!acc.ok) return acc;
      const r = parsePoint(p, `${file}: points[${String(i)}]`);
      return r.ok ? ok([...acc.value, r.value]) : r;
    },
    ok([]),
  );
  if (!read.ok) return read;
  const points = read.value;
  const dup = duplicateId(points, file);
  return dup === null ? ok(points) : err(dup);
}

/**
 * Every point that has no answer, and every changed or argued answer whose place is no `\section`
 * title of the paper (whitespace collapsed, as `tex/required-section` compares). Pure.
 */
export function judgeReviewerPoints(
  points: readonly ReviewerPoint[],
  sectionTitles: readonly string[],
): readonly PointProblem[] {
  const titles = new Set(sectionTitles.map(collapse));
  return points.flatMap((p): readonly PointProblem[] => {
    const { id, reviewer, answer } = p;
    if (answer === null) return [{ kind: "unanswered", id, reviewer }];
    if (answer.kind === "declined" || titles.has(collapse(answer.where)))
      return [];
    return [{ kind: "nowhere", id, reviewer, where: answer.where }];
  });
}
