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
      {
        // 🔴 A REGRESSION BACK TO GREP. The rule's first draft did exactly this and justified it
        // by saying "a footnote cell has no node of its own" — a measurement showed the
        // opposite: the parser hands back `tableCell`. The mutation is caught by ONE fixture out
        // of six: in the rest the marker already sits in a cell, so grep and parsing are
        // indistinguishable. Without `marker-in-prose` this regression would have passed
        // silently, and the rule would again read an intention as a fact.
        name: "the evidence is grepped over the WHOLE FILE again",
        harness: HARNESS,
        expect: "a marker in prose OUTSIDE the table is not a record of a run",
        disables:
          "parsing in favor of a string search: 'still need to run bib-authors' — an intention, " +
          "not a record — counts as a run again, and the paper silently stops being a debtor",
        edits: [
          [
            RULE,
            "if (context.sourceCode.getText(node).includes(marker))\n              recorded = true;",
            "if (context.sourceCode.text.includes(marker))\n              recorded = true;",
          ],
        ],
      },
      {
        name: "the rule stops requiring an author cross-check run",
        harness: HARNESS,
        expect: "a stage is declared, no run — a finding",
        disables:
          "the debt itself: a shipped paper no longer owes anything, and the rule stays silent " +
          "across the whole corpus — silence is its success state, so from the outside this is " +
          "indistinguishable",
        // Target retargeted 09-17: the old line disappeared when the rule moved to parsing, and
        // the driver honestly said UNUSABLE — "the patch did not land", not "the test is weak".
        // Now the mutation declares the run recorded before the file is even read.
        edits: [[RULE, "let recorded = false;", "let recorded = true;"]],
      },
      {
        name: "the exemption for an unshipped paper becomes WIDER than it should",
        harness: HARNESS,
        expect: "an empty stage list — silent",
        disables:
          "the distinction between 'no stages' and 'there are stages': a draft starts getting a " +
          "finding, and a rule that scolds drafts gets turned off within a week",
        edits: [
          [
            RULE,
            "if (stages.length === 0) return; // nothing shipped — nothing is owed",
            "",
          ],
        ],
      },
      {
        name: "the stage list is taken from somewhere OTHER than the field again",
        harness: HARNESS,
        expect:
          "the stage list in the message comes from the FIELD and carries all of them",
        disables:
          "the exact reason the move was made. The predecessor derived the stage with a regex " +
          "over the prose, and on agenticdev printed `submitted` where `submitted, " +
          "camera-ready` was declared. The mutation brings back a hardcoded list — the set of " +
          "findings does not change, only the TEXT lies, and without this assert the regression " +
          "would have passed silently",
        edits: [[RULE, 'stages: stages.join("/"),', 'stages: "submitted",']],
      },
      {
        name: "a consumer-specific path comes back into the package's text",
        harness: HARNESS,
        expect:
          "the run command comes in as an option and lands in the message",
        disables:
          "the boundary 'the mechanism goes in the package, the data stays with the consumer': " +
          "the command stops arriving as an option. The predecessor hardcoded " +
          "`.claude/skills/verify-citations/...` — the path of one private repository — right " +
          "into a public rule's message",
        edits: [
          [RULE, 'const command = opts.command ?? "";', 'const command = "";'],
        ],
      },
    ],
  }),
);
