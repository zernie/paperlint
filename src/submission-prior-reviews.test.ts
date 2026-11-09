/**
 * `submission new|update --save` refuses to send while a reviewer's point of the rejection before
 * this attempt is unanswered, or answered in a section the paper does not have (#420) — the same
 * judgement as `cycle/prior-reviews-answered`, so nothing goes out that the lint would call an
 * error. The dry run prints the same lines and goes on: it is how the author sees them.
 */
import { expect, test } from "vitest";
import { builtPaper } from "../test/recorded-fixture.ts";
import { AUTHORS, PAPER, files, run } from "../test/submission-fixtures.ts";

const POINTS = "reviews/old-response.yaml";

const cycle = (id: string, more: object = {}) => ({
  id,
  venue: { kind: "preset", extends: "../../venue.jsonc" },
  opened: "2026-10-01",
  ...more,
});
const rejected = (outcome: object) =>
  cycle("old-2026", {
    outcome: {
      kind: "rejected",
      date: "2026-09-08",
      evidence: "reviews/old.eml",
      ...outcome,
    },
  });
const REVIEWED = rejected({ desk: false, points: POINTS });
const SENT = cycle("venue-2026", { submission: { id: 7 } });

const TEX =
  "\\documentclass{article}\n\\title{A Made-Up Paper}\n\\begin{document}\n\\begin{abstract}An abstract.\\end{abstract}\n\\section{Introduction}\nText.\n\\section{Threats to Validity}\nText.\n\\end{document}\n";

const point = (answer: string) =>
  `  - id: A1\n    reviewer: A\n    quote: Two repositories only.\n${answer}`;
const ANSWERED = `points:\n${point("    answer:\n      kind: changed\n      where: Threats to Validity\n")}`;
const UNANSWERED = `points:\n${point("")}`;

/** The paper in the cycles form, built from `paper.tex`, and — unless null — the points file's text. */
const paper = (cycles: readonly object[], points: string | null) =>
  files({
    paper: { cycles, authors: AUTHORS },
    extra: {
      ...builtPaper(PAPER, { "paper.tex": TEX }, [
        { path: "paper.tex", role: "body" },
      ]),
      ...(points === null ? {} : { [`${PAPER}/${POINTS}`]: points }),
    },
  });

const HEADING =
  "reviewers' points of the rejection before this attempt (cycle/prior-reviews-answered):";
const UNANSWERED_LINE = `  ${POINTS}: point A1 (reviewer A) has no answer, and «venue-2026», the attempt after the rejection «old-2026», is open — answer it: { "kind": "changed" | "argued", "where": "<the \\section title>" } or { "kind": "declined", "reason": "…" }`;
const REFUSAL =
  "refused: a reviewer's point of the rejection before this attempt is unanswered, or answered in a section the paper does not have (above) — answer it in the points file, run the dry run again; nothing was sent";

test("🔴 update --save with a point unanswered: refused with exit 2, the point named, nothing sent", async () => {
  const r = await run(
    { sub: "update", save: true },
    { files: paper([REVIEWED, SENT], UNANSWERED) },
  );
  expect([r.code, r.errs, r.seen[0]?.calls]).toStrictEqual([2, [REFUSAL], []]);
  expect(r.out.slice(2, 4)).toStrictEqual([HEADING, UNANSWERED_LINE]);
});

test("🔴 new --save with the points file missing: refused the same way, before the portal is asked", async () => {
  const r = await run(
    { sub: "new", save: true },
    { files: paper([REVIEWED, cycle("venue-2026")], null) },
  );
  expect([r.code, r.errs, r.seen[0]?.calls]).toStrictEqual([2, [REFUSAL], []]);
  expect(r.out).toContain(
    `  cycle «old-2026» was rejected with reviews, and its points file \`${POINTS}\` is not in the paper folder — write it: one entry per reviewer point (id, reviewer, quote), each answered before «venue-2026» is sent`,
  );
});

test("🔴 no paper.tex: no sections, so a place an answer names is reported as missing", async () => {
  const fs = files({
    paper: { cycles: [REVIEWED, SENT] },
    extra: { [`${PAPER}/${POINTS}`]: ANSWERED },
  });
  const r = await run({ sub: "update", save: true }, { files: fs });
  expect([r.code, r.out[3]]).toStrictEqual([
    2,
    `  ${POINTS}: point A1 (reviewer A) is answered in «Threats to Validity», and paper.tex has no \\section titled so — correct the title in the answer, or the section`,
  ]);
});

test("the dry run prints the same lines and goes on: the author reads them before saving", async () => {
  const r = await run(
    { sub: "update" },
    { files: paper([REVIEWED, SENT], UNANSWERED) },
  );
  expect([r.code, r.errs, r.seen[0]?.calls.length]).toStrictEqual([0, [], 1]);
  expect(r.out.slice(2, 4)).toStrictEqual([HEADING, UNANSWERED_LINE]);
});

test.each<[string, readonly object[], string | null]>([
  [
    "every point answered in a section the paper has",
    [REVIEWED, SENT],
    ANSWERED,
  ],
  [
    "a desk rejection: no reviews to answer",
    [rejected({ desk: true }), SENT],
    null,
  ],
])("quiet, and the send goes ahead: %s", async (_, cycles, points) => {
  const r = await run(
    { sub: "update", save: true },
    { files: paper(cycles, points) },
  );
  expect([r.code, r.errs, r.out.includes(HEADING)]).toStrictEqual([
    0,
    [],
    false,
  ]);
});
