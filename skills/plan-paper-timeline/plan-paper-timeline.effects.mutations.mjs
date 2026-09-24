/**
 * plan-paper-timeline.effects.mutations.mjs — the non-vacuity proof for the EFFECTS harness.
 *
 * Run: `node skills/plan-paper-timeline/plan-paper-timeline.effects.mutations.mjs` (slow: each
 * case spawns the real `claude` CLI against a scripted mock model).
 *
 * ── WHY THIS ONE IS EASY TO GET WRONG ───────────────────────────────────────
 * The effects harness spends most of its length proving that a run HAPPENED — the skill
 * activated, its body reached the model, a control tool answered. Those are preconditions, and a
 * harness made of preconditions passes for reasons that have nothing to do with the thing under
 * test. The two cases below plant defects in the two claims that are actually about §3.
 *
 * ── CASE 1: the zone in the prescription stops being the documented default ─
 * §3's example must carry `DEFAULT_TIMEZONE`, because the zone is the `timezone` CARRIER — it
 * belongs to the author, not to the pipeline. A REAL zone in the example is the silent defect:
 * it is valid, the calendar API accepts it, the harness's schema check passes, and every author
 * who copies the example schedules their deadlines in somebody else's day. `Asia/Tokyo` is
 * chosen precisely because it is well-formed; a malformed zone would be caught by the other
 * assertion and would prove the wrong half.
 *
 * ── CASE 2: the instruction to substitute disappears ────────────────────────
 * With the example showing a default and the "read the carrier" line deleted, the default
 * silently BECOMES the prescription — every anchor lands in UTC and nothing anywhere says so.
 * Removing the line leaves a file that still reads sensibly, which is why a human diff is not
 * enough and this case exists.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMutations } from "../../lib/mutation-driver.mjs";
import { consumerRoot } from "../paper-pipeline/scripts/consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, "SKILL.md");
const HARNESS = join(HERE, "plan-paper-timeline.effects.harness.mjs");

process.exit(
  runMutations({
    root: consumerRoot(),
    runner: "vigiles",
    cases: [
      {
        name: "§3's example carries a real zone instead of the default",
        disables:
          "the rule that the prescription shows DEFAULT_TIMEZONE — a real zone reads as the zone to use",
        edits: [[SKILL, '"timeZone": "UTC"', '"timeZone": "Asia/Tokyo"']],
        harness: HARNESS,
        expect: "must show the documented default",
      },
      {
        name: "§3 stops telling the model to read the `timezone` carrier",
        disables:
          "the substitution instruction — without it the default stops being an example and becomes the prescription",
        edits: [
          [
            SKILL,
            "require('./package.json')['research-paper-pipeline']?.timezone ?? 'UTC'",
            "require('./package.json')['research-paper-pipeline']?.papersDir ?? 'papers'",
          ],
        ],
        harness: HARNESS,
        expect: "tells the model to READ the `timezone` carrier",
      },
    ],
  }),
);
