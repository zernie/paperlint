/**
 * `latex-loop.ts` — every branch of `nextStep`, as a table over observation histories.
 *
 * The decision is pure, so none of this needs TeX: a row is a history of what the runs so far
 * observed, and the step the loop must take next. The real-pdflatex half lives in
 * `test/e2e/build.mjs`.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { nextStep, changedFiles, rerunReason, MAX_PASSES } = await import(
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

// ── the table ───────────────────────────────────────────────────────────────────────────
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
  const got = kind(nextStep(history));
  check(`${label} (expected ${expected}, got ${got})`, got === expected);
}

// ── what a fail carries ─────────────────────────────────────────────────────────────────
const latexFail = nextStep([
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
const bibFail = nextStep([
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
  MAX_PASSES === 5 && kind(nextStep(underCap)) === "latex",
);
const atCap = Array.from({ length: MAX_PASSES }, (_, i) => moving(i));
const capped = nextStep(atCap);
check(
  "🔴 after the cap, a still-moving aux is a FAIL — no convergence — not a PDF with stale references",
  capped.kind === "fail" && capped.cause.kind === "no-convergence",
);
check(
  "the non-convergence failure NAMES the file that kept changing",
  capped.kind === "fail" && capped.lines[0].includes("paper.aux"),
);
const cappedMarker = nextStep(
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
  kind(nextStep(convergedAtCap)) === "latex-final",
);

// ── done carries the undefined-reference summaries ─────────────────────────────────────
const doneWarn = nextStep([
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
check("rerunReason is null on an empty history", rerunReason([]) === null);

console.log(
  `✓ ${String(n)} assertions passed — latex-loop: every branch of nextStep, including the ${MAX_PASSES}-pass cap`,
);
