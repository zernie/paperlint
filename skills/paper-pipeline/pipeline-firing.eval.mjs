/**
 * pipeline-firing.eval.mjs — do the paper-pipeline skills actually FIRE when they should?
 *
 * Run:  node .claude/skills/paper-pipeline/pipeline-firing.eval.mjs [flags]
 *   --only <skill>        run one case (repeatable: --only tighten-paper --only argument-arc)
 *   --trials N            trials per prompt (default 1)
 *   --concurrency N       parallel runs (default 3)
 *   --strict              count a run as fired only if the COLLIDING skill stayed silent
 *   --update-baseline     record this run as the committed baseline
 *   --no-gate             report only; do not throw on a threshold breach
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT A HARNESS TEST
 *
 * The owner's complaint: "we lack observability into pipeline status and whether skills are
 * actually being called." `.claude/hooks/hooks.harness.mjs` and `.claude/skills/paper-pipeline/scripts/gates.harness.mjs`
 * test machinery that was ALREADY invoked — they feed a hook an event and check the verdict. No
 * deterministic test can answer the question above, because whether a skill is called is a
 * property of a real model reading 37 competing descriptions and picking one. That is a
 * measurement, it needs the real CLI, and it costs money.
 *
 * 🔴 NOT NOVEL, AND SAYING SO IS THE POINT. `vigiles/s47.md` records the prior art in this exact
 * slot: `adewale/skill-eval-harness` (MIT, 53★, v0.4.2) drives the real `claude`/`codex` binaries
 * and reports an autonomous-trigger-rate MATRIX split by should-fire / should-not-fire — i.e.
 * recall AND precision, empirically, against the real harness. Scott Spence published a real
 * sandboxed activation study against `claude -p` in Feb 2026. AWS `sample-agent-skill-eval` scores
 * a 20%-weighted "Trigger" component. This file measures trigger rate; it does not invent the idea
 * of measuring trigger rate, and nothing built on it should be written up as if it did.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 THE THREE WAYS `hooks.harness.mjs` LIED, AND WHERE EACH ONE LANDS HERE
 *
 *  1. "Assertions must run at MODULE TOP LEVEL — an exported `tests` object ran nothing and the
 *     runner printed ✓." Same trap, worse: an eval that silently measured nothing still prints a
 *     percentage. Everything here runs at top level under a top-level `await`, and the gate
 *     `assertTriggerRate` throws from top level. There is no exported entry point to forget to call.
 *
 *  2. "A probe built on `execFileSync` reported all three react hooks DEAD; the probe could not
 *     see stderr. A checker that can only report failure is worth less than no checker." The eval
 *     version of that bug is a `fired` predicate that can only return false — a wrong skill id, a
 *     wrong plugin namespace, and every rate is 0.00 while the file looks fine. Guarded two ways:
 *     `assertSkillIdsExist` fails loudly at startup if a case names a skill that is not installed,
 *     and a run where EVERY case scores 0.00 is reported as a suspected harness fault, not as a
 *     finding. (Verified live: a smoke run scored 0.50, so the predicate can return true.)
 *
 *  3. "`touches(['<papers-root>/'])` — a trailing slash never matched, and the guard was WEAKER
 *     than the grep it replaced while its header claimed the opposite." The analogue here is
 *     `EvalArm.plugin` vs `pluginDir`: `plugin` materialises a file subset that does NOT register
 *     skills, so a run using it would measure a model that cannot fire a skill at all and would
 *     report 0% as though it were news. This file never uses `plugin`. See the `skillsDir` note.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `skillsDir` AND NOT `pluginDir`
 *
 * Both install NATIVELY (`claude --plugin-dir`), which is the whole point: the real model triggers
 * a skill by its description. `pluginDir` wants a COMPLETE plugin (a `.claude-plugin/plugin.json`);
 * `.claude/skills` is a loose skills directory, so the correct field is `skillsDir`, which vigiles
 * packages into a throwaway `--plugin-dir` install for us (`packageSkillsDir`) and removes after.
 * Verified: the run reports `whole-harness: measured against 36 competing skill(s)`. The installed
 * namespace for a loose dir is `vigiles-loose-skills`, hence the skill ids below.
 *
 * The 36 competitors matter. An ISOLATED trigger rate (one skill, nothing to compete with)
 * OVERSTATES recall and UNDERSTATES false positives, because selection is competitive and Claude
 * Code evicts unused descriptions under a context budget. This eval is the whole-harness tier by
 * construction — every skill in the repo is installed on every run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 API MISMATCH vs. THE BRIEF: `interceptTools` IS NOT ON `TriggerRateSpec`
 *
 * `EvalArm.interceptTools` and `MeasureSpec.interceptTools` exist (`runEval` / `measure`).
 * `TriggerRateSpec` — checked against `node_modules/vigiles/dist/eval.d.ts` — has no such field, so
 * passing one would be silently ignored by an .mjs file and would read as a safety measure that is
 * not there. It is deliberately absent below. Safety comes from three real properties instead:
 *
 *   - `stubSkillBodies` defaults TRUE for trigger runs. Every SKILL.md is rewritten to frontmatter
 *     plus a no-op body before install, so a fired skill stops AT selection. It cannot spawn the
 *     paid subagent panels that `pc-panel-review` and `grade-paper-writing` open with. This is not
 *     a compromise: selection happens from name+description alone, before a body is ever loaded, so
 *     stubbing cannot change what is measured.
 *   - `allowedTools: ["Skill", "Read"]` — no Write, no Edit, no Bash, no Task. The model cannot
 *     write to a paper, push, or spawn a subagent even if it wanted to.
 *   - every run executes in a fresh throwaway cwd seeded only with FIXTURE below. The real
 *     papers tree is never in scope.
 *
 * What `interceptTools` would have added — recording a blocked ATTEMPT so its arguments land in the
 * trace — is not needed here: the question is which Skill was selected, and that call is not
 * blocked. And per its own doc, `interceptTools` prevents side effects only; it does NOT reduce
 * model-call cost. Neither does anything else here. This eval costs real money on every run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT COSTS, MEASURED NOT GUESSED
 *
 * Smoke run 2026-08-07, 2 prompts, sonnet, whole-harness: ~$0.13 API-equivalent per run,
 * ~12.6 s each, ~110k tokens per run of which ~95k came from prompt cache. The default grid is
 * 8 cases × (4 should-fire + 4 should-not-fire) = 64 runs ≈ $8 API-equivalent, ~5 min at
 * concurrency 3. That is why this is NOT wired into the push-triggered CI job — see the
 * `skill-firing` job in .github/workflows/paper-gates.yml, which is `workflow_dispatch` + weekly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ✅ API MISMATCH #3 IS CLOSED — kept because the reasoning was right and the fact expired
 *
 * It USED to read: a bare `npx vigiles eval` prints "No …eval.{mjs,…} files found", because the
 * discovery glob did not descend into dot-directories and `.claude/` is where a Claude Code eval
 * lives by definition. Fixed upstream (`dot: true`) and verified here 2026-08-08: a bare run now
 * matches 5 eval files across the tree and refuses to fire them non-interactively — a consent
 * gate, not a discovery failure. `vigiles audit` can therefore see this file, and the two
 * consequences that used to follow no longer do.
 *
 * The note stays because the LESSON outlives the bug, and because it is the reason nothing here
 * claimed a `Tested` improvement it had not earned: a metric counts what its own discovery can
 * see, so "we wrote the eval" and "the score moved" are different statements. Asserting the
 * second from the first is the "fixed the symptom past the measurement" defect that
 * `compile-rules-2026` is about.
 *
 * ⚠️ Still run it as `node <path>` rather than `vigiles eval <path>` — not for discovery now, but
 * because this file parses its own `--trials` and the CI job passes it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIRST RUN — 2026-08-07, sonnet, 64 runs, 1 trial/prompt, 36 competitors, ~$9.55 API-equivalent
 * (billed to a Claude subscription, $0 metered). Recorded in pipeline-firing.baseline.json.
 *
 *   skill                      recall  FP-rate  precision   n
 *   tighten-paper                75%     0%      100%       4
 *   grade-paper-writing          50%     0%      100%       4
 *   argument-arc                 75%     0%      100%       4
 *   paper-adversarial-review     75%     0%      100%       4
 *   pc-panel-review              75%     0%      100%       4
 *   cold-read-diff               50%     0%      100%       4
 *   verify-citations            100%     0%      100%       4
 *   map-prior-work               75%     0%      100%       4
 *
 * TWO THINGS THIS SAYS, and one it does not.
 *
 * 1. ROUTING IS NOT THE PROBLEM. Every colliding pair scored 0% false positives and 100%
 *    precision. `tighten-paper` never fired on a prose-craft prompt; `pc-panel-review` never fired
 *    on "one hostile reviewer"; `verify-citations` never fired on "who already did this". The
 *    "which skill?" callouts those SKILL.md files open with are doing their job. This was the
 *    hypothesis the case list was built to test, and it came back negative — the skills do not
 *    steal each other's work.
 *
 * 2. RECALL IS THE PROBLEM. 25 of 32 should-fire prompts fired: seven of eight skills miss at
 *    least one prompt a person would really type, and only `verify-citations` fired every time
 *    (pass^k = 1). A skill that fires 50-75% of the time is not broken, but it is also not the
 *    thing the pipeline docs assume when they say "run tighten-paper first".
 *
 * 3. 🔴 A HYPOTHESIS, EXPLICITLY NOT A RESULT — LANGUAGE. Eight of the nine misses were
 *    Russian-language prompts. Recall splits 10/18 (56%) on Russian against 13/14 (93%) on
 *    English; Fisher exact two-sided p = 0.044. That would matter a lot here, because the owner
 *    types Russian constantly and every skill description is written in English.
 *
 *    Do NOT act on this number yet, for three reasons that are not hedging:
 *      - POST HOC. The split was noticed in the output, not designed for. A pattern found by
 *        looking at 32 outcomes and picking the one that stands out is worth p ≈ 0.044 much less
 *        than a pattern predicted in advance.
 *      - CONFOUNDED. The Russian prompts are not translations of the English ones — they are
 *        different prompts asking different things. Language is entangled with content, so the
 *        effect could be "these particular four questions are harder", not "Russian".
 *      - ONE TRIAL. At one trial per prompt each cell is a coin flip observed once. `tighten-paper`
 *        already flipped: a smoke run the same morning scored the "14 pages against a 9 page limit"
 *        prompt 0.00, the full run scored it 1.00.
 *
 *    THE DESIGNED VERSION, if this is worth settling: take the 14 English prompts, translate each
 *    to Russian, and run both sets at --trials 5. That is a matched pair — same content, one
 *    variable — and it costs about the same as one full run above. Until then this is a lead.
 */

import {
  assertTriggerRate,
  assertPromptDiversity,
  checkPromptDiversity,
  formatTriggerRateReport,
  skillResolved,
  readBaseline,
  writeBaseline,
  diffReports,
  formatBaselineDiff,
  assertNoRegression,
  skip,
} from "vigiles";
import { paid_measureTriggerRate as measureTriggerRate } from "vigiles/eval";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { frontmatterBlock } from "../../lib/markdown.mjs";
import { parseFm } from "../../lib/skill-corpus.mjs";
import { installedSkills } from "./scripts/consumer.mjs";

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
const BASELINE = join(
  SKILLS_DIR,
  "paper-pipeline",
  "pipeline-firing.baseline.json",
);

/** The namespace `packageSkillsDir` installs a LOOSE skills dir under. Not a guess — see eval.js. */
const NS = "vigiles-loose-skills";
const id = (skill) => `${NS}:${skill}`;

// ── flags ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const val = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const onlys = argv.reduce(
  (acc, a, i) => (a === "--only" && argv[i + 1] ? [...acc, argv[i + 1]] : acc),
  [],
);
const TRIALS = Number(val("trials", "1"));
const CONCURRENCY = Number(val("concurrency", "3"));
const STRICT = flag("strict");
const GATE = !flag("no-gate");

// ── the filesystem CONTEXT the skills are measured in ────────────────────────
// The default empty cwd is faithful for opening-move skills but biased LOW for skills whose
// trigger is a repo STATE. These skills all presuppose "there is a paper here", so the paper is
// seeded. Deliberately small: it is scenery, not a document under test.
//
// 🔴 HONEST GAP: `cold-read-diff`'s real trigger is a DIRTY GIT TREE ("prose I just changed").
// `fixture` writes plain files; it cannot seed a git history or a diff. Its recall below is
// therefore a LOWER bound, and a low number for that case is partly an artifact of this gap, not
// necessarily a description defect. Do not report it as one.
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

// ── the cases ────────────────────────────────────────────────────────────────
// Chosen where descriptions make COMPETING CLAIMS on the same territory, because that is where
// triggering actually fails. Three of these skills open their SKILL.md with a "which skill?"
// callout precisely because they collide — that callout is prose, and prose is not policy, which
// is the thesis of the paper in the fixture above.
//
// `collides` names the sibling whose prompts become this case's `irrelevantPrompts`. That is how
// "the WRONG skill must not fire" is asserted: the sibling's own should-fire prompts are fed to
// this case, and any firing is a false positive. It is symmetric — each side of a collision is
// measured from both directions — and it is the API-native form of `assertToolNotUsed`, which
// cannot be used inside `fired` (it throws; `fired` must return a boolean).
const CASES = [
  {
    skill: "tighten-paper",
    why: "structural bloat — cut/fold/merge, NOT sentence craft",
    prompts: [
      "статья раздулась, середина провисает — что резать?",
      "this draft is 14 pages against a 9 page limit, what goes",
      "после трёх раундов ревью там одна вода и хеджи, нужен план сокращения",
      "sections 4 and 5 say the same thing twice, and nobody would skim any of it",
    ],
    collides: ["grade-paper-writing", "argument-arc"],
  },
  {
    skill: "grade-paper-writing",
    why: "prose craft — the sentence is the unit, NOT the section",
    prompts: [
      "оцени как написано — читается как стена жаргона",
      "is the writing any good or does it read like shit",
      "abstract звучит криво хотя по смыслу всё на месте, дай оценку прозе",
      "grade the craft: title, abstract, sentence clarity, hedge stacking",
    ],
    collides: ["tighten-paper", "argument-arc"],
  },
  {
    skill: "argument-arc",
    why: "argument architecture — does one conclusion become inevitable",
    prompts: [
      "ревьюер второй раз пишет что мы кидаем в него идеи без связи",
      "does the paper actually carry a reader to one conclusion or just list stuff",
      "мы вводим пять именованных штук и три числа — по-моему это перебор",
      "before the big rewrite I want one sentence per section, bottom up",
    ],
    collides: ["tighten-paper", "grade-paper-writing"],
  },
  {
    skill: "paper-adversarial-review",
    why: "ONE hostile reviewer, fast",
    prompts: [
      "red-team эту статью, чем будет бить reviewer 2",
      "would reviewer 2 buy this claim about the hook finding",
      "найди слабые места до сабмита — один злой но честный рецензент",
      "what is our desk reject risk and where do we overclaim",
    ],
    collides: ["pc-panel-review"],
  },
  {
    skill: "pc-panel-review",
    why: "the WHOLE committee + an accept probability, not one reviewer",
    prompts: [
      "какая вероятность принятия у этой статьи, если честно",
      "simulate the whole program committee, not one reviewer",
      "что решат на PC discussion — accept или reject",
      "нужно несколько независимых ревьюеров с разными линзами плюс мета-ревью от чейра",
    ],
    collides: ["paper-adversarial-review"],
  },
  {
    skill: "cold-read-diff",
    why: "fires AFTER a prose edit — the reader with no context",
    prompts: [
      "я переписал третий абзац intro — проверь что предложения вообще что-то значат",
      "just edited the threats section, would a reader with no context get it",
      "поправил формулировки в 4.2, прогони свежим читателем до того как я закрою правку",
      "эти предложения короткие, правдивые и всё равно непонятно что они утверждают",
    ],
    collides: ["grade-paper-writing", "tighten-paper"],
  },
  {
    skill: "verify-citations",
    why: "are the cites REAL — a pre-submit metadata gate",
    prompts: [
      "проверь что все цитаты настоящие перед сабмитом",
      "did we hallucinate any of these refs",
      "сверь метаданные по каждому cite — год, венью, авторы, doi",
      "one bibtex entry looks invented to me, check the whole bibliography",
    ],
    collides: ["map-prior-work"],
  },
  {
    skill: "map-prior-work",
    why: "who already did this — BEFORE drafting, reshapes the contribution",
    prompts: [
      "кто уже это сделал до нас — хочу знать до того как начну писать",
      "sweep the landscape: everyone working on this, prior versus concurrent",
      "нужен скелет related work и вердикт что мы ещё можем клеймить своим",
      "find every competing group in this space and date them against our submission",
    ],
    collides: ["verify-citations"],
  },
];

/**
 * Irrelevant set for a case: its colliders' should-fire prompts, sliced so no two cases receive
 * the identical set (near-duplicate sets pass the per-set diversity gate but make two cases'
 * false-positive rates the same measurement twice).
 */
const bySkill = new Map(CASES.map((c) => [c.skill, c]));
const irrelevantFor = (c) => {
  const take = c.collides.length === 1 ? 4 : 2;
  return c.collides.flatMap((s, i) => {
    const p = bySkill.get(s).prompts;
    return take === 4 ? p : i === 0 ? p.slice(0, 2) : p.slice(2, 4);
  });
};

// ── preflight: fail LOUDLY rather than measuring nothing ─────────────────────
// Lie #2's shape, transplanted. A misspelled skill or a changed namespace makes every `fired`
// predicate permanently false, and the run then reports a wall of confident 0.00s.
function assertSkillIdsExist() {
  if (!existsSync(SKILLS_DIR))
    throw new Error(`no skills dir at ${SKILLS_DIR}`);
  // Through `installedSkills`, which follows the links `paperlint init` makes (paperlint#62).
  const installed = new Set(installedSkills(SKILLS_DIR));
  const missing = CASES.map((c) => c.skill).filter((s) => !installed.has(s));
  if (missing.length)
    throw new Error(
      `these cases name skills that are not installed under ${SKILLS_DIR}: ${missing.join(", ")}. ` +
        `Every \`fired\` predicate for them would be permanently false and the run would report 0.00 as a finding.`,
    );
  // And the frontmatter `name:` must equal the directory name — the id the model reports is built
  // from the directory, but a mismatch means the SKILL.md a human reads is not the one measured.
  for (const c of CASES) {
    const fm = readFileSync(join(SKILLS_DIR, c.skill, "SKILL.md"), "utf-8");
    const declared = declaredName(fm);
    if (declared && declared !== c.skill)
      throw new Error(
        `${c.skill}/SKILL.md declares name: ${declared} — id mismatch, fix one of them`,
      );
  }
  return installed.size;
}

const installedCount = assertSkillIdsExist();

// Free, deterministic, and it runs BEFORE anything spends a token — the same order
// `measureTriggerRate` uses internally. A prompt set that all reads the same way makes a high
// trigger rate meaningless: the model would be answering one question four times.
for (const c of CASES) {
  assertPromptDiversity(c.prompts, {
    minPrompts: 4,
    minDistance: 0.3,
    label: `${c.skill}:should-fire`,
  });
  assertPromptDiversity(irrelevantFor(c), {
    minPrompts: 4,
    minDistance: 0.3,
    label: `${c.skill}:should-not-fire`,
  });
}
// Cross-set too: two cases whose should-fire sets are near-identical are not two measurements.
for (let i = 0; i < CASES.length; i++)
  for (let j = i + 1; j < CASES.length; j++) {
    const issues = checkPromptDiversity(
      [...CASES[i].prompts, ...CASES[j].prompts],
      {
        minPrompts: 8,
        minDistance: 0.25,
        label: `${CASES[i].skill} × ${CASES[j].skill}`,
      },
    );
    if (issues.length) throw new Error(issues.map((x) => x.message).join("\n"));
  }

console.log(
  `prompt sets: OK (${CASES.length} cases, ${CASES.length * 8} runs × ${TRIALS} trial(s), ` +
    `${installedCount} skills installed → ${installedCount - 1} competitors per run)`,
);

// The eval tier needs the real binary. A missing CLI is a SKIP, never a silent pass.
try {
  execFileSync("claude", ["--version"], { stdio: "ignore" });
} catch {
  skip(
    "`claude` CLI not on PATH — the eval tier drives the real harness and cannot be faked",
  );
}

const selected = onlys.length
  ? CASES.filter((c) => onlys.includes(c.skill))
  : CASES;
if (selected.length === 0)
  throw new Error(
    `--only matched nothing. Known: ${CASES.map((c) => c.skill).join(", ")}`,
  );

// ── the measurement ──────────────────────────────────────────────────────────
const results = [];
for (const c of selected) {
  const colliderIds = c.collides.map(id);
  const report = await measureTriggerRate({
    name: `pipeline-firing:${c.skill}${STRICT ? ":strict" : ""}`,
    // NOT `plugin` (materialises files, registers no skills) and NOT `pluginDir` (wants a complete
    // plugin). `skillsDir` packages this loose dir into a real `--plugin-dir` install. See header.
    skillsDir: SKILLS_DIR,
    prompts: c.prompts,
    irrelevantPrompts: irrelevantFor(c),
    // In strict mode a run counts as fired only if the right skill fired AND every colliding
    // sibling stayed silent — "the wrong one did NOT fire", read off the trace's skill list.
    fired: STRICT
      ? (t) =>
          skillResolved(t, id(c.skill)) &&
          !colliderIds.some((x) => skillResolved(t, x))
      : (t) => skillResolved(t, id(c.skill)),
    fixture: FIXTURE,
    // 4, not the default 10: these are deliberately narrow skills and the grid is already 64 runs.
    // Lowering it is a REAL loss of power — at n=4 a rate is ±0.25 per prompt, so read the
    // per-prompt lines, not the third decimal of the mean.
    minPrompts: 4,
    minDistance: 0.3,
    trials: TRIALS,
    // Selection only. No Write/Edit/Bash/Task: this eval cannot touch a paper, push, or spawn a
    // paid subagent. Read is allowed because a real user's prompt refers to a file.
    allowedTools: ["Skill", "Read"],
    // stubSkillBodies defaults true — every body is a no-op, so a fired panel skill stops at
    // selection instead of opening N reviewer subagents. Left implicit deliberately: overriding it
    // to false is what would need a justification, not leaving it on.
    concurrency: CONCURRENCY,
    spacingSec: 2,
    timeoutMs: 180000,
  });
  console.log(`\n=== ${c.skill} — ${c.why}`);
  console.log(`    collides with: ${c.collides.join(", ")}`);
  console.log(formatTriggerRateReport(report));
  results.push({ case: c, report });
}

// ── read the result ──────────────────────────────────────────────────────────
const pct = (x) =>
  x === undefined ? "  —  " : `${(x * 100).toFixed(0)}%`.padStart(5);
console.log(`\n${"skill".padEnd(26)} recall  FP-rate  precision   n   cost`);
for (const { case: c, report: r } of results)
  console.log(
    `${c.skill.padEnd(26)} ${pct(r.rate)}  ${pct(r.falsePositiveRate)}   ${pct(r.precision)}   ` +
      `${String(r.n).padStart(3)}   $${r.usage.totalCostUsd.toFixed(2)}`,
  );
const spend = results.reduce((s, x) => s + x.report.usage.totalCostUsd, 0);
console.log(
  `${"".padEnd(26)}                              total  $${spend.toFixed(2)}`,
);

// 🔴 DID A MEASUREMENT HAPPEN AT ALL? This has to be answered BEFORE the floor gate below,
// because the two failures look identical from the outside and mean opposite things.
//
// Observed 2026-08-10 and 2026-08-17 — the only two scheduled runs this canary has ever had,
// both `failure`, every case 0.00, total $0.00. That reads as "every skill stopped firing",
// which is a five-alarm finding. It was not: the model never ran. The CLI guard above passes in
// CI (the job installs the binary) and nothing checked for a CREDENTIAL, so a keyless run walked
// straight into the floor gate and reported an environment fault as a regression. Eight days of
// red that nobody could act on, because the message pointed at the wrong thing.
//
// The check is on the IMPOSSIBLE STATE rather than on a list of causes: real model calls cost
// money, so zero spend across every case means no call was billed — whatever the reason (absent
// key, revoked key, network, quota). Enumerating causes would leave the next one undetected.
if (results.length > 0 && spend === 0) {
  const everythingZero = results.every(({ report: r }) => r.rate === 0);
  throw new Error(
    `NO MEASUREMENT HAPPENED — ${String(results.length)} case(s) ran and total spend is $0.00` +
      (everythingZero ? " with every recall at 0.00" : "") +
      `.\nReal model calls are billed, so zero spend means no call reached a model. This is an ` +
      `ENVIRONMENT fault, not a trigger-rate regression — do not read the numbers below as a ` +
      `finding about the skills.\nMost likely: no credential. ANTHROPIC_API_KEY is ` +
      `${process.env.ANTHROPIC_API_KEY ? "set" : "NOT SET"} in this process. The \`claude --version\` ` +
      `guard above cannot see this: the binary installs fine without a key.`,
  );
}

// Lie #2 again: an eval that measured nothing must not read as a finding.
if (results.length > 1 && results.every((x) => x.report.rate === 0))
  throw new Error(
    "EVERY case scored 0.00. That is far more likely a harness fault (wrong namespace, skills not " +
      "installed, `fired` predicate broken) than eight simultaneously dead descriptions. Do not " +
      "record this as a baseline — check the trace of one run first.",
  );

// ── baseline / regression ────────────────────────────────────────────────────
// 🔴 API MISMATCH #2: `writeBaseline`/`readBaseline`/`assertNoRegression` are typed on
// `EvalReport` (arms × metrics × MetricStat), while `measureTriggerRate` returns a
// `TriggerRateReport`. There is no adapter in the package, so one is written here: each case
// becomes an ARM, `recall` and `falsePositiveRate` become METRICS, and the Bernoulli stats are
// derived from the per-prompt fired counts. Nothing is invented — std is the sample std of the
// 0/1 outcomes, n is the real run count.
const bernoulli = (successes, n) => {
  const mean = n > 0 ? successes / n : 0;
  const std = n > 1 ? Math.sqrt((mean * (1 - mean) * n) / (n - 1)) : 0;
  return {
    mean,
    std,
    se: n > 0 ? std / Math.sqrt(n) : 0,
    n,
    passK: n > 0 && successes === n ? 1 : 0,
  };
};
const asEvalReport = () => {
  const arms = {};
  for (const { case: c, report: r } of results) {
    const fired = r.perPrompt.reduce((s, p) => s + p.fired, 0);
    const irrFired = (r.perIrrelevant ?? []).reduce((s, p) => s + p.fired, 0);
    const irrN = (r.perIrrelevant ?? []).reduce((s, p) => s + p.trials, 0);
    const recall = bernoulli(fired, r.n);
    const fp = bernoulli(irrFired, irrN);
    arms[c.skill] = {
      runs: r.n + irrN,
      metrics: { recall: recall.mean, falsePositiveRate: fp.mean },
      stats: { recall, falsePositiveRate: fp },
      usage: r.usage,
    };
  }
  return {
    name: `pipeline-firing${STRICT ? ":strict" : ""}`,
    trials: TRIALS,
    arms,
    totalCostUsd: spend,
    aborted: false,
  };
};

const current = [asEvalReport()];
if (flag("update-baseline")) {
  writeBaseline(BASELINE, current);
  console.log(`\nbaseline recorded → ${BASELINE}`);
} else {
  const prior = readBaseline(BASELINE);
  if (!prior) {
    console.log(
      `\nno baseline at ${BASELINE} — record one with --update-baseline`,
    );
  } else if (onlys.length) {
    console.log(
      "\n--only run: skipping the regression diff (a partial run is not comparable)",
    );
  } else {
    const diff = diffReports(prior, current, {
      lowerIsBetter: ["falsePositiveRate"],
    });
    console.log(`\nvs baseline recorded ${prior.recordedAt}:`);
    console.log(formatBaselineDiff(diff));
    // 🔴 READ THIS BEFORE TRUSTING THE GATE. Welch on 4 Bernoulli trials per metric has almost no
    // power: a drop from 100% to 50% is not significant at n=4, so this gate catches only a
    // COLLAPSE. Raise --trials (3 trials ⇒ n=12) for a gate that catches drift rather than death.
    if (GATE && TRIALS >= 3)
      assertNoRegression(current, prior, {
        lowerIsBetter: ["falsePositiveRate"],
      });
    else if (GATE)
      console.log(
        "  (regression gate not enforced: needs --trials 3 or more to have power)",
      );
  }
}

// ── the absolute floor ───────────────────────────────────────────────────────
// Deliberately LOW, and the low number is the honest one. These are not tuned thresholds — they
// are the line below which a description is BROKEN rather than noisy, and there is no measured
// history yet to justify anything tighter. The drift question belongs to the baseline diff above,
// not to a number invented here. Tighten these only against recorded runs.
//
// Precision is NOT gated. A colliding sibling firing alongside the right skill is often CORRECT
// chaining — grade-paper-writing's own description says to run tighten-paper first on a bloated
// draft — so a false positive here means "fired on a prompt another skill owns", which includes
// legitimate hand-offs. Gating it would punish the composition these skills are designed for.
const FLOOR = { min: 0.5, maxFalsePositive: 0.75 };
if (GATE) {
  const failures = [];
  for (const { case: c, report: r } of results) {
    try {
      assertTriggerRate(r, FLOOR);
    } catch (e) {
      failures.push(`${c.skill}: ${e.message}`);
    }
  }
  if (failures.length)
    throw new Error(`trigger floor breached:\n  ${failures.join("\n  ")}`);
  console.log(
    `\nfloor OK: every case ≥ ${FLOOR.min * 100}% recall, ≤ ${FLOOR.maxFalsePositive * 100}% false positives`,
  );
}
