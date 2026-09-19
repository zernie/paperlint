/**
 * Battery for `check:readme` — four mutations, three of which return DEFECTS this
 * script already committed. A battery here is not formality: a number check that itself
 * counts wrong prints a green checkmark under the wrong number — exactly what it
 * exists to prevent.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "readme-numbers.mjs");
const HARNESS = join(HERE, "readme-numbers.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        // 🔴 THE FIRST VERSION OF THIS MUTATION SURVIVED, and it was a finding ABOUT THE HARNESS. It removed
        // the `isSymbolicLink()` guard and expected the count to double for a DIRECTORY link — but it does not
        // double even without the guard: `lstat` does not call a link a directory, so the walk does not enter it.
        // What matters is `lstatSync` instead of `statSync`, and the mutation now hits exactly that spot,
        // with two edits at once (import and call).
        name: "walk follows SYMLINKS AGAIN (statSync instead of lstatSync)",
        harness: HARNESS,
        expect: "SYMLINK to directory does not double the count — it is not a new directory",
        disables:
          "distinction between 'directory' and 'link to directory'. Real defect: 24 links " +
          "`.claude/skills/*` → `skills/*` gave 83 harnesses instead of 49, and the number " +
          "just looked large, not wrong",
        edits: [
          [SRC, 'import { readdirSync, readFileSync, lstatSync } from "node:fs";',
                'import { readdirSync, readFileSync, lstatSync, statSync } from "node:fs";'],
          [SRC, "const st = lstatSync(p);", "const st = statSync(p);"],
        ],
      },
      {
        name: "guard for FILE link is removed",
        harness: HARNESS,
        expect: "SYMLINK to a harness file also does not double the count",
        disables:
          "the second half the first battery version missed: a link to a file with " +
          "the right suffix passes `endsWith` and counts as a second file. Paired with " +
          "the previous mutation proves both guards are live, not one dead code",
        edits: [[SRC, "if (st.isSymbolicLink()) continue;", ""]],
      },
      {
        name: "unknown module form is SILENTLY SKIPPED AGAIN",
        harness: HARNESS,
        expect: "an unknown-form module is an ERROR, not a silent skip",
        disables:
          "the verdict that an unknown module is an error. Real defect: `tex-build.mjs` " +
          "exports rules directly to `default`, ended up in 'not a plugin' and took two rules — " +
          "the counter confidently printed 8 instead of 10",
        edits: [[SRC, "if (unknown.length) {", "if (false) {"]],
      },
      {
        name: "battery suffix stops requiring a dot",
        harness: HARNESS,
        expect: "`run-mutations.mjs` is not a battery — suffix requires a dot",
        disables:
          "distinction between battery and BATTERY DRIVER. `scripts/run-mutations.mjs` ends in " +
          "`mutations.mjs`, and without the dot it counts as a battery — this is how `git grep` gave 27 instead of 26",
        edits: [[SRC, 'else if (e.endsWith(suffix)) n++;', 'else if (e.includes(suffix.slice(1))) n++;']],
      },
      {
        name: "a number AS A WORD is counted as a declaration AGAIN",
        harness: HARNESS,
        expect: "a number as a word is not a declaration",
        disables:
          "what the marks were introduced for. README had 'Forty-five of those' — a form " +
          "with nothing to compare it to, so the 45 vs 49 mismatch lived unseen. " +
          "The mutation accepts any word as a declaration, and the check stops asserting " +
          "anything again",
        edits: [
          [
            SRC,
            "/<!--\\s*count:([a-z]+)\\s*-->\\s*(\\d+)/g",
            "/(?:<!--\\s*count:([a-z]+)\\s*-->\\s*(\\d+)|(Forty)-(five))/g",
          ],
        ],
      },
    ],
  }),
);
