/**
 * Both halves for `build.ts` — the shell that compiles a paper with pdflatex and bibtex.
 *
 * The process runner is replaced by a fake that writes what pdflatex and bibtex would write, so
 * these assertions check the SHELL's decisions: what is run, with which environment, in which
 * order, and what is left on disk. Whether a real pdflatex produces a real PDF is the other half,
 * `test/e2e/build.mjs`.
 *
 * 🔴 THE TWO THINGS PINNED DOWN HERE THAT A RETURNED OBJECT CANNOT SHOW: a paper-supplied
 * `build.sh` is never executed (checked by the trace it would leave on disk and by the list of
 * processes started), and a failed build removes the stale `paper.pdf` (checked on disk).
 */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  buildPaper,
  papersIn,
  formatResult,
  anyFailed,
  remedyFor,
  parseDocumentclass,
  readFacts,
  withTexInputs,
  pdflatexArgs,
  planFor,
  STEPS,
  IGNORED_SCRIPTS,
} = await import(join(HERE, "build.ts"));
const { packageVenuesDir } = await import(
  join(HERE, "..", "skills", "paper-pipeline", "scripts", "consumer.mjs")
);

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-build-")));
const paper = (name, files) => {
  const dir = join(root, "papers", name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
};

/**
 * A fake TeX. `pdflatex` writes paper.aux / paper.log (and paper.pdf on success) in its cwd;
 * `bibtex` writes paper.bbl. Every call is recorded with its argv, cwd and TEXINPUTS.
 */
function fakeTex({
  aux = "\\relax\n",
  exitCode = 0,
  log = "",
  missing = false,
} = {}) {
  const calls = [];
  const run = (bin, args, opts) => {
    calls.push({ bin, args, cwd: opts?.cwd, texinputs: opts?.env?.TEXINPUTS });
    if (missing)
      return {
        error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
        status: null,
      };
    if (bin === "pdflatex") {
      writeFileSync(join(opts.cwd, "paper.aux"), aux);
      writeFileSync(join(opts.cwd, "paper.log"), log);
      if (exitCode === 0)
        writeFileSync(join(opts.cwd, "paper.pdf"), "%PDF-fake");
      return { status: exitCode, stdout: "", stderr: "" };
    }
    if (bin === "bibtex") {
      writeFileSync(join(opts.cwd, "paper.bbl"), "\\begin{thebibliography}{1}");
      return { status: 0, stdout: "This is BibTeX\n", stderr: "" };
    }
    return { status: 99 };
  };
  return { run, calls };
}
const quiet = () => {};
const CLEAN_TEX = "\\documentclass{article}\\begin{document}x\\end{document}";

try {
  // ── facts: parsed from the paper, not configured ──────────────────────────────────────
  check(
    "documentclass and options come from the parser",
    JSON.stringify(
      parseDocumentclass(
        "\\documentclass[sigconf, review]{acmart}\n\\begin{document}x\\end{document}",
      ),
    ) === JSON.stringify({ name: "acmart", options: ["sigconf", "review"] }),
  );
  check(
    "a \\documentclass inside a COMMENT is not the class",
    parseDocumentclass("% \\documentclass{fake}\n\\documentclass{article}\n")
      ?.name === "article",
  );
  check(
    "no \\documentclass — null, not a guess",
    parseDocumentclass("hello") === null,
  );
  const venued = paper("venued", {
    "paper.tex": CLEAN_TEX,
    "venue.json": JSON.stringify({ venue: "agenticdev", kind: "short" }),
    "build.sh": "exit 0\n",
  });
  const facts = readFacts(venued);
  check("the venue comes from venue.json", facts.venue === "agenticdev");
  check(
    "a leftover build.sh is a FACT (reported), not a step",
    JSON.stringify(facts.ignoredScripts) === JSON.stringify(["build.sh"]) &&
      IGNORED_SCRIPTS.includes("repro/build-submission.sh"),
  );

  // ── inputs: rpp's own venues directory, no configuration ───────────────────────────────
  const venues = packageVenuesDir();
  check(
    "the venues directory is rpp's own and holds paper-guards.tex",
    existsSync(join(venues, "paper-guards.tex")),
  );
  check(
    "🔴 with no TEXINPUTS set, the value ENDS in the separator — otherwise the system tree stops resolving",
    withTexInputs({}, [venues]).TEXINPUTS === `${venues}${delimiter}`,
  );
  check(
    "an existing TEXINPUTS is kept, after ours",
    withTexInputs({ TEXINPUTS: `/mine${delimiter}` }, [venues]).TEXINPUTS ===
      `${venues}${delimiter}/mine${delimiter}`,
  );

  // ── the plan ──────────────────────────────────────────────────────────────────────────
  const plan = planFor(facts);
  check(
    "the plan has one line per step, in order, each with a why",
    plan.map((p) => p.step).join(",") === STEPS.map((s) => s.name).join(",") &&
      plan.every((p) => p.why.length > 0),
  );
  check(
    "compile's why names the source, the class and the venue",
    /paper\.tex/.test(plan[1].why) &&
      /article/.test(plan[1].why) &&
      /agenticdev/.test(plan[1].why),
  );

  // ── pdflatex arguments ────────────────────────────────────────────────────────────────
  check(
    "every pass is nonstop, halts on error, and reports file:line",
    ["-interaction=nonstopmode", "-halt-on-error", "-file-line-error"].every(
      (f) => pdflatexArgs(false).includes(f),
    ),
  );
  check(
    "the FINAL pass defines \\finalpass (the paper-guards switch) and keeps the job name",
    pdflatexArgs(true).includes("-jobname=paper") &&
      pdflatexArgs(true).at(-1) === "\\def\\finalpass{}\\input{paper.tex}",
  );

  // ── a clean build, with leftover scripts that must NOT run ────────────────────────────
  const clean = paper("clean", {
    "paper.tex": CLEAN_TEX,
    "build.sh": '#!/usr/bin/env bash\ntouch "$(dirname "$0")/RAN"\nexit 1\n',
    "repro/build-submission.sh":
      '#!/usr/bin/env bash\ntouch "$(dirname "$0")/../RAN2"\n',
  });
  const events = [];
  const tex = fakeTex();
  const r = buildPaper(clean, {
    cwd: root,
    run: (...a) => {
      events.push("run");
      return tex.run(...a);
    },
    env: {},
    log: (l) => events.push(l),
  });
  check("a clean paper builds", r.status === "built");
  check(
    "🔴 the paper's build scripts were NOT executed — no trace on disk",
    !existsSync(join(clean, "RAN")) && !existsSync(join(clean, "RAN2")),
  );
  check(
    "🔴 and nothing but pdflatex/bibtex was started",
    tex.calls.every((c) => c.bin === "pdflatex" || c.bin === "bibtex"),
  );
  check(
    "one line per ignored script tells the author it is ignored",
    events.filter(
      (e) => e !== "run" && /is ignored — rpp builds the paper itself/.test(e),
    ).length === 2,
  );
  check(
    "the plan is printed BEFORE anything runs",
    events.indexOf("run") >
      events.findIndex((e) => e !== "run" && e.startsWith("  compile:")),
  );
  check(
    "a stable aux: pass, pass, final pass — three pdflatex runs, the last one final",
    tex.calls.length === 3 &&
      tex.calls.at(-1).args.at(-1).includes("\\finalpass"),
  );
  check(
    "pdflatex runs IN the paper directory",
    tex.calls.every((c) => c.cwd === clean),
  );
  check(
    "🔴 pdflatex got rpp's venues directory on TEXINPUTS, trailing separator kept",
    tex.calls.every((c) => c.texinputs === `${venues}${delimiter}`),
  );

  // ── the bibtex path ───────────────────────────────────────────────────────────────────
  const cited = paper("cited", {
    "paper.tex": CLEAN_TEX,
    "refs.bib": "@misc{k, title={T}}",
  });
  const btex = fakeTex({
    aux: "\\relax\n\\citation{k}\n\\bibstyle{plain}\n\\bibdata{refs}\n",
  });
  const rb = buildPaper(cited, {
    cwd: root,
    run: btex.run,
    env: {},
    log: quiet,
  });
  check("a paper with a \\cite builds", rb.status === "built");
  const bibCalls = btex.calls.filter((c) => c.bin === "bibtex");
  check(
    "bibtex ran exactly once, on the job name",
    bibCalls.length === 1 && bibCalls[0].args.join(" ") === "paper",
  );
  check(
    "…between two pdflatex passes, and the build still ends on the final pass",
    btex.calls[0].bin === "pdflatex" &&
      btex.calls[1].bin === "bibtex" &&
      btex.calls.at(-1).args.at(-1).includes("\\finalpass"),
  );

  // ── a failing build: the error, its context, and NO stale PDF ─────────────────────────
  const broken = paper("broken", {
    "paper.tex": CLEAN_TEX,
    "paper.pdf": "%PDF-stale-from-yesterday",
  });
  const ftex = fakeTex({
    exitCode: 1,
    log: [
      "(./paper.tex",
      "./paper.tex:4: Undefined control sequence.",
      "l.4 \\foo",
      "         bar baz ",
      "Here is how much of TeX's memory you used:",
    ].join("\n"),
  });
  const rf = buildPaper(broken, {
    cwd: root,
    run: ftex.run,
    env: {},
    log: quiet,
  });
  check(
    "a pdflatex error fails the build",
    rf.status === "failed" && anyFailed([rf]),
  );
  check(
    "🔴 the stale paper.pdf is DELETED — a red build cannot leave a PDF that looks current",
    !existsSync(join(broken, "paper.pdf")),
  );
  const shown = formatResult(rf);
  check(
    "the failure names the step and the program with its exit code",
    shown.includes("✗ compile: pdflatex exited with 1"),
  );
  check(
    "…quotes the first error line and the l.NNN context from the log",
    shown.includes("./paper.tex:4: Undefined control sequence.") &&
      shown.includes("l.4 \\foo") &&
      shown.includes("bar baz"),
  );
  check("…and says the PDF was removed", /paper\.pdf removed/.test(shown));
  check("a failed pass is not retried", ftex.calls.length === 1);

  // ── pdflatex not installed ────────────────────────────────────────────────────────────
  const rm = buildPaper(clean, {
    cwd: root,
    run: fakeTex({ missing: true }).run,
    env: {},
    log: quiet,
  });
  check(
    "a missing pdflatex is a FAILURE that says what is missing, not a crash",
    rm.status === "failed" &&
      /pdflatex could not be started/.test(rm.failure.lines.join("\n")),
  );

  // ── 🔴 --dry-run runs NOTHING, checked by effect ──────────────────────────────────────
  const dryDir = paper("dry", {
    "paper.tex": CLEAN_TEX,
    "paper.pdf": "%PDF-untouched",
  });
  const dtex = fakeTex();
  const dryLog = [];
  const dry = buildPaper(dryDir, {
    cwd: root,
    run: dtex.run,
    env: {},
    dryRun: true,
    log: (l) => dryLog.push(l),
  });
  check("--dry-run: nothing was started", dtex.calls.length === 0);
  check(
    "--dry-run: the PDF on disk is untouched",
    readFileSync(join(dryDir, "paper.pdf"), "utf8") === "%PDF-untouched",
  );
  check(
    "--dry-run: the plan is printed, and the result says it did not run",
    dryLog.some((l) => l.startsWith("  compile: paper.tex")) &&
      dry.dry === true &&
      /--dry-run/.test(formatResult(dry)),
  );

  // ── no paper.tex: a REFUSAL, not a skip ───────────────────────────────────────────────
  const bare = paper("bare", { "paper.md": "# x" });
  const ntex = fakeTex();
  const nr = buildPaper(bare, {
    cwd: root,
    run: ntex.run,
    env: {},
    log: quiet,
  });
  check("no paper.tex — status no-source", nr.status === "no-source");
  check("🔴 and this COUNTS AS A FAILURE", anyFailed([nr]) === true);
  check("nothing was run for it", ntex.calls.length === 0);
  const compileLine = nr.plan.find((p) => p.step === "compile");
  check(
    "the compile step is required and did not apply",
    compileLine?.applies === false && compileLine?.required === true,
  );
  check(
    'the remedy says this is NOT "nothing to build" and names paper.tex',
    /NOT "nothing to build"/.test(remedyFor([nr])) &&
      /paper\.tex/.test(remedyFor([nr])),
  );
  check("on full success there is no remedy", remedyFor([r]) === "");

  // ── walking the corpus ────────────────────────────────────────────────────────────────
  paper("not-a-paper", { "NOTES.md": "x" });
  paper(".hidden-paper", { "PIPELINE-STATUS.md": "x" });
  const found = papersIn(join(root, "papers")).map((d) => d.split("/").pop());
  check(
    "a directory with no markers is not a paper",
    !found.includes("not-a-paper"),
  );
  check(
    "the real ones are",
    ["clean", "broken", "bare"].every((x) => found.includes(x)),
  );
  check(
    "a hidden directory is not a paper, even with a marker",
    !found.includes(".hidden-paper"),
  );
  check(
    "a nonexistent root does not crash",
    papersIn(join(root, "nope")).length === 0,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — build: rpp compiles, build.sh never runs, a red build leaves no PDF`,
);
