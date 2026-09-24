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
  buildPapers,
  papersIn,
  formatResult,
  anyFailed,
  remedyFor,
  parseDocumentclass,
  hasBibliography,
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
  noPdf = false,
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
      // `noPdf`: what real pdflatex does on a document with no pages — "No pages of output.", exit 0.
      if (exitCode === 0 && !noPdf)
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

  // ── 🔴 A STALE PDF NEVER SURVIVES A RUN THAT DID NOT REPLACE IT — every path of buildPapers ──
  // The order matters for the battery: the up-front removal is killed by the no-engine case, the
  // existence check by the empty document, and neither case depends on the other defence.
  const REMOVED =
    "paper.pdf removed — a stale PDF must not pass for this build";

  // (b) no qualifying engine: the command stops before any paper is built.
  const noEng = paper("no-engine", {
    "paper.tex": CLEAN_TEX,
    "paper.pdf": "%PDF-stale-from-yesterday",
  });
  const neTex = fakeTex();
  const neLog = [];
  let pdfWhenEngineAsked = null;
  const ne = await buildPapers([noEng], {
    cwd: root,
    run: neTex.run,
    env: {},
    log: (l) => neLog.push(l),
    engine: async () => {
      pdfWhenEngineAsked = existsSync(join(noEng, "paper.pdf"));
      return null;
    },
  });
  check(
    "🔴 no engine: the stale paper.pdf is removed BEFORE the engine is resolved",
    pdfWhenEngineAsked === false && !existsSync(join(noEng, "paper.pdf")),
  );
  check(
    "no engine: the run stops — nothing compiled, no results",
    ne.kind === "no-engine" && neTex.calls.length === 0,
  );
  check(
    "no engine: the run says so, with the line a failed build prints",
    neLog.includes(`papers/no-engine: ${REMOVED}`),
  );

  // (c) no paper.tex: refused, and a PDF left from some earlier build goes too.
  const bareStale = paper("bare-stale", {
    "paper.md": "# x",
    "paper.pdf": "%PDF-stale-from-yesterday",
  });
  const bsTex = fakeTex();
  const bsLog = [];
  const bs = await buildPapers([bareStale, bare], {
    cwd: root,
    run: bsTex.run,
    env: {},
    log: (l) => bsLog.push(l),
    engine: async () => ({}),
  });
  check(
    "🔴 no-source: the stale paper.pdf is GONE",
    bs.kind === "ran" &&
      bs.results[0].status === "no-source" &&
      !existsSync(join(bareStale, "paper.pdf")),
  );
  check(
    "no-source: the refusal says the PDF was removed…",
    bsLog.includes(`  ✗ nothing to compile: no paper.tex\n      ${REMOVED}`),
  );
  check(
    "…and a paper that had no PDF is not told one was removed",
    bsLog.includes("  ✗ nothing to compile: no paper.tex") &&
      bs.results[1].staleRemoved === false,
  );

  // (d) --dry-run: no side effect, including this one.
  const dryStale = paper("dry-stale", {
    "paper.tex": CLEAN_TEX,
    "paper.pdf": "%PDF-untouched",
  });
  const dsTex = fakeTex();
  const ds = await buildPapers([dryStale], {
    cwd: root,
    run: dsTex.run,
    env: {},
    dryRun: true,
    log: quiet,
    engine: async () => ({}),
  });
  // Read only if present: a deleted file must fail THIS assertion, not throw ENOENT before it.
  const bodyOf = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
  check(
    "🔴 buildPapers --dry-run: the PDF on disk is untouched, and nothing ran",
    bodyOf(join(dryStale, "paper.pdf")) === "%PDF-untouched" &&
      dsTex.calls.length === 0 &&
      ds.kind === "ran" &&
      ds.results[0].dry === true,
  );

  // A success replaces the stale PDF and says nothing about removing it.
  const fresh = paper("fresh", {
    "paper.tex": CLEAN_TEX,
    "paper.pdf": "%PDF-stale-from-yesterday",
  });
  const frLog = [];
  const fr = await buildPapers([fresh], {
    cwd: root,
    run: fakeTex().run,
    env: {},
    log: (l) => frLog.push(l),
    engine: async () => ({}),
  });
  check(
    "a success: the PDF on disk is the one this run wrote, and nothing says 'removed'",
    fr.kind === "ran" &&
      fr.results[0].status === "built" &&
      bodyOf(join(fresh, "paper.pdf")) === "%PDF-fake" &&
      !frLog.some((l) => l.includes("removed")),
  );

  // (a) pdflatex exits 0 and writes no PDF — an empty document.
  const empty = paper("empty", {
    "paper.tex": "\\documentclass{article}\\begin{document}\\end{document}",
  });
  const emLog = [];
  const em = await buildPapers([empty], {
    cwd: root,
    run: fakeTex({ noPdf: true }).run,
    env: {},
    log: (l) => emLog.push(l),
    engine: async () => ({}),
  });
  check(
    "🔴 empty document: pdflatex exit 0 with no PDF FAILS the build",
    em.kind === "ran" &&
      em.results[0].status === "failed" &&
      em.results[0].failure.step === "compile" &&
      anyFailed(em.results),
  );
  const emShown = emLog.join("\n");
  check(
    "empty document: no ✓, and the failure says what happened and asks the question",
    !emShown.includes("✓") &&
      emShown.includes(
        "✗ compile: pdflatex exited 0 but wrote no paper.pdf — does the document have any pages?",
      ),
  );

  // ── the balance step ──────────────────────────────────────────────────────────────────
  check(
    "\\bibliography{refs} is a bibliography",
    hasBibliography("\\begin{document}x\\bibliography{refs}\\end{document}"),
  );
  check(
    "a commented-out \\bibliography is not",
    !hasBibliography(
      "% \\bibliography{refs}\n\\begin{document}x\\end{document}",
    ),
  );
  check(
    "a paper that only REDEFINES the command does not call it",
    !hasBibliography(
      "\\let\\old\\bibliography\n\\renewcommand{\\bibliography}[1]{\\old{#1}}\n",
    ),
  );

  const ACM_TEX = [
    "\\documentclass[sigconf]{acmart}",
    "\\begin{document}x\\cite{k0}",
    "\\bibliography{refs}",
    "\\end{document}",
  ].join("\n");
  /** `pdftotext -bbox` for a two-page PDF whose last page has columns `left` / `right` pt high. */
  const bboxFor = ([left, right]) => {
    const col = (x, h) =>
      Array.from({ length: 40 }, (_, i) => {
        const y = 60 + (h * i) / 39;
        return `<word xMin="${x}" yMin="${y}" xMax="${x + 30}" yMax="${y}">w</word>`;
      }).join("\n");
    return [
      '<doc><page width="612.000000" height="792.000000">p1</page>',
      `<page width="612.000000" height="792.000000">${col(60, left)}\n${col(330, right)}</page></doc>`,
    ].join("\n");
  };
  /**
   * A fake TeX that knows where `\balance` sits in the `.bbl`. pdflatex records, for every pass,
   * how many `\balance` lines the `.bbl` held and before which `\bibitem`; the PDF it writes carries
   * that position, and the fake pdftotext answers with balanced columns only for `accept`.
   */
  function balanceTex({
    items = 5,
    accept = [],
    secondColumn = [],
    overfullAt = [],
    alreadyBalanced = false,
    noPdftotext = false,
  } = {}) {
    const calls = [];
    const where = (cwd) => {
      const p = join(cwd, "paper.bbl");
      if (!existsSync(p)) return { count: 0, position: -1 };
      const lines = readFileSync(p, "utf8").split("\n");
      const at = lines.indexOf("\\balance");
      return {
        count: lines.filter((l) => l === "\\balance").length,
        position:
          at < 0
            ? -1
            : lines.slice(0, at).filter((l) => l.startsWith("\\bibitem"))
                .length,
      };
    };
    const run = (bin, args, opts) => {
      const w = where(opts.cwd);
      calls.push({ bin, args, ...w });
      if (bin === "pdflatex") {
        writeFileSync(
          join(opts.cwd, "paper.aux"),
          "\\relax\n\\citation{k0}\n\\bibstyle{plain}\n\\bibdata{refs}\n",
        );
        const log = [];
        // Without an insertion, acmart's own \AtEndDocument\balance runs in the second column.
        if (w.position < 0 || secondColumn.includes(w.position))
          log.push(
            "Package balance Warning: You have called \\balance in second column",
          );
        if (overfullAt.includes(w.position))
          log.push(
            "Overfull \\hbox (8.0pt too wide) in paragraph at lines 1--2",
          );
        writeFileSync(join(opts.cwd, "paper.log"), log.join("\n"));
        writeFileSync(
          join(opts.cwd, "paper.pdf"),
          `%PDF-fake pos=${w.position}`,
        );
        return { status: 0, stdout: "", stderr: "" };
      }
      if (bin === "bibtex") {
        writeFileSync(
          join(opts.cwd, "paper.bbl"),
          [
            "\\begin{thebibliography}{9}",
            ...Array.from(
              { length: items },
              (_, i) => `\\bibitem[K${i}]{k${i}}\nEntry ${i}.`,
            ),
            "\\end{thebibliography}",
            "",
          ].join("\n"),
        );
        return { status: 0, stdout: "This is BibTeX\n", stderr: "" };
      }
      if (bin === "pdftotext") {
        if (noPdftotext)
          return {
            error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
            status: null,
          };
        const pos = Number(
          /pos=(-?\d+)/.exec(
            readFileSync(join(opts.cwd, "paper.pdf"), "utf8"),
          )?.[1],
        );
        const balanced =
          (pos < 0 && alreadyBalanced) ||
          accept.includes(pos) ||
          secondColumn.includes(pos);
        return {
          status: 0,
          stdout: bboxFor(balanced ? [464.2, 461.5] : [625.2, 303.8]),
          stderr: "",
        };
      }
      return { status: 99 };
    };
    return { run, calls };
  }
  const acmPaper = (name) =>
    paper(name, { "paper.tex": ACM_TEX, "refs.bib": "@misc{k0, title={T}}" });

  // Position 0 comes out balanced but "in the second column"; 1 adds an overfull box; 2 is clean.
  const balDir = acmPaper("balance-found");
  const bt = balanceTex({ accept: [1, 2], secondColumn: [0], overfullAt: [1] });
  const balLog = [];
  const bal = buildPaper(balDir, {
    cwd: root,
    run: bt.run,
    env: {},
    log: (l) => balLog.push(l),
    progress: quiet,
  });
  check(
    "balance: the plan names the step and why it applies",
    balLog.includes(
      "  balance: acmart sigconf is two-column — will place \\balance in the bibliography",
    ) && bal.plan.map((p) => p.step).join(",") === "inputs,compile,balance",
  );
  check(
    "🔴 balance: bibtex ran ONCE, in the compile step — an attempt never regenerates (and erases) the insertion",
    bt.calls.filter((c) => c.bin === "bibtex").length === 1,
  );
  check("balance: a paper that CAN be balanced builds", bal.status === "built");
  const tries = bt.calls.filter((c) => c.bin === "pdflatex" && c.position >= 0);
  check(
    "balance: positions tried in order, first to last, stopping at the first acceptable",
    JSON.stringify([...new Set(tries.map((c) => c.position))]) === "[0,1,2]",
  );
  check(
    "🔴 balance: every pass saw EXACTLY ONE \\balance — each attempt starts from bibtex's .bbl",
    tries.every((c) => c.count === 1),
  );
  check(
    "balance: an attempt whose aux settles at once is two pdflatex passes",
    tries.length === 3 * 2,
  );
  check(
    "🔴 balance: the balanced build ENDS on the \\finalpass pass — paper-guards judges it too",
    bt.calls
      .filter((c) => c.bin === "pdflatex")
      .at(-1)
      .args.at(-1)
      .includes("\\finalpass") &&
      bt.calls.filter((c) => c.bin === "pdflatex").at(-1).position === 2,
  );
  check(
    "balance: the .bbl on disk is the one that made the PDF — \\balance before \\bibitem #3",
    readFileSync(join(balDir, "paper.bbl"), "utf8").includes(
      "\\balance\n\\bibitem[K2]",
    ),
  );
  const balShown = formatResult(bal);
  check(
    "balance: the result names the position, both heights, and what it cost",
    balShown.includes("\\balance before \\bibitem #3 of 5") &&
      balShown.includes("last page 464.2 / 461.5 pt (was 625.2 / 303.8 pt)") &&
      balShown.includes("3 positions tried, 6 pdflatex passes"),
  );

  // No position works: the build FAILS, the PDF goes, and bibtex's .bbl comes back.
  const noneDir = acmPaper("balance-none");
  const none = buildPaper(noneDir, {
    cwd: root,
    run: balanceTex({ accept: [] }).run,
    env: {},
    log: quiet,
    progress: quiet,
  });
  check(
    "🔴 balance: no position works — the BUILD FAILS at the balance step",
    none.status === "failed" &&
      none.failure.step === "balance" &&
      anyFailed([none]),
  );
  check(
    "balance: …the failure says what was tried and the unbalanced heights",
    /tried 5 of 5 \\bibitem positions/.test(none.failure.lines.join("\n")) &&
      none.failure.lines.join("\n").includes("625.2 / 303.8 pt"),
  );
  check(
    "🔴 balance: …the unbalanced PDF is removed",
    !existsSync(join(noneDir, "paper.pdf")),
  );
  check(
    "balance: …and the .bbl is bibtex's again, with no stray \\balance",
    !readFileSync(join(noneDir, "paper.bbl"), "utf8").includes("\\balance"),
  );

  // Already balanced: measured once, nothing rebuilt.
  const okDir = acmPaper("balance-already");
  const ok = balanceTex({ alreadyBalanced: true });
  const okr = buildPaper(okDir, {
    cwd: root,
    run: ok.run,
    env: {},
    log: quiet,
    progress: quiet,
  });
  check(
    "balance: a last page that is already balanced is left alone — no extra pass",
    okr.status === "built" &&
      /already balanced, 464\.2 \/ 461\.5 pt/.test(formatResult(okr)) &&
      ok.calls.every((c) => c.position < 0),
  );

  // pdftotext missing: a failure that names it, not "balanced".
  const ptDir = acmPaper("balance-no-pdftotext");
  const pt = buildPaper(ptDir, {
    cwd: root,
    run: balanceTex({ noPdftotext: true }).run,
    env: {},
    log: quiet,
    progress: quiet,
  });
  check(
    "🔴 balance: a missing pdftotext FAILS the build and says so — 'could not measure' is not 'balanced'",
    pt.status === "failed" &&
      /pdftotext could not be started/.test(pt.failure.lines.join("\n")),
  );

  // A one-column paper: the step is skipped in the plan, and nothing is measured.
  const oneDir = paper("balance-one-column", {
    "paper.tex": ACM_TEX.replace("[sigconf]", "[acmsmall]"),
    "refs.bib": "@misc{k0, title={T}}",
  });
  const one = balanceTex();
  const oneLog = [];
  const oner = buildPaper(oneDir, {
    cwd: root,
    run: one.run,
    env: {},
    log: (l) => oneLog.push(l),
    progress: quiet,
  });
  check(
    "balance: a one-column paper — skipped in the plan, with why",
    oneLog.includes(
      "  balance: skipped — acmart acmsmall is one-column; there is no last page to balance",
    ) && oner.status === "built",
  );
  check(
    "balance: …and nothing measured it",
    one.calls.every((c) => c.bin !== "pdftotext"),
  );

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
