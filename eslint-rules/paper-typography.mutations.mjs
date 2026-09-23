/**
 * Battery for `paper/typography` — three mutations over three DIFFERENT properties: the count
 * itself, the ratchet, and its direction.
 *
 * 🔴 Why the ratchet needs TWO mutations, not one. It has two halves, and they're opposite:
 * declared debt must STAY SILENT (otherwise a legacy paper drowns out a new finding and the
 * rule gets turned off), while growth must SPEAK (otherwise debt turns into a permit). A
 * mutation removing the first leaves the second green and vice versa — so both are needed, and
 * they must die on different asserts.
 *
 * ⚠️ What the battery does NOT check, and why: the accuracy of the counting regexes
 * themselves. The harness's own fixtures hold those (an arXiv identifier is not a decimal
 * fraction, consecutive `Figure`s are not a defect), and a mutation here would prove the
 * fixture exists, not that the count is correct.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "paper-typography.mjs");
const HARNESS = join(HERE, "paper-typography.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "the ratchet stops LETTING declared debt THROUGH",
        harness: HARNESS,
        expect: "known debt, unchanged, is silent",
        disables:
          "the 'debt stays silent' half — a legacy paper with 246 § characters starts going " +
          "red on every run, and the rule gets turned off within a day, taking new findings with it",
        edits: [
          [
            RULE,
            "if (n <= before) continue; // known debt, unchanged or paid down",
            "if (false) continue;",
          ],
        ],
      },
      {
        name: "the ratchet stops CATCHING growth",
        harness: HARNESS,
        expect: "growth over known debt is reported",
        disables:
          "the second half — the one debt is declared for in the first place: without it a " +
          "record in the debt file turns into a permanent permit rather than a mark of today's state",
        // 🔴 NOT an unconditional `continue;`: that kills the rule entirely, and the harness dies
        // on the very first "fires on §" assert — that is, a finding about the MUTATION, not
        // about the protection. `before > 0` keeps the rule alive where there is no debt, and
        // mutes EXACTLY growth over declared debt.
        edits: [
          [
            RULE,
            "if (n <= before) continue; // known debt, unchanged or paid down",
            "if (before > 0) continue;",
          ],
        ],
      },
      {
        name: "the `§` counter stops seeing the macro form",
        harness: HARNESS,
        expect:
          "the section sign count includes the macro form, not only the glyph",
        disables:
          "exactly the case the counter was written for: in LaTeX the section sign is typeset " +
          "as `\\S\\ref{…}`, not as the glyph, and a check that only counts the glyph reports " +
          "clean on the very defect it was written to catch",
        edits: [
          [
            RULE,
            "(body.match(/§/g) || []).length +\n    (body.match(/\\\\S(?=\\s*\\\\ref|~\\\\ref|\\d)/g) || []).length",
            "(body.match(/§/g) || []).length",
          ],
        ],
      },
    ],
  }),
);
