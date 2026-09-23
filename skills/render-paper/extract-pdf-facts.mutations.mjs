/**
 * extract-pdf-facts.mutations.mjs — the non-vacuity proof for `extract-pdf-facts.harness.mjs`.
 *
 * Run: `node skills/render-paper/extract-pdf-facts.mutations.mjs`.
 *
 * ── WHY THIS HARNESS NEEDED A BATTERY ───────────────────────────────────────
 * It arrived with wave ② on 2026-09-12 and was an orphan the moment it landed: green, silent,
 * and — until this file — indistinguishable from a harness that checks nothing. `columnHeights`
 * is pure coordinate arithmetic with no disk access, so its harness is entirely hand-written
 * markup; that makes it cheap to write and equally cheap to write VACUOUSLY.
 *
 * ── THE DEFECT PLANTED, AND WHY THAT ONE ────────────────────────────────────
 * The guard `if (words.length < 60) return null` is the one that refuses to judge a stub page.
 * It is exactly the kind of threshold that looks like a magic number and gets "cleaned up", and
 * removing it is SILENT: a near-empty page stops returning `null` and starts returning a pair of
 * heights, which downstream reads as a real balance measurement of a page that has no columns.
 * That is a wrong number presented as a measurement — the failure mode this whole package is
 * about — so it is the defect worth proving the harness catches.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMutations } from "../../lib/mutation-driver.mjs";
import { consumerRoot } from "../paper-pipeline/scripts/consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

process.exit(
  runMutations({
    root: consumerRoot(),
    cases: [
      {
        name: "columnHeights: the stub-page floor is removed",
        disables:
          "the refusal to judge a page with too few words — a stub page starts reporting heights",
        edits: [
          [
            join(HERE, "extract-pdf-facts.mjs"),
            "words.length < 60",
            "words.length < 0",
          ],
        ],
        harness: join(HERE, "extract-pdf-facts.harness.mjs"),
        expect: "a near-empty page is not judged",
      },
    ],
  }),
);
