/**
 * A valid `revision-plan.json`, shaped like the first real one (a workshop paper's first cycle): one
 * row of each state and each origin. The tests of the parser, the rule and the rule cases plant one
 * defect in it at a time.
 */
export const PLAN = {
  cycle: "langcode-2027",
  written: "2026-11-25",
  bar: { kind: "none", why: "a first edition: no accepted papers to read yet" },
  measurement: { kind: "open" },
  remaining: [
    {
      id: "R1",
      what: "a Limitations section after the conclusion",
      from: { kind: "venue" },
      added: "2026-11-25",
      state: "by-rule",
      rule: "tex/required-section",
    },
    {
      id: "R2",
      what: "say what the benchmark does not measure",
      from: {
        kind: "finding",
        file: "reviews/2026-11-20-panel.md",
        finding: 3,
      },
      added: "2026-11-25",
      state: "todo",
    },
    {
      id: "R3",
      what: "answer the prior reviewers' point on sample size",
      from: { kind: "prior-reviews", cycle: "agent-2027" },
      added: "2026-11-25",
      state: "done",
      evidence: "Section 5 reports the confidence intervals",
    },
    {
      id: "R4",
      what: "a second model family",
      from: { kind: "author" },
      added: "2026-11-26",
      state: "dropped",
      reason: "out of budget before the deadline; the threats section says so",
      kind: "accepted-cap",
    },
  ],
} as const;

/** A plan as its file holds it: indented, one field per line, so a finding's line names its field. */
export const planText = (plan: unknown = PLAN): string =>
  `${JSON.stringify(plan, null, 2)}\n`;

/** The line of `text` holding the `nth` occurrence of `needle`, counted from 1; 0 when there is none. */
export const lineOf = (text: string, needle: string, nth = 1): number =>
  text
    .split("\n")
    .flatMap((l, i) => (l.includes(needle) ? [i + 1] : []))
    .at(nth - 1) ?? 0;
