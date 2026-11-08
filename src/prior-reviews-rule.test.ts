/**
 * `cycle/prior-reviews-answered` over a paper held in memory: a reviewed rejection's points must all
 * be answered, in sections the new `paper.tex` has, once the next attempt is open. Both halves for
 * every finding, and silence wherever there is nothing to answer.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { parseYaml } from "./adapters/yaml/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { presetsDir } from "./package-dirs.ts";
import {
  PRIOR_REVIEWS_RULE_LEVELS,
  priorReviewsRules,
} from "./prior-reviews-rule.ts";

const PAPER = "/work/papers/p";
const POINTS = "reviews/alpha-response.yaml";

const TEX = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}",
  "Text.",
  "\\section{Threats to Validity}",
  "Text.",
  "\\end{document}",
  "",
].join("\n");

const rejected = (outcome: object) => ({
  id: "alpha-2026",
  venue: { kind: "named", name: "Alpha", url: "https://alpha.example" },
  opened: "2026-06-01",
  deadlines: [],
  outcome: {
    kind: "rejected",
    date: "2026-09-08",
    evidence: "reviews/alpha.eml",
    ...outcome,
  },
});
const OPEN = {
  id: "beta-2027",
  venue: { kind: "named", name: "Beta", url: "https://beta.example" },
  opened: "2026-09-09",
  deadlines: [],
};
const REVIEWED = rejected({ desk: false, points: POINTS });

const YAML_ANSWERED = [
  "points:",
  "  - id: A1",
  "    reviewer: A",
  "    quote: |",
  "      The evaluation uses two repositories only.",
  "    answer:",
  "      kind: changed",
  "      where: Threats to Validity",
  "  - id: B1",
  "    reviewer: B",
  "    quote: Why not auto mode?",
  "    answer:",
  "      kind: declined",
  "      reason: It did not exist when the runs were made.",
  "",
].join("\n");

/** The rule over `paper.tex`, with `cycles` as the paper's record and `points` as the file's text. */
function lint(cycles: readonly object[] | undefined, points?: string) {
  const files = memoryFiles({
    [`${PAPER}/paperlint.json`]: JSON.stringify(
      cycles === undefined ? {} : { cycles },
    ),
    ...(points === undefined ? {} : { [`${PAPER}/${POINTS}`]: points }),
  });
  const rule = priorReviewsRules({
    files,
    venuesDir: presetsDir(),
    latex: latexReader,
    codec: sourcesCodec,
    yaml: parseYaml,
  })["prior-reviews-answered"];
  const out: string[] = [];
  const visitor = rule.create({
    filename: `${PAPER}/paper.tex`,
    sourceCode: {
      text: TEX, // no `raw`: the rule falls back to `text`; rule-cases runs ESLint, which gives one
      getLocFromIndex: () => ({ line: 1, column: 1 }),
    },
    report: (d) => {
      if (!("messageId" in d)) return void out.push(d.message);
      out.push(
        Object.entries(d.data ?? {}).reduce(
          (m, [k, v]) => m.replaceAll(`{{${k}}}`, String(v)),
          rule.meta.messages[d.messageId] ?? d.messageId,
        ),
      );
    },
  });
  visitor.root?.();
  return out;
}

describe("cycle/prior-reviews-answered — every point answered, in a section that exists", () => {
  it("🔴 a point without an answer, the next attempt open: an error naming the point", () => {
    expect(
      lint(
        [REVIEWED, OPEN],
        YAML_ANSWERED.replace(
          "    answer:\n      kind: changed\n      where: Threats to Validity\n",
          "",
        ),
      ),
    ).toEqual([
      `${POINTS}: point A1 (reviewer A) has no answer, and «beta-2027», the attempt after the rejection «alpha-2026», is open — answer it: { "kind": "changed" | "argued", "where": "<the \\section title>" } or { "kind": "declined", "reason": "…" }`,
    ]);
  });

  it("🔴 an answer whose place is no \\section of paper.tex: an error naming the place", () => {
    expect(
      lint(
        [REVIEWED, OPEN],
        YAML_ANSWERED.replace("Threats to Validity", "Limitations"),
      ),
    ).toEqual([
      `${POINTS}: point A1 (reviewer A) is answered in «Limitations», and paper.tex has no \\section titled so — correct the title in the answer, or the section`,
    ]);
  });

  it.each([
    [
      "missing",
      undefined,
      `cycle «alpha-2026» was rejected with reviews, and its points file \`${POINTS}\` is not in the paper folder — write it: one entry per reviewer point (id, reviewer, quote), each answered before «beta-2027» is sent`,
    ],
    ["not YAML", "points: [unclosed", `${POINTS} does not parse as YAML:`],
    [
      "of the wrong shape",
      "points: []\n",
      `${POINTS}: \`points\` is not a non-empty list — a reviewed rejection has at least one point to answer`,
    ],
  ])("🔴 a points file that is %s: an error that says so", (_, text, says) => {
    const [only, ...more] = lint([REVIEWED, OPEN], text);
    expect([only?.startsWith(says), more]).toEqual([true, []]);
  });
});

describe("cycle/prior-reviews-answered — quiet where there is nothing to answer", () => {
  it("every point answered, every place a section: quiet", () => {
    expect(lint([REVIEWED, OPEN], YAML_ANSWERED)).toEqual([]);
  });

  it.each<[string, readonly object[] | undefined]>([
    [
      "a desk rejection: no reviews to answer",
      [rejected({ desk: true }), OPEN],
    ],
    ["no attempt after the rejection yet", [REVIEWED]],
    ["no cycles at all (the flat form)", undefined],
    [
      "an open attempt that follows an acceptance",
      [
        {
          ...REVIEWED,
          outcome: { kind: "accepted", date: "2026-09-08", evidence: "m.eml" },
        },
        OPEN,
      ],
    ],
  ])("quiet: %s", (_, cycles) => {
    expect(lint(cycles)).toEqual([]);
  });

  it("is an error in paperlint's own config", () => {
    expect(PRIOR_REVIEWS_RULE_LEVELS).toEqual({
      "cycle/prior-reviews-answered": "error",
    });
  });

  it("judges paper.tex only: another file gets nothing", () => {
    const rule = priorReviewsRules({
      files: memoryFiles({}),
      venuesDir: presetsDir(),
      latex: latexReader,
      codec: sourcesCodec,
      yaml: parseYaml,
    })["prior-reviews-answered"];
    expect(
      rule.create({
        filename: `${PAPER}/notes.tex`,
        sourceCode: {
          text: "",
          getLocFromIndex: () => ({ line: 1, column: 1 }),
        },
        report: () => undefined,
      }),
    ).toEqual({});
  });
});
