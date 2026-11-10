/**
 * cold-read-diff — the free, deterministic tier. No model, no network.
 *
 * COLOCATED ON PURPOSE. vigiles decides coverage by PLACEMENT as of 2026-08-11:
 * a test that merely names a surface no longer counts, because that tier was
 * crediting surfaces nothing touched. So each skill needs a file inside its own
 * directory — this one.
 *
 * The assertions live in `lib/skill-checks.mjs` and are CALLED here with this
 * skill's name: its frontmatter parses as strict YAML, its declared tool contract
 * is sane, the script paths it instructs exist.
 *
 * What it does NOT prove, and does not pretend to by grepping the skill's wording:
 * what the skill DOES. The extractor's logic is tested in `scripts/cold-read.test.ts`;
 * what a model does with the skill (the paper left alone, two background readers given
 * only the diff, a report written, within the time) is measured, with a real model, in
 * `cold-read-behaviour.eval.ts`. Whether it fires is `cold-read-diff.eval.mjs`.
 */
import { checkSkill } from "../../lib/skill-checks.mjs";

await checkSkill("cold-read-diff");
