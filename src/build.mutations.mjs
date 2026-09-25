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
          "the decision this command is built on: paperlint compiles the paper itself and never runs a " +
          "file from the paper directory. The mutation keeps the 'is ignored' note and runs the " +
          "script anyway — the worst form, because the output still claims it was ignored",
        edits: [
          [
            SRC,
            "  for (const s of facts.ignoredScripts)\n    log(`  note: ${s} is ignored — paperlint builds the paper itself`);\n",
            '  for (const s of facts.ignoredScripts) {\n    log(`  note: ${s} is ignored — paperlint builds the paper itself`);\n    spawnSync("bash", [join(paperDir, s)], { stdio: "ignore" });\n  }\n',
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
            '      removePdf(paperDir);\n      return {\n        dir,\n        status: "failed",',
            '      return {\n        dir,\n        status: "failed",',
          ],
        ],
      },
      {
        name: "the stale PDF is no longer removed before the engine is resolved",
        harness: HARNESS,
        expect:
          "no engine: the stale paper.pdf is removed BEFORE the engine is resolved",
        disables:
          "the one up-front removal. Without it every path that ends before a step — no " +
          "qualifying TeX Live, no paper.tex — leaves yesterday's PDF looking like today's",
        edits: [
          [
            SRC,
            "  const stale = new Set(dryRun ? [] : targets.filter(removePdf));",
            "  const stale = new Set<string>();",
          ],
        ],
      },
      {
        name: "`--dry-run` removes the stale PDF too",
        harness: HARNESS,
        expect: "buildPapers --dry-run: the PDF on disk is untouched",
        disables:
          "the dry-run guard on the up-front removal. A plan that deletes the author's PDF is " +
          "not a plan",
        edits: [
          [
            SRC,
            "  const stale = new Set(dryRun ? [] : targets.filter(removePdf));",
            "  const stale = new Set(targets.filter(removePdf));",
          ],
        ],
      },
      {
        name: "pdflatex exit 0 with no PDF counts as built",
        harness: HARNESS,
        expect: "empty document: pdflatex exit 0 with no PDF FAILS the build",
        disables:
          "the existence check. An empty document compiles with exit 0 and no output, and the " +
          "result line would print a green paper.pdf that does not exist",
        edits: [
          [
            SRC,
            "    if (!existsSync(join(ctx.paperDir, `${JOB}.pdf`)))",
            "    if (false)",
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
    ],
  }),
);
