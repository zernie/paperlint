/**
 * Battery for the utility. Three of the first five mutations reintroduce defects it ALREADY
 * had, found by the first run rather than by reading — so without these assertions the
 * regression would be silent.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = join(HERE, "cli.ts");
const HARNESS = join(HERE, "cli.harness.mjs");
// The `bin/rpp.mjs` shim — the package's EXECUTABLE file, and after the move to TypeScript the
// "was I run or was I imported" check lives right there: `dist/cli.js` is now always imported,
// so a mutation in it about the symlink proves nothing. The first run after the move showed
// this literally — the mutation SURVIVED, and it looked like a hole in the harness, when the
// hole was in what the mutation was aimed at.
const SHIM = join(HERE, "..", "bin", "rpp.mjs");
// `init` stopped being twenty lines inside `cli.ts` and became its own module: it has four
// decisions, and each must be able to break in a way that EXACTLY its own assertion notices.
const INIT = join(HERE, "init.ts");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the main-module check goes back to comparing STRINGS",
        harness: HARNESS,
        expect:
          "through a SYMLINK the utility works, rather than silently exiting zero",
        disables:
          "the only way a consumer ever calls the utility. npm puts a SYMLINK in .bin, for " +
          "which process.argv[1] and import.meta.url are different paths; comparing strings " +
          "makes the condition false and the utility SILENTLY exits zero. A direct " +
          "`node bin/rpp.mjs` still works, meanwhile, so the defect is invisible in exactly the " +
          "way it is normally checked",
        edits: [
          [
            SHIM,
            "if (isMain(import.meta.url))",
            "if (import.meta.url === `file://${process.argv[1]}`)",
          ],
        ],
      },
      {
        name: "argv[0] unconditionally becomes the command again",
        harness: HARNESS,
        expect: "`--help` as the first argument — is a FLAG, not a command",
        disables:
          "parsing a flag in the command position. The real defect: `rpp --help` used to " +
          'answer "unknown command `--help`" — i.e. the very first command a new user types ' +
          "told them it did not exist",
        edits: [
          [
            CLI,
            'if (rest[0] && !rest[0].startsWith("-")) out.cmd = rest.shift() ?? null;',
            "out.cmd = rest.shift() ?? null;",
          ],
        ],
      },
      {
        name: "a valueless flag silently turns into a default again",
        harness: HARNESS,
        expect: "a flag with no value — a FAILURE, not a silent default",
        disables:
          'the distinction between "no config was set" and "a config was set, but its value ' +
          'got lost". The latter happens from a typo and from a CI substitution collapsing to ' +
          "empty, and without a failure the run falls into autodiscovery and lints the WRONG " +
          "file without saying a word about it",
        edits: [[CLI, "  if (a.missingValue) {", "  if (false) {"]],
      },
      {
        name: "scope gets a default again",
        harness: HARNESS,
        expect:
          "`lint` with NO path AND no config refuses and names BOTH ways out",
        disables:
          'the "scope is named by the caller" contract. With a default, a user who never ' +
          "thought about scope gets a green run over whatever happens to be lying in the directory",
        edits: [[CLI, "if (paths.length === 0) {", "if (false) {"]],
      },
      {
        name: "the GUARD AGAINST A GREEN ZERO is removed",
        harness: HARNESS,
        expect: "an empty set — a FAILURE, not a green zero",
        disables:
          'the distinction between "no findings" and "not one rule got a single file". These ' +
          "two states are byte-for-byte identical in the output, and the second reads as success",
        edits: [[CLI, "if (results.length === 0) {", "if (false) {"]],
      },
      {
        name: "ESLint's exception stops being caught again",
        harness: HARNESS,
        expect:
          "the utility does NOT let an exception escape — a failure is declared by the exit code",
        disables:
          "the explainability of a failure. The real defect: on an empty set ESLint THROWS a " +
          "NoFilesFoundError, the guard never lived long enough to reach its own check, and " +
          "instead of a message a stack trace flew out of the depths of eslint-helpers.js",
        edits: [
          [
            CLI,
            '    if (\n      fail?.messageTemplate === "file-not-found" ||\n      /No files matching/i.test(fail?.message ?? "")\n    )\n      results = [];\n    else throw e;',
            "    throw e;",
          ],
        ],
      },
      {
        name: "the declaration stops reaching package.json again",
        harness: HARNESS,
        expect:
          "🔴 THE DECLARATION SHOWS UP IN package.json — the file the hooks read",
        disables:
          "the whole reason this command was rewritten (#33). A hook does not import code and " +
          "cannot walk up the tree — it reads a path it is able to name, and that path is " +
          "package.json. Without writing there, the install looks like it succeeded, while " +
          "`paper-edit-guard` guards the default",
        edits: [
          [
            INIT,
            '  writeFileSync(\n    path,\n    JSON.stringify(pkg, null, 2) + (raw.endsWith("\\n") ? "\\n" : ""),\n    "utf8",\n  );',
            "  void pkg;",
          ],
        ],
      },
      {
        name: "the papers directory is GUESSED again instead of measured",
        harness: HARNESS,
        expect:
          "🔴 and its value is MEASURED, not taken from the `papers` default",
        disables:
          "measuring instead of guessing. The declaration still gets WRITTEN — i.e. the failure " +
          "is one-sided and points toward a confident wrong answer: the file says `papers`, the " +
          "papers live somewhere else, and both commands stay silent about it",
        edits: [
          [
            INIT,
            "  const candidates = detectPapers(root);",
            "  const candidates = [];",
          ],
        ],
      },
      {
        name: "someone else's value in the declaration gets overwritten again",
        harness: HARNESS,
        expect:
          "🔴 an already-declared value stays intact byte for byte — silently replacing a setting is worse than doing nothing",
        disables:
          "the ban on silently replacing a consumer's setting. They keep trusting the old " +
          "value, because nobody told them it changed",
        edits: [
          [
            INIT,
            '  if (existing !== undefined) return { status: "kept", path, papers: existing };',
            '  if (false) return { status: "kept", path, papers: existing };',
          ],
        ],
      },
      {
        name: "init CREATES the second rpp.json carrier again",
        harness: HARNESS,
        expect:
          "🔴 `rpp.json` IS NO LONGER CREATED — a second declaration is what doctor exists to catch",
        disables:
          '"one declaration". Two carriers drift apart silently — this is defect #33, ' +
          "reintroduced by the very install command meant to fix it",
        edits: [
          [
            INIT,
            '  if (!existsSync(path)) return "absent";',
            '  if (!existsSync(path)) writeFileSync(path, "{}\\n", "utf8");',
          ],
        ],
      },
      {
        name: "the default that was taken stops being named",
        harness: HARNESS,
        expect:
          "🔴 not a terminal — the question is NOT asked, and the default taken is NAMED",
        disables:
          'half the "don\'t ask in CI" rule: not asking is not enough, it must say WHICH ' +
          'default was taken. A silent skip reads as "there was never a question"',
        edits: [
          [
            INIT,
            "  else\n    log(\n      `  · stdin is not a terminal, so nothing was asked. Default taken: NO file written.`,\n    );",
            "  else log(`  · skipped`);",
          ],
        ],
      },
      {
        name: "the answer to the question is ignored",
        harness: HARNESS,
        expect:
          "🔴 the human's answer DECIDES, it does not just decorate the output",
        disables:
          "the point of the one question that gets asked. The prompt is printed, the answer is " +
          "read and discarded — i.e. there is an interface with no decision behind it",
        edits: [
          [
            INIT,
            '  const picked = candidates[Number((answer ?? "").trim()) - 1];',
            "  const picked = candidates[0];",
          ],
        ],
      },
      {
        name: "an interrupted question crashes the command again",
        harness: HARNESS,
        expect:
          "🔴 an interrupted question does NOT crash the command — it means the default",
        disables:
          "handling Ctrl+D. MEASURED 09-18 on a real pseudo-terminal: readline's `question()` " +
          "REJECTS with `AbortError: Aborted with Ctrl+D`, and the exception used to escape " +
          "AFTER the declaration had been written — the install both succeeded and looked like " +
          "a crash",
        edits: [
          [
            INIT,
            "  try {\n    return await ask(question);\n  } catch {\n    return null;\n  }",
            "  return await ask(question);",
          ],
        ],
      },
      {
        name: "init stops ending with doctor",
        harness: HARNESS,
        expect:
          "init ends with doctor's report: the install vouches for its OWN state",
        disables:
          'the one thing that distinguishes "installed" from "actually guarding": ' +
          "`paper-edit-guard` is silent both when it works and when it guards nothing. Without " +
          "the final doctor, init reports cheerfully on a state it never measured",
        edits: [
          [
            INIT,
            "  const code = doctor({ log, cwd: root, projectDir: root, run, cliPapers });",
            "  const code = 0;",
          ],
        ],
      },
      {
        name: "a missing package.json stops being a failure",
        harness: HARNESS,
        expect:
          "without package.json init FAILS and carries a remedy, not just a diagnosis",
        disables:
          "the loudness of a failure where there is NOWHERE to write. A silent zero here is an " +
          "install that never happened and reported success",
        edits: [
          [
            INIT,
            "    err(\n      `      package.json. Run \\`npm init -y\\` here, then \\`npx rpp init\\` again.`,\n    );\n    return 2;",
            "    return 0;",
          ],
        ],
      },
      {
        name: "a missing program is named with no remedy",
        harness: HARNESS,
        expect:
          "🔴 and it carries the INSTALL COMMAND — a remedy, not just a diagnosis",
        disables:
          'the second half of the "install nothing on the user\'s behalf" rule. A diagnosis ' +
          "with no remedy leaves the person exactly where they stood: the program is missing, " +
          "and what to type is unknown",
        edits: [
          [
            INIT,
            "    for (const cmd of [...new Set(missing.map((p) => p.install))])\n      log(`        ${cmd}`);",
            "    void missing;",
          ],
        ],
      },
      {
        name: "absences stop being named by name",
        harness: HARNESS,
        expect: "every absence is NAMED, and the count matches the names",
        disables:
          'the link between the NUMBER and the NAMES in one line. "Programs are missing" with ' +
          "no names means going to hunt for them in another report, and a counter with no names " +
          "is exactly the counter that promises coverage and renders no verdict",
        edits: [
          [
            INIT,
            '    log(\n      `  ✗ ${String(missing.length)} of ${String(PROGRAMS.length)} missing: ` +\n        missing.map((p) => p.bin).join(", "),\n    );',
            "    log(`  ✗ some programs are missing`);",
          ],
        ],
      },
      {
        name: "the utility goes back to reading only rpp.json",
        harness: HARNESS,
        expect:
          "🔴 THE UTILITY READS THE DECLARATION FROM package.json — otherwise `rpp init` sets up something `rpp lint` cannot see",
        disables:
          "the link between the install command and the check command. `init` writes one " +
          "declaration into package.json, while `lint` looks for it in rpp.json — right after " +
          'install the run answers "nothing to lint" over a corpus that is right there',
        edits: [
          [
            CLI,
            '    const pkg = join(dir, PKG_NAME);\n    if (existsSync(pkg) && declaresSettings(pkg))\n      return { path: pkg, kind: "package.json" };',
            "    const pkg = join(dir, PKG_NAME);",
          ],
        ],
      },
      {
        name: "a deprecated carrier gets read silently",
        harness: HARNESS,
        expect: "🔴 but a deprecated carrier is NAMED, not just silently read",
        disables:
          "the warning that settings live where the hooks do not look. The run is green, one " +
          "directory is linted, a different one is guarded — and both states look the same",
        edits: [[CLI, '    if (decl.kind === "rpp.json")', "    if (false)"]],
      },
      {
        name: "consumer data stops reaching the rule",
        harness: HARNESS,
        expect: "the command from options gets through to the rule",
        disables:
          'the "mechanism in the package, data with the consumer" boundary: the ' +
          "`authorListCommand` option is ignored, and the finding again fails to say WHAT to " +
          "run the check with",
        edits: [
          [
            CLI,
            "opts.authorListCommand ? { command: opts.authorListCommand } : {},",
            "{},",
          ],
        ],
      },
      {
        name: "init stops naming the skills it skipped",
        harness: HARNESS,
        expect: "a skipped skill is NAMED with what occupies it",
        disables:
          "the only way a consumer learns WHICH skill is missing from Claude Code. A count of " +
          "skipped entries says something is wrong and not what, so nobody goes to fix it",
        edits: [
          [
            INIT,
            '    for (const l of skipped)\n      out.push(`        ${l.name} — ${l.reason ?? "occupied"}`);',
            "",
          ],
        ],
      },
      {
        name: "a skipped skill link fails init",
        harness: HARNESS,
        expect: "a name init refused to take does not fail the install",
        disables:
          "init being safe to run on a real project. A consumer who keeps their own skill under " +
          "the same name would get a red install for a decision init itself respected",
        edits: [
          [
            INIT,
            "  for (const line of reportSkillLinks(link(root), here)) log(line);",
            '  const linked = link(root);\n  for (const line of reportSkillLinks(linked, here)) log(line);\n  if (linked.ok && linked.links.some((l) => l.status === "foreign")) return 2;',
          ],
        ],
      },
    ],
  }),
);
