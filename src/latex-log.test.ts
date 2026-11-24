/**
 * `latex-log.ts` — reading pdflatex logs, bibtex output and `.aux` files, both halves.
 *
 * The log excerpts below are copied from real TeX Live 2023 runs (2026-09-24), not typed from
 * memory: the two error spellings `-file-line-error` produces, the missing-package form, and a
 * marker that TeX broke at column 79.
 */
import { createChecker } from "../lib/check.ts";
import type { FailingWarningId, LogMarker } from "./latex-log.ts";

const {
  unwrapLog,
  logMarkers,
  errorExcerpt,
  isErrorLine,
  bibtexExcerpt,
  auxBib,
  MAX_PRINT_LINE,
  FAILING_WARNINGS,
  failingWarnings,
} = await import("./latex-log.ts");

const check = createChecker();

// ── the 79-column wrap ──────────────────────────────────────────────────────────────────
// A package warning long enough that "Rerun to get" crosses column 79. A real acmart log shows the
// same break: "Document Class: acmart 2024/02/04 v2.03 Typesetting articles for the Associatio"
// is a 79-byte line continued on the next one.
const warning =
  "Package natbib Warning: Citation(s) may have changed in the bibliography. Rerun to get citations correct.";
const at79 = warning.slice(0, MAX_PRINT_LINE);
const rest = warning.slice(MAX_PRINT_LINE);
check(
  "the fixture really is split at 79 (the marker straddles the break)",
  at79.length === 79 && !at79.includes("Rerun to get") && rest.length > 0,
);
const wrappedLog = ["(./paper.aux)", "", at79, rest, ""].join("\n");
// Guards: rejoining the lines TeX broke — a 'Rerun to get' split across the break is on no line at
// all, and the loop would stop one pass early.
check(
  "🔴 a marker broken at column 79 is rejoined and found",
  logMarkers(unwrapLog(wrappedLog)).includes("rerun-requested"),
);
check(
  "without the unwrap, the split marker is NOT on any one line — the wrap is real",
  !wrappedLog.split("\n").some((l) => l.includes("Rerun to get")),
);
// LaTeX core's line is 78 bytes; one trailing space makes it a line TeX would NOT have broken but
// that is 79 bytes anyway — the ambiguous case `unwrapLog` documents.
const exact79 =
  "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right. ";
check(
  "a marker line that is exactly 79 bytes by itself is still found after the (harmless) join",
  exact79.length === 79 &&
    logMarkers(unwrapLog([exact79, "", "next"].join("\n"))).includes(
      "labels-changed",
    ),
);
check(
  "a short line is not joined to the next one",
  JSON.stringify(unwrapLog("a\nb")) === JSON.stringify(["a", "b"]),
);
check(
  "two consecutive 79-byte lines join with the third",
  unwrapLog(["x".repeat(79), "y".repeat(79), "z"].join("\n"))[0] ===
    "x".repeat(79) + "y".repeat(79) + "z",
);

// ── markers ─────────────────────────────────────────────────────────────────────────────
const firstPass = [
  "LaTeX Warning: Reference `sec:intro' on page 1 undefined on input line 4.",
  "LaTeX Warning: There were undefined references.",
  "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.",
  "Package rerunfilecheck Warning: File `paper.out' has changed.",
  "(rerunfilecheck)                Rerun to get outlines right",
  "Package natbib Warning: There were undefined citations.",
];
const m = logMarkers(firstPass);
check(
  "every documented marker is recognised, and the end-of-run summaries are not markers (they fail the build: FAILING_WARNINGS)",
  JSON.stringify(m) ===
    JSON.stringify([
      "rerun-requested",
      "labels-changed",
      "rerunfilecheck",
    ] satisfies LogMarker[]),
  m,
);
check(
  "a clean log carries no markers",
  logMarkers([
    "This is pdfTeX",
    "Output written on paper.pdf (1 page, 1234 bytes).",
  ]).length === 0,
);

// ── error excerpt ───────────────────────────────────────────────────────────────────────
const undefinedCs = [
  "(/usr/share/texlive/texmf-dist/tex/latex/base/size10.clo)",
  "./paper.tex:4: Undefined control sequence.",
  "l.4 \\foo",
  "         bar baz ",
  "Here is how much of TeX's memory you used:",
];
const ex = errorExcerpt(undefinedCs);
// Guards: the spelling paperlint's own flags produce for most errors — with only the `!` form recognised,
// an undefined control sequence fails with no error line quoted.
check(
  "-file-line-error form: the error line, the l.NNN line and the rest of the source line",
  ex[0] === "./paper.tex:4: Undefined control sequence." &&
    ex[1] === "l.4 \\foo" &&
    (ex[2] ?? "").includes("bar baz"),
);
// Guards: the end of the excerpt — without it the excerpt runs into TeX's memory statistics and
// buries the line the author needs.
check(
  "the excerpt stops at the context — the memory statistics are not quoted",
  !ex.some((l) => l.startsWith("Here is how much")),
);
const missingPkg = [
  ")",
  "",
  "! LaTeX Error: File `nopepkg.sty' not found.",
  "",
  "Type X to quit or <RETURN> to proceed,",
  "or enter new name. (Default extension: sty)",
  "",
  "Enter file name: ",
  "./paper.tex:3: Emergency stop.",
  "<read *> ",
  "         ",
  "l.3 \\begin",
  "          {document}^^M ",
  "Here is how much of TeX's memory you used:",
];
const ex2 = errorExcerpt(missingPkg);
check(
  "the classic `!` form: the FIRST error is quoted, not the emergency stop after it",
  ex2[0] === "! LaTeX Error: File `nopepkg.sty' not found.",
);
check(
  "…and the excerpt runs to its l.NNN context, dropping blank lines",
  ex2.includes("l.3 \\begin") && !ex2.some((l) => l.trim() === ""),
);
check(
  "no error line — an empty excerpt",
  errorExcerpt(["all fine"]).length === 0,
);
check(
  "a warning that ends in `line 4.` is not an error line",
  !isErrorLine(
    "LaTeX Warning: Citation `k' on page 1 undefined on input line 4.",
  ),
);
// Guards: the requirement that the prefix look like a path — without it, the first such line in a
// package's info output is quoted as 'the error'.
check(
  "a path-less `word:12: ` is not an error line either",
  !isErrorLine("Chapter:12: something"),
);

// ── bibtex ──────────────────────────────────────────────────────────────────────────────
const bibOut = [
  "This is BibTeX, Version 0.99d (TeX Live 2023/Debian)",
  "The top-level auxiliary file: paper.aux",
  "The style file: plain.bst",
  "I couldn't open database file nope.bib",
  "---line 5 of file paper.aux",
  " : \\bibdata{nope",
  "(There were 2 error messages)",
].join("\n");
const bx = bibtexExcerpt(bibOut);
// Guards: filtering bibtex's fixed preamble — a failure would open with 'This is BibTeX, Version
// 0.99d' and push the real reason down.
check(
  "bibtex: the banner is dropped, the explanation kept",
  bx[0] === "I couldn't open database file nope.bib" &&
    !bx.some((l) => l.startsWith("This is BibTeX")),
);

// ── aux ─────────────────────────────────────────────────────────────────────────────────
const aux = [
  "\\relax ",
  "\\citation{knuth84}",
  "\\citation{b,a}",
  "\\bibstyle{plain}",
  "\\bibdata{refs,more}",
  "\\@input{chap1.aux}",
  "\\newlabel{sec:intro}{{1}{1}{}{}{}}",
].join("\n");
const sub = "\\citation{c}\n\\citation{a}\n";
const parsed = auxBib(aux, (name) => (name === "chap1.aux" ? sub : null));
// Guards: citations from \include'd chapters — a \cite added in a chapter would not change the
// citation set, and bibtex would not rerun for it.
check(
  "citations: sorted, unique, including the ones in an \\@input aux",
  JSON.stringify(parsed.citations) ===
    JSON.stringify(["a", "b", "c", "knuth84"]),
);
check(
  "databases and style are read",
  JSON.stringify(parsed.databases) === JSON.stringify(["refs", "more"]) &&
    parsed.style === "plain",
);
check(
  "an aux with no \\bibdata names no databases",
  auxBib("\\relax\n\\citation{x}\n").databases.length === 0,
);
check(
  "a self-including aux does not loop forever",
  auxBib("\\@input{paper.aux}\n\\citation{x}", () => "\\@input{paper.aux}")
    .citations.length === 1,
);

check(
  "an \\@input aux that is not there (the default reader finds nothing) is skipped",
  JSON.stringify(auxBib("\\@input{gone.aux}\n\\citation{x}\n").citations) ===
    JSON.stringify(["x"]),
);
check(
  "a log whose LAST line is exactly 79 bytes keeps it (nothing follows to join it to)",
  JSON.stringify(unwrapLog(`a\n${"x".repeat(79)}`)) ===
    JSON.stringify(["a", "x".repeat(79)]),
);
check(
  "an error path must hold a dot or a slash; a bare word before the line number is not one",
  isErrorLine("paper.tex:4: Undefined control sequence.") &&
    isErrorLine("chapters/intro:9: x") &&
    !isErrorLine("paper:4: x") &&
    !isErrorLine("two words.tex:4: x"),
);
{
  const flood = [
    "./paper.tex:1: Undefined control sequence.",
    ...Array.from({ length: 20 }, (_, i) => `noise ${String(i)}`),
    "l.1 \\foo",
  ];
  check(
    "an excerpt stops at MAX_EXCERPT lines even before the l.NNN line arrives",
    errorExcerpt(flood).length === 12 && errorExcerpt(flood)[11] === "noise 10",
  );
}

// ── warnings that fail the build ────────────────────────────────────────────────────────
// Every entry of FAILING_WARNINGS has its two halves here — log lines it must find, and lines it
// must not — and `satisfies Record<FailingWarningId, …>` makes a table entry without a row here a
// type error; the first check below makes it a red run as well.
// The lost-character line is copied from a real TeX Live 2026 run (2026-10-26): `\char"FF` in
// cmr10 under `\documentclass{article}`, which sets `\tracinglostchars=2`; pdflatex exited 0.
// The log is read as latin1, so the byte 0xFF is the one character "\xff".
const LOST = "Missing character: There is no \xff in font cmr10!";
const FAILING_CASES = {
  "lost-character": {
    fires: [
      LOST,
      "Missing character: There is no \xe2 in font LinLibertineT-tlf-ot1!",
    ],
    quiet: [
      "Overfull \\hbox (1.2pt too wide) in paragraph at lines 4--5",
      "LaTeX Font Warning: Font shape `OT1/cmr/bx/sc' undefined",
      "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.",
      "LaTeX Warning: There were undefined references.",
      // The words inside an unrelated longer line — an overfull box quoting the text it set.
      "[]\\OT1/cmr/m/n/10 Missing character: There is no x in font cmr10!",
    ],
  },
  // The three end-of-run summaries, worded as latex.ltx and natbib.sty print them (TeX Live 2026);
  // LaTeX core has no "undefined citations" summary — an undefined \cite counts as a reference. Guards: matching the
  // summary, not the word "undefined" — one reference warning per \ref is printed on EVERY pass
  // before the rerun, and is not the summary.
  "undefined-references": {
    fires: ["LaTeX Warning: There were undefined references."],
    quiet: [
      "LaTeX Warning: Reference `sec:intro' on page 1 undefined on input line 4.",
      "Package natbib Warning: There were undefined citations.",
      "LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.",
    ],
  },
  "undefined-citations": {
    fires: ["Package natbib Warning: There were undefined citations."],
    quiet: [
      "LaTeX Warning: Citation `knuth84' on page 1 undefined on input line 7.",
      "Package natbib Warning: Citation `knuth84' on page 1 undefined on input line 7.",
      "LaTeX Warning: There were undefined references.",
    ],
  },
  "multiply-defined-labels": {
    fires: ["LaTeX Warning: There were multiply-defined labels."],
    quiet: [
      "LaTeX Warning: Label `sec:intro' multiply defined.",
      "LaTeX Warning: There were undefined references.",
    ],
  },
} satisfies Record<
  FailingWarningId,
  { readonly fires: readonly string[]; readonly quiet: readonly string[] }
>;
check(
  "every failing warning in the table has a row of cases, and every row is in the table",
  JSON.stringify(FAILING_WARNINGS.map((w) => w.id).sort()) ===
    JSON.stringify(Object.keys(FAILING_CASES).sort()),
);
for (const [id, c] of Object.entries(FAILING_CASES)) {
  for (const line of c.fires)
    check(
      `${id}: fires on ${JSON.stringify(line)}`,
      failingWarnings(["(./paper.aux)", line, ""]).some((h) => h.id === id),
      () => failingWarnings(["(./paper.aux)", line, ""]),
    );
  for (const line of c.quiet)
    check(
      `${id}: quiet on ${JSON.stringify(line)}`,
      !failingWarnings(["(./paper.aux)", line, ""]).some((h) => h.id === id),
      () => failingWarnings(["(./paper.aux)", line, ""]),
    );
}
check(
  "a clean log carries no failing warning",
  failingWarnings([
    "This is pdfTeX",
    "Output written on paper.pdf (1 page, 1234 bytes).",
  ]).length === 0,
);
{
  const log = [
    LOST,
    "(./paper.aux)",
    LOST,
    "Missing character: There is no \xfe in font cmtt10!",
    LOST,
  ];
  const hits = failingWarnings(log);
  check(
    "a lost character quotes each distinct line once, in order, with how many times TeX printed it",
    JSON.stringify(hits) ===
      JSON.stringify([
        {
          id: "lost-character",
          reason: FAILING_WARNINGS[0].reason,
          quotes: [
            { text: LOST, times: 3 },
            {
              text: "Missing character: There is no \xfe in font cmtt10!",
              times: 1,
            },
          ],
        },
      ]),
    hits,
  );
}
{
  // A long font name pushes the line past column 79: TeX breaks it, and unwrapLog rejoins it.
  const long =
    "Missing character: There is no \xff in font LinLibertineT-tlf-ts1-scaled-1000-extended!";
  const split = [long.slice(0, MAX_PRINT_LINE), long.slice(MAX_PRINT_LINE)];
  check(
    "a lost-character line TeX split at column 79 is rejoined and found, quoted whole",
    split[0]?.length === 79 &&
      JSON.stringify(
        failingWarnings(unwrapLog(split.join("\n")))[0]?.quotes,
      ) === JSON.stringify([{ text: long, times: 1 }]),
  );
}
{
  // A line of exactly 79 bytes by itself is joined to the next one (unwrapLog's documented false
  // join): the marker then starts at byte 79 of the joined line, where the physical line began.
  const before = "x".repeat(MAX_PRINT_LINE);
  const joined = unwrapLog([before, LOST, ""].join("\n"));
  check(
    "a lost-character line glued by a false join to a 79-byte line before it is still found",
    joined[0] === before + LOST && failingWarnings(joined).length === 1,
  );
  check(
    "the marker words NOT at a physical line start (byte 78) are not read as one",
    failingWarnings(["y".repeat(MAX_PRINT_LINE - 1) + LOST]).length === 0,
  );
}

console.log(
  `✓ ${String(check.count)} assertions passed — latex-log: markers across the 79-column wrap, both error spellings, aux, warnings that fail the build`,
);
