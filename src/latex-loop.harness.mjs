/**
 * `latex-loop.ts` — three tables, in the order the mutation battery relies on:
 *   1. `nextStep` over a `State`: one row per question, plus the cap;
 *   2. `summarize` over histories: one row per field;
 *   3. the two composed, over the histories the loop really sees — the behaviour the build has.
 * A mutation of `nextStep` dies in table 1, one of `summarize` in table 2, before table 3 runs.
 *
 * The decision is pure, so none of this needs TeX. The real-pdflatex half lives in
 * `test/e2e/build.mjs`.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { nextStep, summarize, changedFiles, MAX_PASSES } = await import(
  join(HERE, "latex-loop.ts")
);

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

// ── builders ────────────────────────────────────────────────────────────────────────────
const H = (aux, toc = null, out = null, bbl = null) => ({ aux, toc, out, bbl });
const NO_BIB = { kind: "none" };
const bib = (citations, bibHash = "b1") => ({
  kind: "needed",
  citations,
  databases: ["refs"],
  style: "plain",
  bibHash,
});
const latex = (o = {}) => ({
  step: "latex",
  final: false,
  exitCode: 0,
  before: H("a1"),
  after: H("a1"),
  markers: [],
  bib: NO_BIB,
  errorLines: [],
  ...o,
});
const bibtex = (o = {}) => ({
  step: "bibtex",
  exitCode: 0,
  before: H("a1"),
  after: H("a1", null, null, "bbl1"),
  bib: bib(["k"]),
  errorLines: [],
  ...o,
});
const kind = (s) =>
  s.kind === "latex" ? `latex${s.final ? "-final" : ""}` : s.kind;

// ── 1. nextStep over a State ─────────────────────────────────────────────────────────────
const S = (o = {}) => ({
  failed: null,
  bibOutdated: false,
  unsettled: [],
  latexPasses: 1,
  finalDone: false,
  warnings: [],
  ...o,
});
const exitFail = {
  step: "bibtex",
  cause: { kind: "exit", code: 2 },
  lines: ["I couldn't open database file nope.bib"],
};
const STATES = [
  [
    "Q1 the last program failed — fail, whatever else holds",
    S({
      failed: exitFail,
      bibOutdated: true,
      unsettled: ["paper.aux"],
      finalDone: true,
    }),
    "fail",
  ],
  ["the final pass ran clean — done", S({ finalDone: true }), "done"],
  [
    "Q2 the bibliography input moved since bibtex ran — bibtex, before any rerun",
    S({ bibOutdated: true, unsettled: ["paper.aux"] }),
    "bibtex",
  ],
  [
    "Q3 a tracked file moved or the log asked — another plain pass",
    S({ unsettled: ["paper.aux"] }),
    "latex",
  ],
  [
    `Q3 cap: ${MAX_PASSES} passes and still unsettled — fail`,
    S({ unsettled: ["paper.aux"], latexPasses: MAX_PASSES }),
    "fail",
  ],
  [
    "Q4 nothing unsettled — the FINAL pass (even at the cap)",
    S({ latexPasses: MAX_PASSES }),
    "latex-final",
  ],
];
for (const [label, state, expected] of STATES) {
  const got = kind(nextStep(state));
  check(`${label} (expected ${expected}, got ${got})`, got === expected);
}
const q1 = nextStep(S({ failed: exitFail }));
check(
  "Q1 passes the failure through: the step, the cause and the lines verbatim",
  q1.step === "bibtex" && q1.cause.code === 2 && q1.lines === exitFail.lines,
);
const q3cap = nextStep(
  S({ unsettled: ["paper.aux", "labels-changed"], latexPasses: MAX_PASSES }),
);
check(
  "the cap's failure is no-convergence and NAMES what stayed unsettled",
  q3cap.cause.kind === "no-convergence" &&
    q3cap.lines[0].includes("paper.aux, labels-changed"),
);
check(
  "done carries the state's warnings",
  nextStep(S({ finalDone: true, warnings: ["undefined-citations"] }))
    .warnings[0] === "undefined-citations",
);

// ── 2. summarize over histories ─────────────────────────────────────────────────────────
const sum = summarize;
check(
  "summarize: nothing ran — paper.aux is unsettled (no pass has written it), nothing else holds",
  JSON.stringify(sum([])) ===
    JSON.stringify({
      failed: null,
      bibOutdated: false,
      unsettled: ["paper.aux"],
      latexPasses: 0,
      finalDone: false,
      warnings: [],
    }),
);
check(
  "summarize: a non-zero exit is `failed`, naming the step, the code and the log excerpt",
  (() => {
    const f = sum([latex({ exitCode: 1, errorLines: ["l.4 \\foo"] })]).failed;
    return (
      f?.step === "latex" && f.cause.code === 1 && f.lines[0] === "l.4 \\foo"
    );
  })(),
);
check(
  "summarize: a FINAL pass that exited non-zero is failed, not finalDone-and-clean",
  sum([latex({ final: true, exitCode: 1 })]).failed !== null,
);
check(
  "summarize: bibOutdated when the aux names a bibliography bibtex has not run on",
  sum([latex({ bib: bib(["k"]) })]).bibOutdated === true,
);
check(
  "summarize: bibOutdated is false once bibtex ran on exactly that input",
  sum([latex({ bib: bib(["k"]) }), bibtex()]).bibOutdated === false,
);
check(
  "summarize: the .bib content changed since bibtex ran — bibOutdated",
  sum([latex({ bib: bib(["k"]) }), bibtex(), latex({ bib: bib(["k"], "b2") })])
    .bibOutdated === true,
);
check(
  "summarize: no bibliography at all — never bibOutdated",
  sum([latex()]).bibOutdated === false,
);
check(
  "summarize: unsettled names every tracked file the last pass changed",
  JSON.stringify(
    sum([latex({ before: H("a1", "t1"), after: H("a2", "t2") })]).unsettled,
  ) === JSON.stringify(["paper.aux", "paper.toc"]),
);
check(
  "summarize: marker: Rerun to get — unsettled names the rerun marker even with identical files",
  JSON.stringify(sum([latex({ markers: ["rerun-requested"] })]).unsettled) ===
    JSON.stringify(["rerun-requested"]),
);
check(
  "summarize: undefined references ALONE leave nothing unsettled — on stable files they are a real bad key",
  sum([latex({ markers: ["undefined-references"] })]).unsettled.length === 0,
);
check(
  "summarize: bibtex that rewrote the .bbl leaves paper.bbl unsettled",
  JSON.stringify(sum([latex({ bib: bib(["k"]) }), bibtex()]).unsettled) ===
    JSON.stringify(["paper.bbl"]),
);
check(
  "summarize: bibtex left the .bbl byte-identical — the pass before it answers",
  sum([latex({ bib: bib(["k"]) }), bibtex({ after: H("a1") })]).unsettled
    .length === 0,
);
check(
  "summarize: latexPasses counts the non-final pdflatex passes only",
  sum([latex(), bibtex(), latex(), latex({ final: true })]).latexPasses === 2,
);
check(
  "summarize: finalDone and the undefined-reference warnings of the final log, nothing else",
  (() => {
    const s = sum([
      latex(),
      latex({
        final: true,
        markers: ["undefined-citations", "rerun-requested"],
      }),
    ]);
    return (
      s.finalDone &&
      JSON.stringify(s.warnings) === JSON.stringify(["undefined-citations"])
    );
  })(),
);

// ── 3. composed: nextStep(summarize(history)) ───────────────────────────────────────────
const step = (history) => nextStep(summarize(history));

// ── the histories the loop sees ───────────────────────────────────────────────────────────────────────────
const TABLE = [
  ["nothing ran yet — the first step is a plain pass", [], "latex"],
  [
    "a pass that created the aux — rerun",
    [latex({ before: H(null), after: H("a1") })],
    "latex",
  ],
  [
    "a pass whose tracked files did not change and whose log asks for nothing — converged, so the FINAL pass",
    [latex({ before: H(null), after: H("a1") }), latex()],
    "latex-final",
  ],
  ["the final pass exited 0 — done", [latex(), latex({ final: true })], "done"],
  [
    "a .toc change alone is a rerun",
    [latex({ before: H("a1", "t1"), after: H("a1", "t2") })],
    "latex",
  ],
  [
    "a .out change alone is a rerun (hyperref bookmarks)",
    [latex({ before: H("a1", null, "o1"), after: H("a1", null, "o2") })],
    "latex",
  ],
  [
    "marker: Rerun to get … — rerun even with identical files",
    [latex({ markers: ["rerun-requested"] })],
    "latex",
  ],
  [
    "marker: Label(s) may have changed — rerun",
    [latex({ markers: ["labels-changed"] })],
    "latex",
  ],
  [
    "marker: rerunfilecheck — rerun",
    [latex({ markers: ["rerunfilecheck"] })],
    "latex",
  ],
  [
    "undefined references ALONE do not request a rerun — on stable files they are a real bad key",
    [latex({ markers: ["undefined-references"] })],
    "latex-final",
  ],
  [
    "the aux names a bibliography bibtex has not run on — bibtex",
    [latex({ before: H(null), after: H("a1"), bib: bib(["k"]) })],
    "bibtex",
  ],
  [
    "after bibtex changed the .bbl — rerun",
    [latex({ bib: bib(["k"]) }), bibtex()],
    "latex",
  ],
  [
    "bibtex ran on exactly this input — not again",
    [
      latex({ bib: bib(["k"]) }),
      bibtex(),
      latex({
        before: H("a1", null, null, "bbl1"),
        after: H("a1", null, null, "bbl1"),
        bib: bib(["k"]),
      }),
    ],
    "latex-final",
  ],
  [
    "the \\citation set changed since bibtex ran — bibtex again",
    [latex({ bib: bib(["k"]) }), bibtex(), latex({ bib: bib(["k", "k2"]) })],
    "bibtex",
  ],
  [
    "the .bib content changed since bibtex ran — bibtex again",
    [latex({ bib: bib(["k"]) }), bibtex(), latex({ bib: bib(["k"], "b2") })],
    "bibtex",
  ],
  [
    "bibtex left the .bbl byte-identical — the verdict of the pass before it stands (converged)",
    [
      latex({ bib: bib(["k"]) }),
      bibtex({
        before: H("a1", null, null, "bbl1"),
        after: H("a1", null, null, "bbl1"),
      }),
    ],
    "latex-final",
  ],
  [
    "a pdflatex pass exited non-zero — fail",
    [
      latex({
        exitCode: 1,
        errorLines: ["./paper.tex:4: Undefined control sequence.", "l.4 \\foo"],
      }),
    ],
    "fail",
  ],
  [
    "bibtex exited non-zero — fail",
    [
      latex({ bib: bib(["k"]) }),
      bibtex({
        exitCode: 2,
        errorLines: ["I couldn't open database file nope.bib"],
      }),
    ],
    "fail",
  ],
  [
    "the FINAL pass exited non-zero (a paper-guards error) — fail, not done",
    [latex(), latex({ final: true, exitCode: 1 })],
    "fail",
  ],
];

for (const [label, history, expected] of TABLE) {
  const got = kind(step(history));
  check(`${label} (expected ${expected}, got ${got})`, got === expected);
}

// ── what a fail carries ─────────────────────────────────────────────────────────────────
const latexFail = step([
  latex({
    exitCode: 1,
    errorLines: ["./paper.tex:4: Undefined control sequence.", "l.4 \\foo"],
  }),
]);
check(
  "a latex fail names the step, the exit code and the log excerpt verbatim",
  latexFail.step === "latex" &&
    latexFail.cause.kind === "exit" &&
    latexFail.cause.code === 1 &&
    latexFail.lines[1] === "l.4 \\foo",
);
const bibFail = step([
  latex({ bib: bib(["k"]) }),
  bibtex({
    exitCode: 2,
    errorLines: ["I couldn't open database file nope.bib"],
  }),
]);
check(
  "a bibtex fail names BIBTEX, not latex",
  bibFail.kind === "fail" &&
    bibFail.step === "bibtex" &&
    bibFail.cause.code === 2,
);

// ── the cap ─────────────────────────────────────────────────────────────────────────────
const moving = (i) => latex({ before: H(`a${i}`), after: H(`a${i + 1}`) });
const underCap = Array.from({ length: MAX_PASSES - 1 }, (_, i) => moving(i));
check(
  `the cap is ${MAX_PASSES} and it is not hit early: after ${MAX_PASSES - 1} moving passes, one more`,
  MAX_PASSES === 5 && kind(step(underCap)) === "latex",
);
const atCap = Array.from({ length: MAX_PASSES }, (_, i) => moving(i));
const capped = step(atCap);
check(
  "🔴 after the cap, a still-moving aux is a FAIL — no convergence — not a PDF with stale references",
  capped.kind === "fail" && capped.cause.kind === "no-convergence",
);
check(
  "the non-convergence failure NAMES the file that kept changing",
  capped.kind === "fail" && capped.lines[0].includes("paper.aux"),
);
const cappedMarker = step(
  Array.from({ length: MAX_PASSES }, () =>
    latex({ markers: ["labels-changed"] }),
  ),
);
check(
  "a log that keeps asking for a rerun hits the same cap, and names the marker",
  cappedMarker.kind === "fail" &&
    cappedMarker.lines[0].includes("labels-changed"),
);
const convergedAtCap = [...atCap.slice(0, -1), latex()];
check(
  "reaching the cap WITH a converged last pass is not a failure — the final pass still runs",
  kind(step(convergedAtCap)) === "latex-final",
);

// ── done carries the undefined-reference summaries ─────────────────────────────────────
const doneWarn = step([
  latex(),
  latex({ final: true, markers: ["undefined-citations", "rerun-requested"] }),
]);
check(
  "done reports undefined citations still in the final log, and nothing else",
  doneWarn.kind === "done" &&
    doneWarn.warnings.length === 1 &&
    doneWarn.warnings[0] === "undefined-citations",
);

// ── helpers ─────────────────────────────────────────────────────────────────────────────
check(
  "changedFiles lists exactly the differing tracked files",
  JSON.stringify(
    changedFiles(H("a", "t", null, "b"), H("a", "t2", "o", "b")),
  ) === JSON.stringify(["toc", "out"]),
);
check(
  "a file appearing (null → digest) is a change",
  changedFiles(H(null), H("a1")).includes("aux"),
);

console.log(
  `✓ ${String(n)} assertions passed — latex-loop: nextStep over State, summarize over histories, and the two composed, including the ${MAX_PASSES}-pass cap`,
);
