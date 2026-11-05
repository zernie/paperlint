#!/usr/bin/env node
/**
 * label-page — the generator of the build-label-page skill: items.json → a blind, single-page
 * labelling app (HTML) and its key, and the answers back out of the store.
 *
 *   build  <items.json> <out-dir>                          → out/page.html, out/key.json
 *   export <dump.json> <key.json> <data-dir> [--date D]    → data/<study>-labels-<D>.json
 *                                                            (+ data/<study>-practice-r<N>-<D>.json)
 *   schema                                                 → the declared items.json schema
 *
 * Run from the skill, never copied into a study: a fix reaches every page built after it.
 *
 * `build` makes a page that stores each answer in the artifact's `db` store (publish page.html with
 * `capabilities: {db: {}}`). `export` turns what the store holds into one JSON file for the study's
 * data/ folder. Answers and familiarity values outside the offered options are not counted (page and
 * export read the same `allowed` lists): the item or group is marked incomplete and reported
 * (`invalid_answers`, `invalid_familiarity`). `dump.json` is the store's three collections:
 *
 *   {"answers":  {"G001": {"answers": {"q": "v"}, "reasons": {"q": "why"}, "savedAt": "…", "source": "page"}, …},
 *    "groups":   {"python": {"familiarity": "well", "savedAt": "…", "source": "page"}, …},
 *    "practice": {"r1-P1": {"answers": {"q": "v"}, "savedAt": "…", "source": "page"}, …}}
 *
 * THE COMPREHENSION STEP (rule 8). The first screen shows every question with one real example per
 * answer (`example`, required on every option). Then the practice items: their answers are known
 * (`expected`, one per question), and after each one the page shows the expected answer and `why`.
 * The real items open once every practice item of the current `practice_round` is answered; a miss
 * does not lock them, it tells the labeller to tell the agent, who rewords the question, raises
 * `practice_round` and rebuilds. The page stores the FIRST practice answer only, in its own
 * collection (`practice`, documents `r<round>-P<n>`), so `export` keeps it out of the labels and
 * writes it to `<study>-practice-r<round>-<date>.json`. An item card asks one question at a time.
 *
 * items.json is checked once against the declared CONFIG_SCHEMA (`schema` prints it): every field's
 * type, required or optional, non-empty strings, ids as strings of letters, digits, - and _. A bad
 * field stops the build and is named by its path, e.g. `questions[0].options[1].label`.
 *
 *   {
 *     "study": "demo-gold",                 file-name stem
 *     "kind": "labels",                     approval | witness | labels: which card fields are required
 *     "title": "Label these",               2-4 words; the page title
 *     "intro": "One or two sentences.",     optional
 *     "seed": 7,                            fixes the order; change it and every id changes
 *     "groups": {"python": "Python"},
 *     "labeller_knows": ["python"],         optional: items of other groups are not put on the page
 *     "answerers": ["author", "second"],   optional, 2 or more: each answers under their own name;
 *                                           documents become `<answerer>~<id>`; an item's own
 *                                           `answerers` (a subset) shows it to those only
 *     "min_seconds": 30,                    optional: an answer saves only after its card was on
 *                                           screen that long; stored as `seconds`
 *     "familiarity": true,                  optional: a "how well do you know" question per group;
 *                                           left out, none is asked (an approval page)
 *     "familiarity_question": "How well do you know {group}?",          optional
 *     "questions": [{"id": "label", "text": "Is this correct?", "short": "correct?",
 *                    "options": [{"value": "yes", "label": "Yes", "example": "one real case",
 *                                 "icon": "✅"},                      icon: optional
 *                                {"value": "no", "label": "No", "example": "another real case",
 *                                 "icon": "❌", "ask_why": "What is wrong with it?"}]}],
 *                                           ask_why: optional; the answer is not saved until a
 *                                           reason is typed. In any shown text, backticks render
 *                                           as code.
 *     "practice": [{"body": "…", "expected": {"label": "yes"}, "why": "one line"}, …],   3 or more;
 *                                           a practice card may carry rules, unit, readings, file
 *     "practice_round": 1,                  optional; raise it after rewording, the practice reopens
 *     "items": [{"source_id": "case-0412-b", "group": "python", "body": "…", "code": "…",
 *                "context": "…",
 *                "rules": [{"linter": "ruff", "id": "TID253"}],
 *                "unit": {"id": "a.md:12", "text": "the whole line", "mark": "whole", "part": 1, "of": 2},
 *                "readings": {"a": "…", "b": "…"}, "file": "`src/a.ts`: B flags it"}]
 *                                           rules: optional; each shown with the linter's own
 *                                           description (`ruff rule`, ESLint meta.docs.description)
 *                                           unit: optional; the line an item is drawn from, the
 *                                           requirement marked in it; id (never shown) tells two
 *                                           places with the same words apart. kind approval requires
 *                                           unit and rules; kind witness rules, readings and file.
 *                                           Content blocks (situation, excerpt, references, more,
 *                                           table, repeat) and page `labels`: optional on any kind
 *                                           (references/closed-choice-generator.md, and
 *                                           scripts/fixtures/blocks-items.json for a whole page);
 *                                           "preset": "<name>" maps a preset's own card fields onto
 *                                           them (scripts/label-page-presets.ts).
 *   }
 *
 * TypeScript, compiled beside itself to `label-page.js` by `npm run build`: a consumer runs the skill
 * from `node_modules`, where Node does not strip types. The skill names the `.js`. The work is in
 * `label-page-core.ts` (checks, ids, key, export; no page layout) and `label-page-html.ts` (the one
 * closed-choice page, `page-template.html`, filled with the core's payload); the command line is
 * `label-page-cli.ts`.
 *
 * EXIT CODES: 0 built / exported / printed · 1 refused (`REFUSED: <path>: …`) · 2 usage.
 */
import { cli } from "./label-page-cli.ts";

const run = cli(process.argv.slice(2));
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
process.exitCode = run.status;
