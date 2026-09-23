/**
 * Battery for the real-article harness — and it mutates the RULES, not the harness, because what
 * this harness uniquely knows is how the rules behave on a document nobody wrote for them.
 *
 * 🔴 It does not duplicate each rule's own battery. Those ask "can this rule still fire at all";
 * these ask "does it still do the right thing on 225 lines of real prose" — the axis where a rule
 * can be perfectly alive on its own stub and useless here. Three of the four cases below target a
 * rule going QUIET on the real document, which is the failure the per-rule fixtures cannot see:
 * their stubs contain the defect by construction, so a narrowed rule still fires there.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const HARNESS = join(HERE, "real-markdown-paper.harness.mjs");
const TYPO = join(ROOT, "eslint-rules", "paper-typography.mjs");
const RQ = join(ROOT, "eslint-rules", "paper-research-question.mjs");
const STAGES = join(ROOT, "eslint-rules", "paper-stages.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "typography stops counting bare decimals — it goes quiet on the real article",
        harness: HARNESS,
        expect:
          "no rule that was recorded has vanished entirely without the baseline being updated",
        disables:
          "the baseline's OTHER direction. Growth is the loud failure and everyone watches for it; " +
          "a rule that silently stops saying anything looks like progress — the number went down — " +
          "and that is exactly how a check dies unnoticed",
        edits: [
          [
            TYPO,
            "const bareDecimal = (body.match(",
            "const bareDecimal = 0 * (body.match(",
          ],
        ],
      },
      {
        name: "the § counter stops counting — the planted defect no longer moves its rule",
        harness: HARNESS,
        expect: "a planted `§` grows paper/typography",
        disables:
          "the firing half in realistic surroundings. The rule's own fixture is three lines of " +
          "nothing but the defect, so a narrowed counter still fires there; only a document with " +
          "225 lines of competing text shows that it stopped",
        edits: [[TYPO, "(body.match(/§/g) || []).length", "0"]],
      },
      {
        name: "research-question stops comparing the declaration against the paper",
        harness: HARNESS,
        expect:
          "a question declared but ABSENT from the article is reported as absent",
        disables:
          "the half added when the regex was retired earlier the same day. Without it the scorecard " +
          "only has to SAY a question exists, never to carry it — the checklist the whole design " +
          "moved away from",
        edits: [
          [
            RQ,
            "if (flatten(raw).includes(flatten(question))) return;",
            "return;",
          ],
        ],
      },
      {
        name: "the author-list marker stops being read — recording the run changes nothing",
        harness: HARNESS,
        expect: "recording the author-list run silences paper/author-list",
        disables:
          "the only way a consumer can ever clear this finding. A rule that cannot be satisfied is " +
          "worse than one that never fires: it trains the reader to ignore the whole report",
        edits: [
          [
            STAGES,
            'const marker = opts.marker ?? "bib-authors";',
            'const marker = "\\u0000never-matches";',
          ],
        ],
      },
    ],
  }),
);
