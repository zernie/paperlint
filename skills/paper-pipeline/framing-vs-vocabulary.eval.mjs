/**
 * framing-vs-vocabulary.eval.mjs — WHY does a skill fire only when the user names its verb?
 *
 * Run:  node .claude/skills/paper-pipeline/framing-vs-vocabulary.eval.mjs [--trials N] [--mode main|oracle|preflight]
 *
 *   --mode preflight   run every guard and print the labelling matrix; spends NO tokens  <- run this FIRST
 *   --mode main        the 2x2 (default): 3 skills x 4 cells x 4 prompts x 3 trials = 144 runs
 *   --mode oracle      the ambiguity control: 48 single closed-book picks, no harness, no skills installed
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINDING THIS EXISTS TO EXPLAIN
 *
 * Two sibling evals measured the same three skills against the same 36 competitors with the same
 * fixture and the same 3 trials, and disagreed by a factor of two to three:
 *
 *   pipeline-language.eval.mjs      prompts that NAME the action        78% EN / 60% RU  (192 runs)
 *   description-language.eval.mjs   prompts that describe a SITUATION   25% EN / 31% RU  (72 runs)
 *
 * The second set was written deliberately to share no vocabulary with the descriptions, because a
 * prompt reusing a description's own words would have measured how well the description was copied.
 * So the skills mostly fire when the user happens to use the description's verb and mostly miss when
 * the user describes their problem — which is how people actually type. Nobody established WHY, and
 * the three candidate explanations call for three different fixes:
 *
 *   A. VOCABULARY OVERLAP — selection is largely lexical; the oblique prompts share fewer words.
 *      Fix: more surface forms in descriptions.
 *   B. PROBLEM-vs-ACTION FRAMING — descriptions say what the SKILL DOES, the oblique prompts say
 *      what the USER HAS, and nothing bridges symptom to remedy.
 *      Fix: descriptions that name symptoms, not just actions.
 *   C. DIFFICULTY / AMBIGUITY — the oblique prompts are simply under-determined; several skills
 *      apply or none does, and any selector would do worse.
 *      Fix: nothing. There is no defect.
 *
 * 🔴 THE CONFOUND THAT MAKES THE EXISTING DATA UNABLE TO CHOOSE. In both sibling evals the two
 * factors move together. Every "names the action" prompt is ALSO high-vocabulary-overlap; every
 * "describes a situation" prompt is ALSO low-overlap. A and B are therefore the same variable in
 * that data and no amount of re-reading those logs separates them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DESIGN: CROSS THE TWO FACTORS, THEN LOOK AT WHAT FIRED INSTEAD
 *
 * Factor 1 — FRAMING.
 *   ACTION    the prompt asks for the skill's DELIVERABLE. Imperative or explicit request.
 *             "produce a cut and fold plan for this draft"
 *   SITUATION the prompt STATES the user's condition and asks for nothing in particular.
 *             "this feels long and overly complex, and the middle drags"
 *
 * Factor 2 — VOCABULARY OVERLAP with the target skill's own description.
 *   HIGH      reuses content words that appear verbatim in the description.
 *   LOW       says the same thing in words the description does not contain.
 *
 * Four cells per skill, four fresh prompts each:
 *
 *              HIGH overlap            LOW overlap
 *   ACTION     AH  (the sibling's      AL  asks for the remedy in other words
 *                  regime, ~78%)
 *   SITUATION  SH  states the symptom  SL  (the sibling's oblique regime, ~25%)
 *                  in the description's
 *                  own words
 *
 * The two off-diagonal cells are the whole experiment and they make the fork FALSIFIABLE:
 *
 *   If A (lexical):  AH high, SH high, AL low,  SL low.   Overlap explains the rows.
 *   If B (framing):  AH high, AL high, SH low,  SL low.   Framing explains the columns.
 *   If both:         AH high, AL and SH middling, SL low. Additive.
 *   If neither:      all four cells alike — which points at C, or at something not measured here.
 *
 * 🔴 AND THE SIGNAL NEITHER SIBLING RECORDED: WHAT FIRED INSTEAD. Both siblings asked only "did the
 * TARGET fire". The `Trace` carries every `Skill` call with its `input.skill`, so recording the full
 * fired SET costs nothing but a predicate side effect. Each run then lands in one of three buckets:
 *
 *   TARGET   the intended skill resolved.
 *   OTHER    some competitor resolved and the target did not  -> a plausible-but-wrong pick.
 *            The prompt WAS routed; the selector just disagreed. This is what AMBIGUITY (C)
 *            looks like, and it is also what a lexically-nearer competitor (A) looks like.
 *   SILENT   nothing resolved at all -> the target was never a candidate. This is what a
 *            description that does not cover the user's phrasing (A or B) looks like.
 *
 * OTHER and SILENT point in opposite directions and no existing log distinguishes them.
 *
 * THE THIRD LEG — the closed-book ORACLE (`--mode oracle`), the C control. C says the prompts are
 * genuinely under-determined: not even a careful reader with all 37 descriptions in front of them
 * could pick the intended skill. So we ask exactly that question, stripped of everything else: one
 * call per prompt, no skills installed, no fixture, no tools, the 37 name+description pairs pasted
 * in, "which ONE should be invoked, or NONE". That is a strictly EASIER task than the harness's —
 * closed book, nothing else to do, no context budget evicting descriptions — so it is an UPPER BOUND
 * on what is recoverable from the descriptions alone. If the oracle also fails on the SL prompts,
 * the information is not in the descriptions and C survives. If the oracle succeeds where the
 * harness fails, the information IS there and the harness is not using it, which kills C.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 WHAT THIS RUN CANNOT SETTLE — stated before it runs, not discovered after
 *
 *  1. OVERLAP IS MEASURED ON THE SURFACE. The vocabulary factor is a stemmed content-word match
 *     against the description string. If selection is semantic rather than lexical, an AL prompt
 *     ("welded into one") and an AH prompt ("merge") are the same prompt to the model and differ
 *     only to my metric. In that world the A/B contrast collapses and this design reports "framing"
 *     for something that is really shallow-semantic matching. This file cannot tell those apart and
 *     must not be read as though it could. It can still rule A OUT (if AL stays high), which is the
 *     asymmetry worth having.
 *  2. SILENT IS NOT PROOF OF NON-CANDIDACY. A run where the model simply answers the question from
 *     the fixture, without reaching for any skill, is also SILENT. Tools are restricted to Skill and
 *     Read and the bodies are stubbed, but nothing forces a selection. Read SILENT as "no skill was
 *     selected", never as "the description was not in the running".
 *  3. THE FRAMING LABEL IS A JUDGEMENT. The overlap factor is checked mechanically and the run dies
 *     if my labels do not survive it. Framing gets only a weak mechanical guard (action prompts must
 *     contain a request-form; situation prompts must not) — a guard against sloppiness, not a proof
 *     that the two cells differ in the way the hypothesis means.
 *  4. ONE AUTHOR. The prompts were written by the same model being measured, which has read both
 *     sibling evals. Fresh SENTENCES are guaranteed mechanically. Fresh conceptual space is not.
 *  5. n = 48 runs per cell (4 prompts x 3 trials x 3 skills). That resolves a factor of two. It does
 *     not resolve ten points, and the per-skill cells (12 runs) resolve almost nothing — read the
 *     cell totals, treat the per-skill split as texture.
 *  6. ENGLISH ONLY, and that is a deliberate drop. See COST.
 *  7. THE ORACLE IS A MODEL, NOT A HUMAN. It shares the training distribution of the thing being
 *     measured, so agreement between them is weaker evidence than agreement between a model and a
 *     person would be. It bounds what the DESCRIPTIONS support; it does not stand in for a human.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COST, AND WHAT WAS DROPPED TO FIT
 *
 * main   3 skills x 4 cells x 4 prompts x 3 trials     = 144 runs
 * oracle 48 prompts x 1 pick                           =  48 calls
 *                                                        192, under the 250 budget
 * At the siblings' measured ~$0.14/run that is ~$27 API-equivalent, billed to a Claude
 * subscription, $0 metered. Not wired into CI: this answers a question once.
 *
 * Dropped, in order of what it cost:
 *  - THE RUSSIAN ARM (would have doubled main to 288). The control arm already measured Russian on
 *    oblique prompts and found ru 31% / en 25% — no gap, both on the floor. Language is not the axis
 *    under test, and carrying it would have halved the n in every cell of the axis that is.
 *  - `irrelevantPrompts` / precision. The first eval measured 0% false positives on all eight cases;
 *    re-measuring it buys a number already known.
 *  - The other five skills from the language eval. Kept exactly the three the control arm measured,
 *    so these cells are comparable to that 25%/31% floor rather than to a new baseline.
 *  - Trials stayed at 3, matching both siblings, rather than rising to 5. Prompt-to-prompt variance
 *    dominates trial variance here (the control arm saw 0.00 and 1.00 inside one cell), so four
 *    prompts at three trials beats three prompts at four.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READING THE OUTPUT
 *
 * The four cell totals, then the TARGET/OTHER/SILENT split inside each. In that order. The per-skill
 * rows exist so a single skill driving the whole effect is visible; they are not three findings.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 RESULT — 2026-08-08. 144 harness runs + 48 oracle picks, 3 trials, 36 competitors, 0 errored.
 * Raw logs: `repro/2026-08-08-framing-vs-vocabulary-raw.log`,
 *           `repro/2026-08-08-framing-vs-vocabulary-oracle.log`
 * Per-run rows: `repro/2026-08-08-framing-vs-vocabulary.json` (buckets, overlap, what fired instead)
 *               `repro/2026-08-08-framing-vs-vocabulary-oracle.json`
 *
 *                     HIGH overlap        LOW overlap
 *   ACTION            AH  64% (23/36)     AL  44% (16/36)
 *   SITUATION         SH  61% (22/36)     SL  11% ( 4/36)
 *
 *   main effect of VOCABULARY  35pp        main effect of FRAMING  18pp
 *
 * 1. 🔴 B IS REFUTED AS STATED, AND IT WAS THE HYPOTHESIS WITH THE MOST INTUITIVE APPEAL.
 *    B says the descriptions describe what the SKILL DOES while the user describes what they HAVE,
 *    and nothing bridges symptom to remedy. If that were the barrier, SH — pure symptom statements,
 *    no request, no verb ("the abstract reads like a wall of jargon") — would sit on the floor.
 *    It sits at 61%, statistically indistinguishable from AH's 64%. Excluding the one dead skill
 *    (below) the two are identical to the run: 83% and 83%. A symptom routes perfectly well. The
 *    symptom-to-remedy bridge is not what is missing, and "descriptions that name symptoms" aims
 *    at a defect this run could not find. The descriptions ALREADY name symptoms — tighten-paper's
 *    lists "feels long / bloated / the middle drags" verbatim, and those are the SH prompts.
 *
 * 2. VOCABULARY IS THE DOMINANT FACTOR AND IT IS SUFFICIENT — but it is NOT necessary, and that is
 *    the part neither A nor B predicted. Overlap moves 35pp against framing's 18pp, and SH ≈ AH
 *    shows shared words alone carry a prompt with nothing else going for it. But A also predicts
 *    AL ≈ SL, both low. Observed: AL 44%, SL 11%. With no shared vocabulary, naming the deliverable
 *    is still worth 33pp. So neither factor is the mechanism on its own:
 *
 *      THE SELECTOR FIRES WHEN IT HAS EITHER THE DESCRIPTION'S WORDS OR AN EXPLICIT REQUEST FOR
 *      THE DELIVERABLE. IT COLLAPSES ONLY WHEN IT HAS NEITHER.
 *
 *    SL is the only cell with neither and the only cell that collapses. It is also how people type.
 *
 * 3. 🔴 THE WRONG-SKILL SIGNAL KILLS C-AS-AMBIGUITY OUTRIGHT: ONE misfire in 144 runs.
 *
 *      cell   target   other   silent
 *      AH      64%       0%     36%
 *      AL      44%       0%     56%
 *      SH      61%       0%     39%
 *      SL      11%       3%     86%
 *
 *    The oblique prompts are not being lost to a plausible-but-wrong competitor. Nothing competes.
 *    86% of SL runs resolve NO skill at all. Whatever is wrong, it is not 37 skills fighting over an
 *    under-determined request — the version of C that says "several skills plausibly apply" is dead.
 *    This is the signal neither sibling recorded, it cost nothing but a predicate side effect, and
 *    it is the single number that most changed the reading.
 *
 * 4. 🔴 BUT THE ORACLE RESCUES THE OTHER HALF OF C, AND THIS IS WHERE THE RUN OVERTURNED ITS OWN
 *    EXPECTATION. Closed book, all 37 descriptions in context, one pick, nothing else to do:
 *
 *      cell   oracle          harness   gap
 *      AH     12/12 (100%)      64%     36pp
 *      AL      8/12  (67%)      44%     22pp
 *      SH     12/12 (100%)      61%     39pp
 *      SL      3/12  (25%)      11%     14pp     <- 6 of the 12 answered NONE
 *
 *    A reader with every description in front of it and no other task ALSO collapses on SL. So the
 *    descriptions genuinely do not determine the answer there. C survives — but in a different form
 *    than it was posed. The SL prompts are not AMBIGUOUS (nothing competes, point 3); they are
 *    UNCOVERED (nothing matches). Those are different defects with different fixes, and no reading
 *    of the sibling logs could have told them apart.
 *
 * 5. WHAT NONE OF A, B OR C EXPLAINS, and it may be the bigger finding: the harness sits 14-39pp
 *    BELOW the oracle in EVERY cell, including the ones where the oracle is perfect. A third of AH
 *    runs — unambiguous, high-overlap, explicit requests that a closed-book reader gets 12 out of 12
 *    times — resolve no skill at all. That deficit is uniform across the 2x2, so it is not about
 *    framing or vocabulary; it is about selection under a live harness (context budget, 36 competing
 *    descriptions, an agent that can simply answer instead). This experiment measures its size and
 *    does not explain it.
 *
 * 6. ONE SKILL IS EFFECTIVELY DEAD AND IT DRAGS EVERY CELL. `grade-paper-writing` fired 6 times in
 *    48 runs — 25% even in AH, 17% in SH — while the oracle picked it 10 times out of 16 from its
 *    description alone. Its description is unambiguous to a reader and almost never selected by the
 *    harness. It is also by far the longest description in the roster and the most loaded with
 *    "NOT this / NOT that" delegation clauses. That is a hypothesis, not a finding: this run does
 *    not vary description length and cannot test it. Excluding this skill, the 2x2 sharpens to
 *    AH 83% / AL 63% / SH 83% / SL 17% — same shape, same conclusion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS STILL DOES NOT SETTLE, after the run
 *
 *  - WHETHER "VOCABULARY" IS LEXICAL OR SHALLOW-SEMANTIC. Caveat 1 up top stands and the result
 *    does not resolve it. AL at 44% is well above SL's 11% despite both scoring ~0.03 on the
 *    surface metric, which is already evidence that something beyond string matching is running.
 *    Whether the HIGH cells win on strings or on meaning is untested.
 *  - THE HARNESS-VS-ORACLE DEFICIT (point 5). Size measured, cause not. Splitting it would need a
 *    roster-size sweep (does recall fall as competitors are added?) — a different experiment.
 *  - WHY `grade-paper-writing` IS DEAD (point 6). Needs a description-length/negation arm.
 *  - WHETHER A HUMAN WOULD PICK THE INTENDED SKILL ON THE SL PROMPTS. The oracle is a model from
 *    the same family and shares its blind spots. Caveat 7 stands: it bounds what the DESCRIPTIONS
 *    support, it does not stand in for a person.
 *  - RUSSIAN. Dropped by design; the interaction found here is untested in the language the owner
 *    actually types.
 *
 * 🔴 NO SKILL.md WAS CHANGED BY THIS RUN, DELIBERATELY. The obvious next move — add the missing
 * surface forms to the three descriptions — must be measured on prompts held out from THIS file
 * too, exactly as this file was held out from the two that motivated it. An intervention decided
 * and validated on one run is the overfitting the sibling evals exist to prevent, and the fix
 * indicated here (cover more of the user's vocabulary) is A's fix, which is the hypothesis this
 * run promoted rather than the one it started from.
 */

import { assertPromptDiversity, skip } from "vigiles";
import { paid_measureTriggerRate as measureTriggerRate } from "vigiles/eval";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { frontmatterBlock } from "../../lib/markdown.mjs";
import { parseFm } from "../../lib/skill-corpus.mjs";

// The name a SKILL.md DECLARES, parsed rather than matched. The old expression took
// `(\S+)` after `name:`, which silently truncates a quoted name and cannot see one
// carried onto a continuation line — and this is a guard whose whole job is to fail
// when the declared name disagrees with the directory.
const declaredName = (md) => {
  const block = frontmatterBlock(md);
  if (block === null) return undefined;
  const v = parseFm(block, "skill fixture").name;
  return typeof v === "string" ? v : undefined;
};

import { execFileSync } from "node:child_process";

const ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const SKILLS_DIR = join(ROOT, ".claude", "skills");
const REPRO = join(SKILLS_DIR, "paper-pipeline", "repro");
const NS = "vigiles-loose-skills";
const id = (skill) => `${NS}:${skill}`;

const argv = process.argv.slice(2);
const val = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const MODE = val("mode", "main");
const TRIALS = Number(val("trials", "3"));
if (!["main", "oracle", "preflight"].includes(MODE))
  throw new Error("--mode must be main | oracle | preflight");

// ── the fixture ──────────────────────────────────────────────────────────────
// Byte-identical to BOTH siblings. If it drifts, a difference between this run and theirs stops
// being attributable to the prompts.
const FIXTURE = {
  "paper/paper.md": [
    "# Prose Isn't Policy: Measuring Whether Agent-Config Rules Are Enforceable",
    "",
    "## Abstract",
    "Agent configuration files state rules in prose and assume the model obeys them. We compile a",
    "corpus of real rules and measure what fraction can be mechanically enforced. We find that 84%",
    "of rules in our corpus are enforceable, and that LLM-authored checkers for the remainder leak",
    "silently in 84-96% of adversarial cases \\cite{greshake2023}.",
    "",
    "## 1 Introduction",
    "Every agent harness ships a natural-language rulebook. Nothing checks it. This is the same",
    "mistake as a code comment that claims an invariant no test enforces \\cite{thompson1984}.",
    "",
    "## 2 Method",
    "We gather rules from public repositories, classify each by enforceability, and build a",
    "two-stage adversarial gate that validates a synthesized rule against a blind gold set.",
    "",
    "## 3 Results",
    "See Table 1. The headline number is 84%.",
    "",
    "## 4 Discussion",
    "The result generalizes beyond our corpus in the sense that the mechanism is not corpus-specific,",
    "though of course the specific percentages are, and it is important to note in this context that",
    "the framing itself may be what carries, rather than the measurement.",
    "",
    "## 5 Threats to Validity",
    "Our corpus is drawn from public repositories and may not represent private configurations.",
    "",
    "## 6 Related Work",
    "TODO",
    "",
    "## 7 Conclusion",
    "Prose is not policy.",
  ].join("\n"),
  "paper/repro/README.md":
    "# Reproduction artifact\n\n`python3 paper_numbers.py` recomputes every bolded figure in paper.md.\n",
  "paper/PIPELINE-STATUS.md":
    "# Pipeline status\n\n| gate | state |\n|---|---|\n| numbers | pass |\n| structure | not run |\n| citations | not run |\n",
};

// ── the 2x2 prompt matrix ────────────────────────────────────────────────────
// cell keys: AH action/high · AL action/low · SH situation/high · SL situation/low
const CASES = [
  {
    skill: "tighten-paper",
    cells: {
      AH: [
        "produce a cut and fold plan for this draft — which sections do not earn their place",
        "tell me which parts are TMI and belong in the appendix instead of the paper",
        "reorder and merge whatever is needed so it is not too long for its contribution",
        "give me a structural verdict on this drafted paper, cover to cover, as an editor would",
      ],
      AL: [
        "decide what gets deleted from this manuscript and list it back to me",
        "tell me which two chapters should be welded into one, and which should go last",
        "I want a shortlist of paragraphs to delete so it fits on fewer pages",
        "rank the chapters by how little they matter, worst first, so I know where to swing the axe",
      ],
      SH: [
        "this feels long and overly complex, and the middle drags",
        "after three review rounds it has collected a lot of hedge-mass",
        "it does not deliver its point and nobody could skim it",
        "it is too long for its contribution and hard to read cover to cover",
      ],
      SL: [
        "people keep bailing out partway through and I cannot tell why",
        "there is a nine page ceiling and I am well over it",
        "my co-author says the whole thing sprawls and he lost the thread",
        "every paragraph seems necessary to me and yet the whole is exhausting",
      ],
    },
  },
  {
    skill: "grade-paper-writing",
    cells: {
      AH: [
        "grade the writing craft in this draft and name the offending sentence in each dimension",
        "run the blind multi-grader panel over the prose clarity and jargon discipline",
        "score the title, the abstract and the intro architecture one to five",
        "grade how well this reads, hedge stacking included, and give me the fix for each",
      ],
      AL: [
        "mark this manuscript out of five on how it is put together at the sentence level",
        "give me a scored report card on the language, with the worst example under each heading",
        "rate how professional the phrasing sounds against papers people actually finish",
        "assign a number to the quality of the English here and point at the ugliest example",
      ],
      SH: [
        "the abstract reads like a wall of jargon",
        "the intro architecture is fine but the prose clarity is not",
        "there is hedge stacking everywhere and the point never lands",
        "the writing does not read well even though the draft is finished",
      ],
      SL: [
        "something about the way this is worded makes me wince and I cannot name it",
        "my supervisor said the English gets in the way of the science",
        "the sentences are correct but they feel like wet cardboard",
        "I went through my own opening twice and still had to start over",
      ],
    },
  },
  {
    skill: "argument-arc",
    cells: {
      AH: [
        "build the one-sentence-per-section outline before the large rewrite",
        "run the bottom-up inevitability pass over the argument architecture",
        "repair the argument architecture — the same structural objection keeps repeating",
        "check the name and number budget, the reader has too much to carry",
      ],
      AL: [
        "give me a single line for each part of the manuscript, working backwards from the finish",
        "make the ending feel unavoidable given everything before it, and tell me what to move",
        "count how many invented labels and figures the audience must memorise, and trim the list",
        "lay out the chain of reasoning as a list so I can see where a link is missing",
      ],
      SH: [
        "the reader says we throw ideas at them",
        "the same structural objection repeats in every round",
        "there is no argument architecture here, just a sequence",
        "we blew the name and number budget somewhere in the middle",
      ],
      SL: [
        "each part is fine alone but together they do not add up to anything",
        "my advisor cannot tell what the conclusion depends on",
        "the ending arrives without having been earned",
        "someone asked me what the point was and I gave three answers",
      ],
    },
  },
];

const CELLS = ["AH", "AL", "SH", "SL"];
const CELL_LABEL = {
  AH: "ACTION  / HIGH overlap",
  AL: "ACTION  / LOW  overlap",
  SH: "SITUATION / HIGH overlap",
  SL: "SITUATION / LOW  overlap",
};

// ── PREFLIGHT ────────────────────────────────────────────────────────────────
// Every guard below fails LOUDLY. A misspelled skill, a changed namespace or a mislabelled cell
// makes the `fired` predicate permanently false, and the run then reports a wall of confident 0.00s
// as though the descriptions were dead. That is the failure mode this block exists to prevent.

// 1. the skills exist and declare the names we test against
const installed = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, "SKILL.md")))
  .map((e) => e.name);
const installedSet = new Set(installed);
for (const c of CASES) {
  if (!installedSet.has(c.skill)) throw new Error(`${c.skill} is not installed under ${SKILLS_DIR}`);
  const fm = readFileSync(join(SKILLS_DIR, c.skill, "SKILL.md"), "utf-8");
  const declared = declaredName(fm);
  if (declared && declared !== c.skill) throw new Error(`${c.skill}/SKILL.md declares name: ${declared}`);
}

const allPrompts = CASES.flatMap((c) => CELLS.flatMap((k) => c.cells[k].map((p) => ({ skill: c.skill, cell: k, prompt: p }))));

// 2. HELD OUT from both siblings — copied from description-language.eval.mjs, extended to cover the
//    third sibling too. A prompt shared with a run that MOTIVATED this question is not held out.
const siblingText = ["pipeline-language.eval.mjs", "pipeline-firing.eval.mjs", "description-language.eval.mjs"]
  .map((f) => join(SKILLS_DIR, "paper-pipeline", f))
  .filter(existsSync)
  .map((f) => readFileSync(f, "utf-8"))
  .join("\n");
for (const { prompt } of allPrompts)
  if (siblingText.includes(prompt))
    throw new Error(
      `PROMPT NOT HELD OUT: "${prompt}" already appears in a sibling eval. This set must share no ` +
        `sentence with the runs that motivated the question, or the cells measure copying.`,
    );

// 3. no prompt reused across cells (a duplicate would silently merge two cells)
const seen = new Set();
for (const { prompt } of allPrompts) {
  if (seen.has(prompt)) throw new Error(`duplicate prompt across cells: "${prompt}"`);
  seen.add(prompt);
}

// 4. diversity, per cell
for (const c of CASES)
  for (const k of CELLS)
    assertPromptDiversity(c.cells[k], { minPrompts: 4, minDistance: 0.3, label: `${c.skill}:${k}` });

// 5. 🔴 THE VOCABULARY FACTOR, CHECKED MECHANICALLY rather than asserted.
// Content-word overlap of a prompt with a skill description: stemmed, stopworded, prompt-normalised
// (what fraction of the prompt's content words the description contains). Prompt-normalised on
// purpose — the hypothesis is about whether the USER's words are in the description, not the reverse.
// ⚠ It is therefore biased toward LONG descriptions, which matters only for the argmax reported
// below, not for the HIGH/LOW contrast (that compares prompts against ONE fixed description).
const STOP = new Set(
  ("a an the and or but if then than that this these those there here it its is are was were be been being am " +
    "do does did doing done have has had having i me my we our you your he she they them their of in on at to " +
    "for with by from as into over under about after before between out up down off again more most some any " +
    "no not nor only own same so too very can will just should now what which who whom whose when where why how " +
    "me myself yourself each both few other such all one two three back keep still even yet get got give given " +
    "make made want need know knew cannot could would might must let us like also because while against would")
    .split(/\s+/),
);
const stem = (w) =>
  w.replace(/(ies)$/, "y").replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2)).replace(/(ing|ed|ly|s)$/, "");
const words = (s) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-zа-яё\s-]/gi, " ")
      .split(/[\s-]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map(stem)
      .filter((w) => w.length >= 3),
  );

const descriptions = {};
for (const name of installed) {
  const t = readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf-8");
  // Parsed, not matched: the old lookahead guessed where a value ended by looking
  // for the next key, which is wrong for folded/literal blocks and for quoted values
  // carrying a colon. This eval RANKS descriptions, so a truncated one moves a score
  // rather than failing.
  const block = frontmatterBlock(t);
  if (block === null) continue;
  descriptions[name] = String(parseFm(block, name).description ?? "")
    .replace(/\s+/g, " ")
    .trim();
}
const descWords = Object.fromEntries(Object.entries(descriptions).map(([k, v]) => [k, words(v)]));

const overlap = (prompt, skill) => {
  const p = words(prompt);
  if (p.size === 0) return 0;
  let hit = 0;
  for (const w of p) if (descWords[skill]?.has(w)) hit++;
  return hit / p.size;
};
/** Which installed skill's description this prompt lexically resembles most (see the length bias above). */
const lexArgmax = (prompt) =>
  installed
    .map((s) => ({ s, o: overlap(prompt, s) }))
    .sort((a, b) => b.o - a.o)[0];

const cellOverlap = {};
for (const c of CASES)
  for (const k of CELLS)
    cellOverlap[`${c.skill}:${k}`] =
      c.cells[k].reduce((a, p) => a + overlap(p, c.skill), 0) / c.cells[k].length;

const MIN_CONTRAST = 0.15;
for (const c of CASES) {
  const hi = (cellOverlap[`${c.skill}:AH`] + cellOverlap[`${c.skill}:SH`]) / 2;
  const lo = (cellOverlap[`${c.skill}:AL`] + cellOverlap[`${c.skill}:SL`]) / 2;
  if (hi - lo < MIN_CONTRAST)
    throw new Error(
      `VOCABULARY LABELS NOT MECHANICALLY SUPPORTED for ${c.skill}: HIGH cells mean overlap ` +
        `${hi.toFixed(3)}, LOW cells ${lo.toFixed(3)}, contrast ${(hi - lo).toFixed(3)} < ${MIN_CONTRAST}. ` +
        `The vocabulary factor is what this experiment varies; if the labels do not survive the ` +
        `metric, the run cannot separate A from B and must not spend a token.`,
    );
}

// 6. THE FRAMING FACTOR gets only a weak guard, and the header says so. Action prompts must carry a
//    request form addressed to the assistant; situation prompts must not. This catches me writing a
//    declarative sentence into an ACTION cell — it does not prove the two cells differ semantically.
const REQUEST =
  /^(produce|tell|give|decide|rank|grade|run|score|mark|rate|assign|build|repair|check|make|count|lay|reorder|merge|cut|fold|list|show|find|write|explain)\b|\bi want\b|\bgive me\b|\btell me\b/i;
for (const c of CASES) {
  for (const p of [...c.cells.AH, ...c.cells.AL])
    if (!REQUEST.test(p)) throw new Error(`ACTION cell prompt carries no request form: "${p}"`);
  for (const p of [...c.cells.SH, ...c.cells.SL])
    if (REQUEST.test(p)) throw new Error(`SITUATION cell prompt reads as a request: "${p}"`);
}

// 7. the harness itself
if (MODE !== "preflight") {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch {
    skip("`claude` CLI not on PATH — the eval tier drives the real harness and cannot be faked");
  }
}

// ── the labelling matrix, printed every run so the factors are auditable ──────
console.log(`\n${installed.length} skills installed → ${installed.length - 1} competitors per run`);
console.log(`\nMEASURED VOCABULARY OVERLAP (prompt content-words found in the target description)`);
console.log(`${"skill".padEnd(22)} ${CELLS.map((k) => k.padStart(6)).join("")}   HIGH-LOW`);
for (const c of CASES) {
  const hi = (cellOverlap[`${c.skill}:AH`] + cellOverlap[`${c.skill}:SH`]) / 2;
  const lo = (cellOverlap[`${c.skill}:AL`] + cellOverlap[`${c.skill}:SL`]) / 2;
  console.log(
    `${c.skill.padEnd(22)} ${CELLS.map((k) => cellOverlap[`${c.skill}:${k}`].toFixed(2).padStart(6)).join("")}` +
      `   +${(hi - lo).toFixed(2)}`,
  );
}

if (MODE === "preflight") {
  console.log(`\nper-prompt overlap, and the skill each prompt most resembles lexically:`);
  for (const c of CASES) {
    console.log(`\n### ${c.skill}`);
    for (const k of CELLS)
      for (const p of c.cells[k]) {
        const a = lexArgmax(p);
        const flag = a.s === c.skill ? "  <- target is argmax" : "";
        console.log(
          `  ${k}  ${overlap(p, c.skill).toFixed(2)}  argmax=${a.s}(${a.o.toFixed(2)})${flag}\n        ${p}`,
        );
      }
  }
  console.log(`\nALL PREFLIGHT GUARDS PASSED. No tokens spent. Run --mode main next.`);
  process.exit(0);
}

// ── ORACLE MODE — the C control ──────────────────────────────────────────────
if (MODE === "oracle") {
  const roster = installed.map((s) => `- ${s}: ${descriptions[s]}`).join("\n");
  const rows = [];
  console.log(`\noracle: ${allPrompts.length} closed-book picks over ${installed.length} descriptions\n`);
  for (const { skill, cell, prompt } of allPrompts) {
    const q =
      `Below is a list of agent skills, each with the description its author wrote.\n\n${roster}\n\n` +
      `A user typed exactly this:\n\n"${prompt}"\n\n` +
      `Which ONE of the skills above should be invoked? Reply with the skill name alone, ` +
      `or the single word NONE if no skill clearly applies. No explanation.`;
    let pick; // без инициализатора: обе ветки try/catch присваивают (2026-08-28)
    try {
      const out = execFileSync("claude", ["-p", q, "--model", "sonnet"], {
        encoding: "utf-8",
        timeout: 180000,
        maxBuffer: 1 << 24,
      });
      const t = out.trim().split("\n").pop().trim().replace(/[.`"']/g, "");
      pick = installedSet.has(t) ? t : /^none$/i.test(t) ? "NONE" : `?${t.slice(0, 40)}`;
    } catch (e) {
      pick = `ERROR:${String(e.message).slice(0, 60)}`;
    }
    const ok = pick === skill;
    rows.push({ skill, cell, prompt, pick, ok });
    console.log(`  ${cell}  ${ok ? "HIT " : "miss"}  ${pick.padEnd(24)}  ${prompt.slice(0, 62)}`);
  }
  console.log(`\nORACLE ACCURACY BY CELL (closed book, 37 descriptions in context, 1 pick each)`);
  console.log(`${"cell".padEnd(26)}  hit   none  wrong`);
  for (const k of CELLS) {
    const r = rows.filter((x) => x.cell === k);
    const hit = r.filter((x) => x.ok).length;
    const none = r.filter((x) => x.pick === "NONE").length;
    console.log(`${CELL_LABEL[k].padEnd(26)}  ${String(hit).padStart(2)}/${r.length}  ${String(none).padStart(4)}  ${String(r.length - hit - none).padStart(5)}`);
  }
  mkdirSync(REPRO, { recursive: true });
  writeFileSync(join(REPRO, "2026-08-08-framing-vs-vocabulary-oracle.json"), JSON.stringify(rows, null, 2));
  console.log(`\nrows → repro/2026-08-08-framing-vs-vocabulary-oracle.json`);
  console.log(
    `\nREAD THIS AS AN UPPER BOUND, NOT A HUMAN. The oracle's task is strictly easier than the ` +
      `harness's (closed book, nothing else to do, no context budget). A cell the ORACLE also ` +
      `misses is a cell whose descriptions do not determine the answer — that is C. A cell the ` +
      `oracle gets and the harness does not is a cell where the information exists and the ` +
      `selector is not using it — that is not C.`,
  );
  process.exit(0);
}

// ── MAIN: the 2x2 ────────────────────────────────────────────────────────────
// One measureTriggerRate call PER PROMPT. The predicate sees a Trace but not which prompt produced
// it, so per-prompt attribution of WHAT FIRED INSTEAD is only available at this granularity — and
// that attribution is the point of the run. The cost is 48 packagings of the skills dir, which is
// a file copy, not a token.
const firedSkills = (t) => [
  ...new Set(
    t.toolCalls
      .filter((c) => c.name === "Skill" && !c.isError && typeof c.input?.skill === "string")
      .map((c) => c.input.skill),
  ),
];

console.log(
  `\nmode=main  ${CASES.length} skills x 4 cells x 4 prompts x ${TRIALS} trials = ` +
    `${CASES.length * 4 * 4 * TRIALS} runs`,
);

const results = [];
for (const c of CASES) {
  for (const k of CELLS) {
    console.log(`\n=== ${c.skill}  [${CELL_LABEL[k]}]`);
    for (const prompt of c.cells[k]) {
      const observed = [];
      const rep = await measureTriggerRate({
        name: `framing-vs-vocabulary:${c.skill}:${k}`,
        skillsDir: SKILLS_DIR,
        prompts: [prompt],
        minPrompts: 1,
        fired: (t) => {
          const set = firedSkills(t);
          observed.push(set);
          return set.includes(id(c.skill));
        },
        fixture: FIXTURE,
        trials: TRIALS,
        allowedTools: ["Skill", "Read"],
        concurrency: 3,
        spacingSec: 2,
        timeoutMs: 180000,
      });
      // TARGET / OTHER / SILENT, per trial.
      const bucket = observed.map((set) =>
        set.includes(id(c.skill)) ? "TARGET" : set.length > 0 ? "OTHER" : "SILENT",
      );
      const others = observed.flat().filter((s) => s !== id(c.skill)).map((s) => s.replace(`${NS}:`, ""));
      results.push({
        skill: c.skill,
        cell: k,
        prompt,
        trials: TRIALS,
        rate: rep.rate,
        errored: rep.errored ?? 0,
        overlap: Number(overlap(prompt, c.skill).toFixed(3)),
        lexArgmax: lexArgmax(prompt).s,
        buckets: bucket,
        othersFired: others,
      });
      const tally = (b) => bucket.filter((x) => x === b).length;
      console.log(
        `  ${rep.rate.toFixed(2)}  T${tally("TARGET")} O${tally("OTHER")} S${tally("SILENT")}` +
          `  ov=${overlap(prompt, c.skill).toFixed(2)}  ${prompt.slice(0, 56)}` +
          (others.length ? `\n         instead: ${[...new Set(others)].join(", ")}` : ""),
      );
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const erroredTotal = results.reduce((a, r) => a + r.errored, 0);
const cellStat = (k, skill) => {
  const rs = results.filter((r) => r.cell === k && (!skill || r.skill === skill));
  const b = rs.flatMap((r) => r.buckets);
  return {
    n: b.length,
    target: b.filter((x) => x === "TARGET").length,
    other: b.filter((x) => x === "OTHER").length,
    silent: b.filter((x) => x === "SILENT").length,
  };
};

console.log(`\n${"=".repeat(78)}\nTHE 2x2 — target trigger rate\n`);
console.log(`${"".padEnd(22)}${"HIGH overlap".padStart(16)}${"LOW overlap".padStart(16)}`);
for (const [row, hk, lk] of [["ACTION", "AH", "AL"], ["SITUATION", "SH", "SL"]]) {
  const h = cellStat(hk), l = cellStat(lk);
  console.log(
    `${row.padEnd(22)}` +
      `${`${((h.target / h.n) * 100).toFixed(0)}% (${h.target}/${h.n})`.padStart(16)}` +
      `${`${((l.target / l.n) * 100).toFixed(0)}% (${l.target}/${l.n})`.padStart(16)}`,
  );
}
const M = Object.fromEntries(CELLS.map((k) => [k, cellStat(k)]));
const r = (k) => M[k].target / M[k].n;
console.log(
  `\nmain effect of FRAMING   (AH+AL) - (SH+SL) = ` +
    `${((((M.AH.target + M.AL.target) / (M.AH.n + M.AL.n)) - ((M.SH.target + M.SL.target) / (M.SH.n + M.SL.n))) * 100).toFixed(0)}pp`,
);
console.log(
  `main effect of VOCABULARY (AH+SH) - (AL+SL) = ` +
    `${((((M.AH.target + M.SH.target) / (M.AH.n + M.SH.n)) - ((M.AL.target + M.SL.target) / (M.AL.n + M.SL.n))) * 100).toFixed(0)}pp`,
);
console.log(
  `\n  A (lexical) predicts   AH high, SH high, AL low,  SL low\n` +
    `  B (framing) predicts   AH high, AL high, SH low,  SL low\n` +
    `  observed               AH ${(r("AH") * 100).toFixed(0)}%  AL ${(r("AL") * 100).toFixed(0)}%  ` +
    `SH ${(r("SH") * 100).toFixed(0)}%  SL ${(r("SL") * 100).toFixed(0)}%`,
);

console.log(`\n${"=".repeat(78)}\nWHAT FIRED INSTEAD — the C discriminator\n`);
console.log(`${"cell".padEnd(26)}  target   other   silent`);
for (const k of CELLS) {
  const s = M[k];
  const p = (x) => `${((x / s.n) * 100).toFixed(0)}%`.padStart(6);
  console.log(`${CELL_LABEL[k].padEnd(26)}  ${p(s.target)}  ${p(s.other)}  ${p(s.silent)}`);
}
console.log(
  `\n  OTHER  = a competitor was selected and the target was not. The prompt routed somewhere;\n` +
    `           the selector disagreed. Ambiguity (C) or a lexically nearer rival (A).\n` +
    `  SILENT = nothing resolved. The target was never selected AND neither was anything else.\n` +
    `           A description that does not cover the phrasing (A or B) — but see caveat 2:\n` +
    `           a run that simply answered the question is also SILENT.`,
);

const misfires = {};
for (const rr of results) for (const o of rr.othersFired) misfires[o] = (misfires[o] ?? 0) + 1;
const top = Object.entries(misfires).sort((a, b) => b[1] - a[1]).slice(0, 12);
if (top.length) {
  console.log(`\nWHICH competitors took the runs (all cells):`);
  for (const [s, n] of top) console.log(`  ${String(n).padStart(3)}  ${s}`);
}

console.log(`\nper-skill, target rate by cell:`);
console.log(`${"skill".padEnd(22)}${CELLS.map((k) => k.padStart(8)).join("")}`);
for (const c of CASES)
  console.log(
    `${c.skill.padEnd(22)}` +
      CELLS.map((k) => {
        const s = cellStat(k, c.skill);
        return `${((s.target / s.n) * 100).toFixed(0)}%`.padStart(8);
      }).join(""),
  );

if (erroredTotal > 0) console.log(`\n⚠ ${erroredTotal} run(s) ERRORED and are excluded — the rates above are over fewer trials than planned.`);

mkdirSync(REPRO, { recursive: true });
writeFileSync(
  join(REPRO, "2026-08-08-framing-vs-vocabulary.json"),
  JSON.stringify({ trials: TRIALS, competitors: installed.length - 1, results }, null, 2),
);
console.log(`\nper-run rows → repro/2026-08-08-framing-vs-vocabulary.json`);
console.log(
  `\nRun --mode oracle before concluding C is dead: the 2x2 alone cannot tell "the description was\n` +
    `not a candidate" from "no description could have been", and that is exactly what C claims.`,
);
