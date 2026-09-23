/**
 * description-language.eval.mjs — does adding Russian to a skill's DESCRIPTION close the language gap?
 *
 * Run:  node .claude/skills/paper-pipeline/description-language.eval.mjs --arm before|after [--trials N]
 *
 *   --arm before   measure with the descriptions AS THEY ARE (English only)   <- run this FIRST
 *   --arm after    measure again once Russian trigger vocabulary is added
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A THIRD EVAL FILE, AND WHY IT CANNOT REUSE THE OTHER ONE'S PROMPTS
 *
 * `pipeline-language.eval.mjs` established the effect: English 78.1% vs Russian 60.4% recall over 32
 * matched pairs at 3 trials, paired sign test p = 0.0074, present in both translation directions. The
 * obvious remedy is to put Russian trigger vocabulary in the descriptions, since every description is
 * English and the author types Russian.
 *
 * 🔴 THAT REMEDY CANNOT BE MEASURED ON THAT FILE'S PROMPTS, AND THE REASON IS NOT PEDANTRY. Writing a
 * Russian description means writing, in Russian, what the skill does. The prompts in the other file
 * were also written as natural Russian for what the skill does. So the vocabulary overlaps NOT because
 * anyone cheated but because both are translations of the same function — and a run on those prompts
 * would then measure how well I copied, not whether the intervention works on language the model has
 * not already been handed.
 *
 * Anthropic's own `skill-creator` guards this with a 60/40 train/held-out split and selects the best
 * description BY TEST SCORE rather than train score, "to avoid overfitting". This file is the same
 * discipline in the cheapest honest form: an entirely FRESH prompt set, written for this experiment,
 * sharing no sentence with the other eval — and measured BEFORE the descriptions change, so the
 * comparison is a real A/B rather than a memory of an older run under different conditions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CANNOT SETTLE, stated up front rather than discovered later
 *
 *  - The prompts below were written by the same model that will write the Russian descriptions, and
 *    that model has read the other eval's prompts. Fresh CONTENT is guaranteed; fresh VOCABULARY is
 *    not, and cannot be while one author does both. A clean version needs prompts from a HUMAN, written
 *    before that person sees the descriptions.
 *  - n is 4 prompts x 3 trials = 12 runs per cell. That resolves a collapse, not a drift. Read the
 *    direction and the per-prompt lines, never the third decimal.
 *  - The ENGLISH arm is measured too, and that is not symmetry for its own sake: descriptions get
 *    LONGER, all 37 compete for a context budget, and Claude Code evicts unused descriptions under
 *    pressure. An intervention that lifts Russian by hurting English is a loss, and only measuring
 *    both can see it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CONTROL ARM RESULT — 2026-08-07, and it stopped the intervention before it was built
 * Raw log: `repro/2026-08-07-description-language-control.log`
 *
 *   grade-paper-writing   ru 25%  en 25%    (old set: -42pp)
 *   argument-arc          ru 25%  en 17%    (old set: -33pp)
 *   tighten-paper         ru 42%  en 33%    (old set: -25pp)
 *   OVERALL               ru 11/36 (31%)  en 9/36 (25%)   +6pp, Russian slightly HIGHER
 *
 * The language gap did not appear. But the number that matters is not the gap — it is that BOTH
 * arms collapsed to 25-31%, against 78%/60% on the other eval's prompts. These skills mostly do not
 * fire on this prompt set AT ALL, in either language.
 *
 * WHY, and it is the design working rather than failing. The other eval's prompts NAME the action
 * ("статья раздулась, что резать?"). These deliberately describe the situation instead ("текст не
 * влезает, надо решить чем пожертвовать и куда это переложить") — because a prompt sharing
 * vocabulary with the description would have measured how well the description was copied. Remove
 * the shared vocabulary and recall falls by a factor of two to three.
 *
 * TWO CONCLUSIONS, and the second is the one that changes what to do.
 *
 * 1. This does NOT refute the language finding. At 25-31% both arms sit on the floor, and a 6pp
 *    difference there has no power behind it. The right reading is "this prompt set cannot test the
 *    language question", not "the effect is gone".
 *
 * 2. When the user does not name the action in the description's own words, these skills miss
 *    60-75% of the time REGARDLESS OF LANGUAGE. That is a larger defect than the language gap, and
 *    it makes the planned intervention — add Russian vocabulary — aim at the wrong thing. Adding
 *    Russian to a description that already fails on oblique English phrasing buys the narrower half
 *    of a wider problem.
 *
 * So the `after` arm was never run: an A/B on descriptions is worth nothing while the baseline sits
 * at a quarter. The open question is no longer "does Russian in the description close the gap" but
 * "why does a description only fire when the user happens to name its verb", and that is a
 * different experiment.
 */

import { assertPromptDiversity, skillResolved, skip } from "vigiles";
import { paid_measureTriggerRate as measureTriggerRate } from "vigiles/eval";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const NS = "vigiles-loose-skills";
const id = (skill) => `${NS}:${skill}`;

const argv = process.argv.slice(2);
const val = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const ARM = val("arm", "");
const TRIALS = Number(val("trials", "3"));
if (ARM !== "before" && ARM !== "after")
  throw new Error(
    "--arm must be `before` (English-only descriptions) or `after` (Russian added)",
  );

// Byte-identical to the other two evals. If these drift, a difference between runs stops being
// attributable to the descriptions.
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

// ── the FRESH prompt set ─────────────────────────────────────────────────────
// The three skills with the widest measured gap: grade-paper-writing -42pp, argument-arc -33pp,
// tighten-paper -25pp. Four Russian prompts each, all NEW — none appears in
// pipeline-language.eval.mjs or pipeline-firing.eval.mjs, and none is a translation of a prompt
// there. English counterparts are carried so the same run reports whether the intervention costs
// the English arm anything.
const CASES = [
  {
    skill: "grade-paper-writing",
    gapPp: -42,
    prompts: [
      {
        ru: "у меня ощущение, что вступление написано тяжело, но я не понимаю чем именно",
        en: "the introduction feels heavy to me and I cannot tell what exactly makes it so",
      },
      {
        ru: "рецензент назвал текст многословным — согласен ли ты и где конкретно",
        en: "a reviewer called the text wordy — do you agree, and where exactly",
      },
      {
        ru: "нужен разбор по пунктам: заголовок, первый абзац, подача выводов",
        en: "I want a point-by-point breakdown: the title, the opening paragraph, how findings are delivered",
      },
      {
        ru: "сравни как это написано с тем, как пишут сильные статьи в этой области",
        en: "compare how this is written against how strong papers in this field are written",
      },
    ],
  },
  {
    skill: "argument-arc",
    gapPp: -33,
    prompts: [
      {
        ru: "я сам путаюсь, зачем в статье нужна четвёртая секция",
        en: "I am myself unsure what the fourth section is even for",
      },
      {
        ru: "хочу проверить, что каждая часть работает на итоговое утверждение",
        en: "I want to check that every part works toward the final claim",
      },
      {
        ru: "если убрать середину, изменится ли что-нибудь для вывода",
        en: "if the middle came out, would anything change for the conclusion",
      },
      {
        ru: "у нас слишком много терминов, которые читателю придётся запоминать",
        en: "there are too many terms the reader will have to keep in their head",
      },
    ],
  },
  {
    skill: "tighten-paper",
    gapPp: -25,
    prompts: [
      {
        ru: "текст не влезает, надо решить чем пожертвовать и куда это переложить",
        en: "the text does not fit; decide what to sacrifice and where to move it",
      },
      {
        ru: "какие куски спокойно уедут в приложение без потери для рецензента",
        en: "which chunks can move to an appendix without costing the reviewer anything",
      },
      {
        ru: "мне кажется, третья и пятая части дублируют друг друга — так ли это",
        en: "I suspect parts three and five duplicate each other — is that so",
      },
      {
        ru: "нужен план, что убрать, чтобы статья стала на страницу короче",
        en: "I need a plan for what to remove to make the paper one page shorter",
      },
    ],
  },
];

// Preflight: a misspelled skill or a changed namespace makes every `fired` predicate permanently
// false, and the run then reports a wall of confident 0.00s as though the descriptions were dead.
const installed = new Set(
  readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, "SKILL.md")),
    )
    .map((e) => e.name),
);
for (const c of CASES) {
  if (!installed.has(c.skill))
    throw new Error(`${c.skill} is not installed under ${SKILLS_DIR}`);
  const fm = readFileSync(join(SKILLS_DIR, c.skill, "SKILL.md"), "utf-8");
  const declared = declaredName(fm);
  if (declared && declared !== c.skill)
    throw new Error(`${c.skill}/SKILL.md declares name: ${declared}`);
}

// 🔴 The guard that makes the `after` arm honest: no prompt here may appear in the sibling evals.
// A prompt shared with the file that MOTIVATED the intervention is not held-out, and the whole
// design rests on this set being fresh. Checked mechanically because a promise would rot.
const siblingText = ["pipeline-language.eval.mjs", "pipeline-firing.eval.mjs"]
  .map((f) => join(SKILLS_DIR, "paper-pipeline", f))
  .filter(existsSync)
  .map((f) => readFileSync(f, "utf-8"))
  .join("\n");
for (const c of CASES)
  for (const p of c.prompts)
    for (const lang of ["ru", "en"])
      if (siblingText.includes(p[lang]))
        throw new Error(
          `PROMPT NOT HELD OUT: "${p[lang]}" already appears in a sibling eval. This set must share no ` +
            `sentence with the run that motivated the intervention, or the "after" arm measures copying.`,
        );

for (const c of CASES)
  for (const lang of ["ru", "en"])
    assertPromptDiversity(
      c.prompts.map((p) => p[lang]),
      {
        minPrompts: 4,
        minDistance: 0.3,
        label: `${c.skill}:${lang}`,
      },
    );

try {
  execFileSync("claude", ["--version"], { stdio: "ignore" });
} catch {
  skip(
    "`claude` CLI not on PATH — the eval tier drives the real harness and cannot be faked",
  );
}

console.log(
  `arm=${ARM}  ${CASES.length} skills x 4 fresh prompts x 2 languages x ${TRIALS} trials = ` +
    `${CASES.length * 4 * 2 * TRIALS} runs; ${installed.size} skills installed`,
);

const rows = [];
for (const c of CASES) {
  const per = {};
  for (const lang of ["ru", "en"]) {
    per[lang] = await measureTriggerRate({
      name: `description-language:${c.skill}:${lang}:${ARM}`,
      skillsDir: SKILLS_DIR,
      prompts: c.prompts.map((p) => p[lang]),
      fired: (t) => skillResolved(t, id(c.skill)),
      fixture: FIXTURE,
      minPrompts: 4,
      minDistance: 0.3,
      trials: TRIALS,
      allowedTools: ["Skill", "Read"],
      concurrency: 3,
      spacingSec: 2,
      timeoutMs: 180000,
    });
  }
  rows.push({ case: c, per });
  console.log(`\n=== ${c.skill}  (measured gap on the OLD set: ${c.gapPp}pp)`);
  for (const lang of ["ru", "en"]) {
    console.log(`  ${lang}: ${(per[lang].rate * 100).toFixed(0)}%`);
    per[lang].perPrompt.forEach((p) =>
      console.log(
        `    ${(p.fired / p.trials).toFixed(2)}  ${p.prompt.slice(0, 68)}`,
      ),
    );
  }
}

const tally = (lang) =>
  rows.reduce(
    (a, r) => {
      r.per[lang].perPrompt.forEach((p) => {
        a.f += p.fired;
        a.n += p.trials;
      });
      return a;
    },
    { f: 0, n: 0 },
  );
const RU = tally("ru"),
  EN = tally("en");
console.log(`\n${"skill".padEnd(24)}   ru     en`);
for (const { case: c, per } of rows)
  console.log(
    `${c.skill.padEnd(24)} ${`${(per.ru.rate * 100).toFixed(0)}%`.padStart(4)}  ${`${(per.en.rate * 100).toFixed(0)}%`.padStart(4)}`,
  );
console.log(
  `\nARM=${ARM}   RU ${RU.f}/${RU.n} (${((RU.f / RU.n) * 100).toFixed(0)}%)   ` +
    `EN ${EN.f}/${EN.n} (${((EN.f / EN.n) * 100).toFixed(0)}%)   gap ${(((RU.f - EN.f) / RU.n) * 100).toFixed(0)}pp`,
);
console.log(
  `\nRun the OTHER arm and compare BOTH columns. Russian rising while English falls is a LOSS: ` +
    `longer descriptions compete for the same context budget across all ${installed.size} skills.`,
);
