/**
 * Battery for `paper/stages` and `paper/source` — four mutations, chosen so that each one
 * removes ITS OWN load-bearing property, rather than just breaking the file.
 *
 * 🔴 Why the battery matters here specifically. For both rules the success state is SILENCE, and
 * the harness catches them on fixtures that it lays out itself. "It passed" and "it cannot fail"
 * look identical from the outside; the battery is the only thing that tells them apart.
 *
 * The first two mutations hit the TWO DIRECTIONS of `paper/stages`, and this is not symmetry for
 * its own sake: without the second direction the rule turns itself off by deleting the
 * frontmatter — no declarations, so no mismatches, so green. The `declared-without-bytes`
 * mutation and the `bytes-without-declaration` mutation must die on DIFFERENT asserts, or only
 * one half is proven.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "paper-stages.mjs");
const HARNESS = join(HERE, "paper-stages.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the DECLARED→BYTES direction stops checking",
        harness: HARNESS,
        expect: "wrong byte count is reported",
        disables:
          "the check of declared `bytes` against the file on disk — a stage could declare any " +
          "number, and the pdf underneath it could be anything",
        edits: [[RULE, "if (got !== Number(rec.bytes)) {", "if (false) {"]],
      },
      {
        name: "the BYTES→DECLARED direction stops checking",
        harness: HARNESS,
        expect: "a frozen version nobody declared is reported",
        disables:
          "the second half — the one without which the rule is muted by deleting the " +
          "frontmatter: no declarations ⇒ no mismatches ⇒ green",
        edits: [
          [
            RULE,
            "if (records.some((r) => r.stage === f.stage && r.date === f.date))\n                continue;",
            "if (true)\n                continue;",
          ],
        ],
      },
      {
        name: "`paper/source` stops checking the source's size",
        harness: HARNESS,
        expect: "a byte mismatch on the source is reported",
        disables:
          "the IDENTITY check on a frozen source: `existsSync` answers 'a file exists', " +
          "and only the size answers 'this is that exact file'",
        edits: [
          [RULE, "if (Number.isFinite(want) && got !== want)", "if (false)"],
        ],
      },
      {
        name: "acknowledging a loss starts EXEMPTING instead of recording",
        harness: HARNESS,
        expect: "an acknowledged loss is still reported, not silenced",
        disables:
          "the decision that `sourceLost` is a RECORD, not an indulgence: the rule must keep " +
          "speaking, because the state is still defective, merely unfixable today",
        edits: [
          [
            RULE,
            "if (rec?.sourceLost === true) {",
            "if (rec?.sourceLost === true && false) {",
          ],
        ],
      },
    ],
  }),
);
