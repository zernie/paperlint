/**
 * Battery for `build.ts` — the shell that compiles a paper.
 *
 * Every case reintroduces a defect this command either really had or exists to prevent, and names
 * the assertion that must kill it. Two of them are checked on DISK rather than on the returned
 * object, because that is where the damage lands: a paper script that runs anyway, and a stale
 * PDF left beside a red build.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "build.ts");
const PORT = join(ROOT, "skills", "paper-pipeline", "scripts", "consumer.mjs");
const HARNESS = join(HERE, "build.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "a leftover build.sh is executed again",
        harness: HARNESS,
        expect: "the paper's build scripts were NOT executed",
        disables:
          "the decision this command is built on: rpp compiles the paper itself and never runs a " +
          "file from the paper directory. The mutation keeps the 'is ignored' note and runs the " +
          "script anyway — the worst form, because the output still claims it was ignored",
        edits: [
          [
            SRC,
            "  for (const s of facts.ignoredScripts)\n    log(`  note: ${s} is ignored — rpp builds the paper itself`);\n",
            '  for (const s of facts.ignoredScripts) {\n    log(`  note: ${s} is ignored — rpp builds the paper itself`);\n    spawnSync("bash", [join(paperDir, s)], { stdio: "ignore" });\n  }\n',
          ],
        ],
      },
      {
        name: "a failed build keeps the stale PDF",
        harness: HARNESS,
        expect: "the stale paper.pdf is DELETED",
        disables:
          "removing paper.pdf on failure. An old PDF beside a red build looks current, and 'the " +
          "PDF is there' is exactly what a human checks first",
        edits: [
          [
            SRC,
            "  rmSync(join(paperDir, `${JOB}.pdf`), { force: true });\n",
            "",
          ],
        ],
      },
      {
        name: "`--dry-run` runs the build anyway",
        harness: HARNESS,
        expect: "--dry-run: nothing was started",
        disables:
          "the one flag whose whole meaning is 'do not touch anything'. Its first version was " +
          "swallowed by options destructuring and rewrote paper.pdf while looking like a verbose " +
          "dry run",
        edits: [
          [
            SRC,
            '  if (dryRun) return { dir, status: "built", plan, dry: true };\n',
            "",
          ],
        ],
      },
      {
        name: "TEXINPUTS loses its trailing separator",
        harness: HARNESS,
        expect: "with no TEXINPUTS set, the value ENDS in the separator",
        disables:
          "the empty element that tells kpathsea 'and then the system tree'. Without it " +
          "article.cls stops resolving, and every paper fails for a reason unrelated to it",
        edits: [
          [
            SRC,
            '    TEXINPUTS: [...dirs, env.TEXINPUTS ?? ""].join(delimiter),',
            "    TEXINPUTS: [...dirs, ...(env.TEXINPUTS ? [env.TEXINPUTS] : [])].join(delimiter),",
          ],
        ],
      },
      {
        name: "the port resolves the venues directory one level off",
        harness: HARNESS,
        expect: "the venues directory is rpp's own and holds paper-guards.tex",
        disables:
          "the one answer to 'where are rpp's venue files'. A wrong directory does not fail " +
          "pdflatex by itself — \\input{paper-guards} would fail later, in a paper, far from here",
        edits: [
          [
            PORT,
            '"../../submit-paper/references/venues"',
            '"../../submit-paper/references"',
          ],
        ],
      },
      {
        name: "a paper with no paper.tex stops being a refusal",
        harness: HARNESS,
        expect: "no paper.tex — status no-source",
        disables:
          "'nothing to compile' as a failure. Reading it as 'built' is the green run over an " +
          "unbuilt paper this command was written against",
        edits: [
          [
            SRC,
            "  if (plan.some((p) => !p.applies && p.required))",
            "  if (plan.some((p) => !p.applies && p.required && false))",
          ],
        ],
      },
      {
        name: "the final pass stops defining \\finalpass",
        harness: HARNESS,
        expect: "the FINAL pass defines \\finalpass",
        disables:
          "the switch that arms paper-guards.tex. Without it an undefined \\ref or \\cite builds " +
          "green and ships as '??' in the PDF",
        edits: [
          [
            SRC,
            "        `\\\\def\\\\finalpass{}\\\\input{${MAIN}}`,\n",
            "        MAIN,\n",
          ],
        ],
      },
      {
        name: "the failure drops the log excerpt",
        harness: HARNESS,
        expect:
          "…quotes the first error line and the l.NNN context from the log",
        disables:
          "the reason a failure is actionable: the error line and where in the source it is. " +
          "'pdflatex exited with 1' alone sends the author to a 2 000-line log",
        edits: [
          [
            SRC,
            '          ...(end.lines.length\n            ? end.lines\n            : ["(no error line found in the log)"]),\n',
            '          "(no error line found in the log)",\n',
          ],
        ],
      },
      {
        name: "an attempt is compiled without the seed, so bibtex runs again",
        harness: HARNESS,
        expect: "bibtex ran ONCE, in the compile step",
        disables:
          "telling the loop the .bbl is already produced. Unseeded, the first pass reads the aux, " +
          "bibtex regenerates the .bbl, and the \\balance just inserted is erased before any page " +
          "sees it — every position then measures as the unbalanced build",
        edits: [
          [SRC, "  const c = compile(ctx, seed);", "  const c = compile(ctx);"],
        ],
      },
      {
        name: "no position works, and the build still succeeds",
        harness: HARNESS,
        expect: "no position works — the BUILD FAILS",
        disables:
          "failing on the defect a publisher already returned a paper for. A green build with an " +
          "unbalanced PDF is the success that hides it",
        edits: [
          [
            SRC,
            "      restore(scan.ctx.paperDir, scan.snap);\n      return {\n        ok: false,\n        lines: describeFailedScan(",
            "      restore(scan.ctx.paperDir, scan.snap);\n      return {\n        ok: true,\n        lines: describeFailedScan(",
          ],
        ],
      },
      {
        name: "a failed scan leaves the last attempt's .bbl behind",
        harness: HARNESS,
        expect: "with no stray \\balance",
        disables:
          "restoring bibtex's .bbl. The next plain pdflatex run would read a \\balance at whatever " +
          "position was tried last",
        edits: [
          [
            SRC,
            '    if (step.kind === "none") {\n      restore(scan.ctx.paperDir, scan.snap);\n',
            '    if (step.kind === "none") {\n',
          ],
        ],
      },
      {
        name: "a missing pdftotext reads as nothing to measure",
        harness: HARNESS,
        expect: "a missing pdftotext FAILS the build",
        disables:
          "the difference between 'could not measure' and 'balanced'. extract-pdf-facts returns " +
          "null for a missing tool; here that would build green without looking",
        edits: [
          [
            SRC,
            '  if (r.error)\n    return {\n      ok: false,\n      lines: [\n        "pdftotext could not be started',
            '  if (r.error)\n    return {\n      ok: true,\n      m: { pages: 0, columns: null, overfull: 0, secondColumn: false },\n      lines: [\n        "pdftotext could not be started',
          ],
        ],
      },
      {
        name: "an already balanced page is scanned anyway",
        harness: HARNESS,
        expect: "already balanced is left alone",
        disables:
          "the cheap exit. A paper that needs nothing would pay two pdflatex passes per position " +
          "and get a \\balance it did not need",
        edits: [
          [SRC, "    if (isBalanced(built.columns, tol))", "    if (false)"],
        ],
      },
    ],
  }),
);
