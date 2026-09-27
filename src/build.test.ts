/**
 * build.ts edges the harness does not reach: the compile step's wording for every way pdflatex or
 * bibtex stops, bibtex's input when the `.aux` names a database, the measure note for a review
 * build, a stub page and a measured geometry, the loop over non-applicable steps, and the verdict
 * lines. pdflatex and bibtex are a fake runner that writes the files the real ones would.
 */
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { present, useTempDir, writeTree } from "../test/support.ts";
import {
  bibInput,
  buildPaper,
  buildPapers,
  compileStep,
  formatResult,
  parseDocumentclass,
  readFacts,
  type BuildOptions,
  type PaperFacts,
} from "./build.ts";
import type { Geometry } from "./domain/geometry.ts";
import type { PdfReader } from "./pdf-facts.ts";

const root = useTempDir("paperlint-build-test-");
const TEX = "\\documentclass{article}\\begin{document}x\\end{document}";
let n = 0;
const paper = (files: Record<string, string> = { "paper.tex": TEX }) =>
  writeTree(join(root, `p${String(n++)}`), files);

interface Fake {
  /** pdflatex's exit status; `null` is a signal. */
  latex?: number | null;
  /** bibtex's exit status, and what it prints. */
  bibtex?: number | null;
  bibtexOut?: string;
  /** Which program cannot be started. */
  missing?: "pdflatex" | "bibtex";
  aux?: string;
  log?: string;
  /** pdflatex dies before opening paper.log, printing nothing. */
  noLog?: boolean;
  /** Each pass writes a different .aux, so the loop never settles. */
  churn?: boolean;
}
/** A pdflatex pass: writes the .aux, the log unless it dies first, and a PDF when it exits 0. */
function latexPass(f: Fake, cwd: string, pass: number) {
  const status = "latex" in f ? f.latex : 0;
  const aux = f.churn ? `\\relax % ${String(pass)}\n` : (f.aux ?? "\\relax\n");
  writeFileSync(join(cwd, "paper.aux"), aux);
  if (!f.noLog) writeFileSync(join(cwd, "paper.log"), f.log ?? "");
  if (status === 0) writeFileSync(join(cwd, "paper.pdf"), "%PDF-fake");
  return f.noLog ? { status } : { status, stdout: "", stderr: "" };
}
/** A bibtex run: writes the .bbl; status and output as the case says. */
function bibtexRun(f: Fake, cwd: string) {
  writeFileSync(join(cwd, "paper.bbl"), "\\begin{thebibliography}{1}");
  if (f.bibtex === undefined)
    return { status: 0, stdout: "This is BibTeX\n", stderr: "" };
  return f.bibtexOut === undefined
    ? { status: f.bibtex }
    : { status: f.bibtex, stdout: f.bibtexOut };
}
function fakeRun(f: Fake): NonNullable<BuildOptions["run"]> {
  let pass = 0;
  return (bin, _args, opts) => {
    if (bin === f.missing)
      return {
        error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
        status: null,
      };
    // The build always runs a pass in the paper's directory.
    const cwd = present(opts.cwd, "the pass's cwd");
    return bin === "pdflatex" ? latexPass(f, cwd, ++pass) : bibtexRun(f, cwd);
  };
}

const NO_GEOMETRY: Geometry = {
  kind: "unmeasured",
  why: ["no banal"],
  tried: null,
};
const page = (words: number, numbered = 0) => ({
  widthPt: 612,
  heightPt: 792,
  words: [
    ...Array.from({ length: numbered }, (_, i) => ({
      x0: 20,
      y0: 60 + i * 10,
      x1: 30,
      y1: 70 + i * 10,
      text: String(i + 1),
    })),
    ...Array.from({ length: words }, (_, i) => ({
      x0: i % 2 ? 320 : 54,
      y0: 60 + (i >> 1) * 10,
      x1: i % 2 ? 340 : 74,
      y1: 70 + (i >> 1) * 10,
      text: "w",
    })),
  ],
});
const reader =
  (last = page(80)): PdfReader =>
  () =>
    Promise.resolve({
      ok: true,
      facts: {
        pages: 1,
        fonts: {
          kind: "drawn",
          list: [{ kind: "embedded", name: "CMR10", program: "Type1" }],
        },
        last,
        layout: [],
      },
    });
const quiet = () => {};
/** buildPaper with fakes; the verdict line is what the command would print for it. */
async function build(dir: string, f: Fake = {}, over: BuildOptions = {}) {
  const r = await buildPaper(dir, {
    cwd: root,
    log: quiet,
    env: { PAPERLINT_BANAL_DIR: join(root, "no-banal") },
    run: fakeRun(f),
    readPdf: reader(),
    measure: { measure: () => NO_GEOMETRY },
    ...over,
  });
  return { r, line: formatResult(r).replaceAll(root, "<root>") };
}

test("documentclass: an empty name is no class; a macro inside the name contributes nothing", () => {
  assert.equal(parseDocumentclass("\\documentclass{}"), null);
  // Nested deep enough to exhaust the parser's stack: no class, not a crash.
  assert.equal(
    parseDocumentclass(`\\documentclass{x}${"{".repeat(20_000)}`),
    null,
  );
  assert.deepEqual(parseDocumentclass("\\documentclass{a\\foo{}b}"), {
    name: "ab",
    options: [],
  });
  // unified-latex attaches arguments to the macros it has a signature for; a tree where
  // `\documentclass` came back bare has no name to read, and is no class.
  assert.equal(
    parseDocumentclass("\\documentclass", {
      parse: () => ({
        type: "root",
        content: [{ type: "macro", content: "documentclass" }],
      }),
    }),
    null,
  );
});

test("facts of a paper with no paper.tex: no class", () => {
  assert.deepEqual(readFacts(paper({ "paper.md": "# P\n" })), {
    main: null,
    documentclass: null,
    venue: null,
    ignoredScripts: [],
  });
});

test("compile's plan line names the options, a missing class and the venue", () => {
  const facts = (over: Partial<PaperFacts>): PaperFacts => ({
    main: "paper.tex",
    documentclass: null,
    venue: null,
    ignoredScripts: [],
    ...over,
  });
  assert.deepEqual(
    [
      compileStep.applies(
        facts({
          documentclass: { name: "acmart", options: ["sigconf", "review"] },
        }),
      ),
      compileStep.applies(facts({ venue: "aisec" })),
    ],
    [
      { yes: true, why: "paper.tex (\\documentclass[sigconf,review]{acmart})" },
      { yes: true, why: "paper.tex (no \\documentclass found, venue aisec)" },
    ],
  );
});

test("bibtex's input: no .aux, nothing named, a database named with and without .bib, one that is missing", () => {
  assert.deepEqual(bibInput(paper({})), { kind: "none" });
  const none = paper({ "paper.aux": "\\relax\n" });
  assert.deepEqual(bibInput(none), { kind: "none" });
  const named = paper({
    "paper.aux": "\\citation{k}\n\\bibstyle{plain}\n\\bibdata{a.bib,missing}\n",
    "a.bib": "@misc{k}\n",
  });
  const got = bibInput(named);
  assert.deepEqual(
    { ...got, bibHash: got.kind === "needed" && typeof got.bibHash },
    {
      kind: "needed",
      citations: ["k"],
      databases: ["a.bib", "missing"],
      style: "plain",
      bibHash: "string",
    },
  );
  const gone = bibInput(paper({ "paper.aux": "\\bibdata{gone}\n" }));
  assert.equal(gone.kind === "needed" && gone.bibHash, null);
});

test("compile: pdflatex killed by a signal, with no log and nothing printed", async () => {
  const { line } = await build(paper(), { latex: null, noLog: true });
  assert.equal(
    line,
    [
      "  ✗ compile: pdflatex exited with 1",
      "      pdflatex wrote no paper.log — the last lines it printed:",
      "      paper.pdf removed — a stale PDF must not pass for this build",
    ].join("\n"),
  );
});

test("compile: bibtex that cannot start, and bibtex that fails, quote the .blg", async () => {
  const aux = "\\citation{k}\n\\bibstyle{plain}\n\\bibdata{refs}\n";
  const files = { "paper.tex": TEX, "refs.bib": "@misc{k}\n" };
  const cannot = await build(paper(files), { aux, missing: "bibtex" });
  assert.match(cannot.line, /^ {2}✗ compile: bibtex exited with 127\n/);
  const dir = paper(files);
  const failed = await build(dir, {
    aux,
    bibtex: 2,
    bibtexOut:
      "I couldn't open database file refs.bib\n---line 3 of file paper.aux\n",
  });
  assert.match(failed.line, /^ {2}✗ compile: bibtex exited with 2\n/);
  assert.match(failed.line, /full log: <root>\/p\d+\/paper\.blg/);
  const signal = await build(paper(files), { aux, bibtex: null });
  assert.match(
    signal.line,
    /bibtex exited with 1\n {6}\(no error line found in the log\)/,
  );
});

test("compile: a document whose .aux never settles did not converge", async () => {
  const { line } = await build(paper(), { churn: true });
  assert.match(line, /^ {2}✗ compile: pdflatex did not converge\n/);
});

test("compile: warnings the final log still reports are named in the note", async () => {
  const { r } = await build(paper(), {
    log: "LaTeX Warning: There were undefined references.\n",
  });
  assert.equal(r.status, "built");
  assert.match(r.notes?.[0] ?? "", /— ⚠️ the final log still reports /);
});

test("measure: a review build and a stub last page are named; a measured geometry adds nothing", async () => {
  const review = await build(paper(), {}, { readPdf: reader(page(20, 60)) });
  assert.match(
    review.line,
    /last page has numbered lines \(a review build\), not measured/,
  );
  const stub = await build(paper(), {}, { readPdf: reader(page(3)) });
  assert.match(stub.line, /last page has 3 words, too few to measure/);
  const measured = await build(
    paper(),
    {},
    {
      measure: {
        measure: () => ({
          kind: "measured",
          by: { tool: "banal", path: "/b", how: "$BANAL" },
          geometry: {
            pageWidthIn: 8.5,
            pageHeightIn: 11,
            columns: 2,
            bodyPt: 9,
            refPt: 7,
            bodyPages: 1,
            refPages: 0,
            appendixPages: 0,
            pagesByType: { body: 1 },
          },
        }),
      },
    },
  );
  assert.doesNotMatch(measured.line, /page geometry not measured/);
});

test("a step that does not apply is skipped; a run whose steps leave no note prints the bare PDF", async () => {
  const { line } = await build(
    paper(),
    {},
    {
      steps: [
        {
          name: "never",
          required: false,
          applies: () => ({ yes: false, why: "no" }),
          run: () => {
            throw new Error("ran");
          },
        },
        {
          name: "quiet",
          required: true,
          applies: () => ({ yes: true, why: "yes" }),
          run: () => ({ ok: true }),
        },
      ],
    },
  );
  assert.equal(line, "  ✓ paper.pdf");
});

test("paths: a paper that IS the working directory is named by its full path", async () => {
  const dir = paper();
  const logged: string[] = [];
  await buildPaper(dir, {
    cwd: dir,
    log: (l) => logged.push(l),
    dryRun: true,
    measure: { measure: () => NO_GEOMETRY },
  });
  assert.equal(logged[0], dir);
  const lines: string[] = [];
  writeFileSync(join(dir, "paper.pdf"), "%PDF-old");
  const run = await buildPapers([dir], {
    cwd: dir,
    log: (l) => lines.push(l),
    engine: () => Promise.resolve(null),
  });
  assert.deepEqual(
    [run, lines],
    [
      { kind: "no-engine" },
      [`${dir}: paper.pdf removed — a stale PDF must not pass for this build`],
    ],
  );
  assert.equal(existsSync(join(dir, "paper.pdf")), false);
});

test("facts that cannot be read fail the build at `facts`", async () => {
  const { line } = await build(
    paper({ "paper.tex": TEX, "paperlint.json": "{ nope" }),
  );
  assert.match(line, /^ {2}✗ facts: /);
});

test("a failed result without its lines still says what failed", () => {
  assert.equal(
    formatResult({ dir: "d", status: "failed", plan: [] }),
    [
      "  ✗ build: failed",
      "      paper.pdf removed — a stale PDF must not pass for this build",
    ].join("\n"),
  );
});
