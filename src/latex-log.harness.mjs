/**
 * `latex-log.ts` — reading pdflatex logs, bibtex output and `.aux` files, both halves.
 *
 * The log excerpts below are copied from real TeX Live 2023 runs (2026-09-24), not typed from
 * memory: the two error spellings `-file-line-error` produces, the missing-package form, and a
 * marker that TeX broke at column 79.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  unwrapLog,
  logMarkers,
  errorExcerpt,
  isErrorLine,
  bibtexExcerpt,
  auxBib,
  MAX_PRINT_LINE,
} = await import(join(HERE, "latex-log.ts"));

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

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
  "every documented marker is recognised",
  [
    "rerun-requested",
    "labels-changed",
    "rerunfilecheck",
    "undefined-references",
    "undefined-citations",
  ].every((k) => m.includes(k)),
);
check(
  "a clean log carries no markers",
  logMarkers([
    "This is pdfTeX",
    "Output written on paper.pdf (1 page, 1234 bytes).",
  ]).length === 0,
);
// Guards: matching the documented summary line rather than the word 'undefined'.
check(
  "a single reference warning is not the end-of-run summary",
  !logMarkers([firstPass[0]]).includes("undefined-references"),
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
// Guards: the spelling rpp's own flags produce for most errors — with only the `!` form recognised,
// an undefined control sequence fails with no error line quoted.
check(
  "-file-line-error form: the error line, the l.NNN line and the rest of the source line",
  ex[0] === "./paper.tex:4: Undefined control sequence." &&
    ex[1] === "l.4 \\foo" &&
    ex[2].includes("bar baz"),
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

console.log(
  `✓ ${String(n)} assertions passed — latex-log: markers across the 79-column wrap, both error spellings, aux`,
);
