/**
 * Battery for `rpp doctor`.
 *
 * The subject here is unusual and therefore fragile: doctor is a check ABOUT A CHECK. Broken,
 * it prints a column of checkmarks and exits zero — i.e. it fails in exactly the way it was
 * written to catch. Every case below reintroduces one of those silent failures.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "doctor.ts");
const HARNESS = join(HERE, "doctor.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "comparing the two roots stops meaning anything",
        harness: HARNESS,
        expect: "writes pass the guard unseen",
        disables:
          "the only reason this command exists. A mismatch between what the CLI lints and what " +
          "the hook guards is a silent hole: both sides look installed and green, while writes " +
          "into real papers pass the gate unseen",
        edits: [
          [
            SRC,
            "    const same = resolve(root, cliPapers) === resolve(root, hookSays);",
            "    const same = true;",
          ],
        ],
      },
      {
        name: "the hook's root is retold instead of asked for",
        harness: HARNESS,
        expect: "doctor prints EXACTLY what the hook returned",
        disables:
          "the defense against a SECOND COPY OF THE LOGIC — exactly the defect this command " +
          "exists to report. A retelling drifts from the original silently and prints a " +
          "confident wrong answer: here it loses the trailing-slash trim the hook does on purpose",
        edits: [
          [
            SRC,
            "  const hookRoot = rawPkg ? papersRoot(rawPkg) : null;",
            '  const hookRoot = rawPkg ? (JSON.parse(rawPkg)?.["research-paper-pipeline"]?.papers ?? "papers") : null;',
          ],
        ],
      },
      {
        name: "a missing external program starts failing the run",
        harness: HARNESS,
        expect: "a missing tex install does NOT fail the run",
        disables:
          "the distinction between a fact and a verdict. Which programs are needed depends on " +
          "which skills you use; a command that fails on advice gets piped into `|| true` or " +
          "/dev/null entirely, taking the real binary findings it was written for down with it",
        edits: [
          [
            SRC,
            "      out.push(`      ${p.install}`);",
            "      out.push(`      ${p.install}`);\n      bad++;",
          ],
        ],
      },
      {
        name: "detection loses the root and returns the papers themselves",
        harness: HARNESS,
        expect: "finds the root by a marker inside a subdirectory",
        disables:
          "the whole point of the hint. A config pointing at ONE document instead of a " +
          "directory passes every check and lints one paper out of ten — while reporting clean",
        edits: [
          [
            SRC,
            "      if (isPapersRoot) hits.push(relative(cwd, here));",
            "      if (isPapersRoot) hits.push(...children.filter((c) => c.isDirectory()).map((c) => relative(cwd, join(here, c.name))));",
          ],
        ],
      },
      {
        name: "the papers themselves get mixed into the found root",
        harness: HARNESS,
        expect: "it is the ROOT, not the paper itself",
        disables:
          "the distinction between a papers directory and a paper. The root stays in the list, " +
          'so the neighboring "found by marker" check notices nothing — while a config built ' +
          "from such a hint points at one document and lints one paper out of ten, reporting clean",
        edits: [
          [
            SRC,
            "      if (isPapersRoot) hits.push(relative(cwd, here));",
            "      if (isPapersRoot) hits.push(relative(cwd, here), ...children.filter((c) => c.isDirectory()).map((c) => relative(cwd, join(here, c.name))));",
          ],
        ],
      },
      {
        name: "the walk stops skipping node_modules",
        harness: HARNESS,
        expect: "node_modules is not searched",
        disables:
          "the boundary between your own papers and someone else's. Any installed dependency " +
          "carrying paper examples gets mistaken for the consumer's directory, and the hint " +
          "points the config into node_modules",
        edits: [
          [
            SRC,
            'const skip = new Set(["node_modules", ".git", "dist", "_build", ".claude"]);',
            "const skip = new Set();",
          ],
        ],
      },
      {
        name: "a missing declaration is reported as all-clear",
        harness: HARNESS,
        expect: "the missing declaration is NAMED, not skipped",
        disables:
          "the only trace of issue #33 left on an install that STILL works: `rpp init` writes " +
          "one file, the hook reads another, and the directories matching up rests on the " +
          "default. A cheerful checkmark instead of a warning turns a coincidence into a confirmation",
        edits: [
          [
            SRC,
            '        ? `  ⚠ package.json has no "${CONFIG_KEY}": { "papers": … } — the hooks fall back to "${DEFAULT_PAPERS_ROOT}"`',
            "        ? `  ✓ package.json`",
          ],
        ],
      },
      {
        name: "an unlinked skill is folded into the checkmark",
        harness: HARNESS,
        expect: "an unlinked skill is NAMED",
        disables:
          "the one place a consumer learns that `/paper-pipeline` is missing. Claude Code does not " +
          "look in node_modules, so an install without links has no skills at all and says nothing",
        edits: [
          [
            SRC,
            '    const gaps = links.links.filter((l) => l.status !== "present");',
            '    const gaps = links.links.filter((l) => l.status === "foreign");',
          ],
        ],
      },
      {
        name: "an unlinked skill starts failing the run",
        harness: HARNESS,
        expect: "an unlinked skill does NOT fail the run",
        disables:
          "the line between a fact and a verdict. A consumer who keeps their own skill under the " +
          "same name would get a red doctor — and a red `init` — for a decision init itself respected",
        edits: [
          [
            SRC,
            "      out.push(`      \\`npx rpp init\\` links the missing ones; it never replaces an entry it did not make`);",
            "      out.push(`      \\`npx rpp init\\` links the missing ones; it never replaces an entry it did not make`);\n      bad++;",
          ],
        ],
      },
    ],
  }),
);
