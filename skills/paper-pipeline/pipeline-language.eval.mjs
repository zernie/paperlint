/**
 * pipeline-language.eval.mjs — does prompt LANGUAGE change whether a skill fires?
 *
 * Run:  node .claude/skills/paper-pipeline/pipeline-language.eval.mjs [flags]
 *   --trials N        trials per prompt (default 3)
 *   --concurrency N   parallel runs (default 3)
 *   --only <skill>    run one case (repeatable)
 *   --update-baseline record this run as the committed baseline
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SETTLES, AND WHY IT IS A SEPARATE FILE
 *
 * `pipeline-firing.eval.mjs` reported a lead it explicitly refused to call a result: eight of its
 * nine misses were Russian-language prompts, recall splitting 10/18 (56%) Russian against 13/14
 * (93%) English, Fisher exact two-sided p = 0.044. Its header names the three reasons not to act
 * on that number and then names the experiment that would settle it:
 *
 *   > THE DESIGNED VERSION, if this is worth settling: take the 14 English prompts, translate each
 *   > to Russian, and run both sets at --trials 5. That is a matched pair — same content, one
 *   > variable — and it costs about the same as one full run above.
 *
 * This is that experiment, with one addition argued for below. It is a separate file because the
 * other one measures a STANDING property that should be re-run on a schedule (do the descriptions
 * still route?), while this asks a ONE-TIME question with a yes/no answer. Folding a designed
 * experiment into a monitoring eval makes the monitor's baseline diff meaningless the moment the
 * experiment's arms change.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE CONFOUNDS, AND WHICH ONES THIS ACTUALLY CLOSES
 *
 * 1. CONFOUNDED CONTENT — closed. The prior run compared 14 English prompts against 18 DIFFERENT
 *    Russian prompts, so "Russian" and "these particular questions" were the same variable. Here
 *    every prompt exists in both languages with the same content, so content cancels.
 *
 * 2. ONE TRIAL — closed by construction, not by assertion. At one trial a per-prompt rate is a coin
 *    flip observed once, and the prior run watched `tighten-paper` flip 0.00 → 1.00 on the same
 *    prompt within one morning. Default here is 3 trials (n = 96 per language arm).
 *
 * 3. POST HOC — closed only in the weak sense that the hypothesis is now stated BEFORE the run
 *    rather than read off the output. That is worth something and it is not the same as
 *    pre-registration: the direction being tested was chosen because a previous run suggested it.
 *    A confirmation here is evidence; it is not independent discovery, and writing it up as though
 *    the effect were found twice would be counting one observation twice.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 THE CONFOUND THE ORIGINAL DESIGN DID NOT CLOSE: TRANSLATIONESE
 *
 * Translating the 14 English prompts into Russian and comparing gives matched content — but every
 * Russian prompt in that design is a TRANSLATION and every English one is an ORIGINAL. If translated
 * text is stilted, or lands closer to the English description's vocabulary, or reads as less natural
 * to the model, then "language" and "was this text translated" move together and the experiment
 * reproduces its own answer.
 *
 * So this file translates in BOTH directions: the 14 English originals get Russian counterparts, and
 * the 18 Russian originals get English counterparts. Translation direction is then BALANCED across
 * the language arms, and it is also recorded per prompt (`origin`), so the run reports the language
 * effect split by origin. If the effect appears only among translated prompts, the finding is about
 * translation, not about Russian — and that is a result worth having rather than a confound worth
 * hiding.
 *
 * 🔴 THE ONE IT STILL DOES NOT CLOSE, STATED PLAINLY: the translations in both directions were
 * written by the same model that is being measured. A native speaker did not review them. If the
 * Russian counterparts are subtly unidiomatic, that shows up as a language effect here and this
 * design cannot tell the difference. The honest fix is a human pass over the 32 Russian strings
 * before any of this is published anywhere; until that happens the finding is "good enough to act on
 * for our own repo" and NOT "good enough to write up".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NO `irrelevantPrompts` HERE
 *
 * The prior run measured false positives across all eight cases and got 0% on every one, precision
 * 100%. Nothing about a language question is answered by re-measuring that, and including the
 * irrelevant sets would double the run count to buy a number already known. Precision is therefore
 * NOT measured here; if a future change makes routing suspect again, that belongs in the monitoring
 * eval, which is where the baseline for it lives.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COST
 *
 * 8 cases × 4 prompts × 2 languages × 3 trials = 192 runs. Measured rate on the prior run was
 * ~$0.14 API-equivalent per run, so ~$27 API-equivalent, ~15 min at concurrency 3 — billed to a
 * Claude subscription, $0 metered. Not wired into CI at any cadence: this answers a question once.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READING THE OUTPUT
 *
 * The per-case table is scenery. The two lines that matter are the OVERALL arm comparison and the
 * SPLIT BY ORIGIN underneath it. Read them in that order and refuse to read the per-case cells as
 * eight independent findings — at n = 12 per cell a difference of one run moves a cell by 8 points.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FIRST RUN — 2026-08-07, 192 runs, 3 trials, 36 competitors, ~$26.59 API-equivalent ($0 metered).
 * Raw log + the analysis script: `repro/2026-08-07-language-eval-raw.log`,
 * `repro/analyze-language-eval.py`. Statistics live in that script, not in this file.
 *
 *   OVERALL       EN 75/96 (78.1%)   RU 58/96 (60.4%)   -17.7pp
 *                 paired sign test: 13 prompts favour EN, 2 favour RU, 17 tied — p = 0.0074
 *
 *   en-original   EN 81.0%  RU 59.5%  -21.4pp   sign 6v0   p = 0.031
 *   ru-original   EN 75.9%  RU 61.1%  -14.8pp   sign 7v2   p = 0.180
 *
 * 1. THE EFFECT IS REAL AND IT IS NOT TRANSLATIONESE. The gap runs the same direction in BOTH
 *    translation directions, including the pairs whose RUSSIAN is the original human-typed text and
 *    whose English is the translation. That was the confound this file was built to close, and it
 *    did not explain the effect away. Read the ru-original row carefully though: at 9 discordant
 *    pairs it is NOT individually significant (p = 0.18). The honest statement is "same direction
 *    in both, individually significant only where the English is the original" — not "confirmed
 *    twice".
 *
 * 2. 🔴 THE LEAD OVERSTATED THE GAP BY ROUGHLY HALF, AND THE CORRECTION IS THE POINT. The prior
 *    single-trial run reported 93% English against 56% Russian, a 37-point gap. Here it is 78%
 *    against 60%, an 18-point gap. The RUSSIAN figure replicated almost exactly (56 → 60); the
 *    ENGLISH figure fell fifteen points. So the original gap was not mostly a Russian problem being
 *    discovered — it was an English arm of 14 prompts measured once each, sitting high by chance.
 *    A designed replication that confirms an effect at half the claimed size is the ordinary result
 *    of measuring properly, and reporting the -37pp number now would be citing the weaker run.
 *
 * 3. WHAT IT MEANS FOR THIS REPO. Every skill description here is written in English and the owner
 *    types Russian constantly. An 18-point recall penalty on the language he actually uses is worth
 *    acting on. The obvious intervention — Russian trigger vocabulary in the descriptions — is now
 *    measurable: re-run this file after the edit and the arms say whether it worked. Do NOT edit the
 *    descriptions and declare victory without re-running; that is the failure mode this whole
 *    directory exists to prevent.
 *
 * 4. STILL OPEN, unchanged by this run: the translations in both directions were written by the
 *    same model family being measured, and no native speaker has reviewed the 32 Russian strings.
 *    Good enough to act on inside this repo; not good enough to publish.
 */

import {
  assertPromptDiversity,
  skillResolved,
  readBaseline,
  writeBaseline,
  skip,
} from "vigiles";
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
const BASELINE = join(
  SKILLS_DIR,
  "paper-pipeline",
  "pipeline-language.baseline.json",
);

/** The namespace `packageSkillsDir` installs a LOOSE skills dir under. Same as the sibling eval. */
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
const TRIALS = Number(val("trials", "3"));
const CONCURRENCY = Number(val("concurrency", "3"));

// ── the fixture ──────────────────────────────────────────────────────────────
// Byte-identical to the sibling eval's FIXTURE on purpose. If the two files drift, a difference
// between this run and that one stops being attributable to language.
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

// ── the matched pairs ────────────────────────────────────────────────────────
// Every entry is ONE question in TWO languages. `origin` records which side was written first, so
// the run can report whether the effect survives among prompts whose Russian is the ORIGINAL — the
// translationese control. The 32 originals are copied verbatim from pipeline-firing.eval.mjs; only
// the counterparts are new, so the two runs stay comparable on the shared half.
//
// Origin counts: 14 English, 18 Russian — exactly the split whose imbalance produced the lead.
const CASES = [
  {
    skill: "tighten-paper",
    why: "structural bloat — cut/fold/merge, NOT sentence craft",
    pairs: [
      {
        origin: "ru",
        ru: "статья раздулась, середина провисает — что резать?",
        en: "the paper has bloated and the middle sags — what do I cut?",
      },
      {
        origin: "en",
        en: "this draft is 14 pages against a 9 page limit, what goes",
        ru: "в черновике 14 страниц при лимите 9, что убираем",
      },
      {
        origin: "ru",
        ru: "после трёх раундов ревью там одна вода и хеджи, нужен план сокращения",
        en: "after three review rounds it is all filler and hedges, I need a cut plan",
      },
      {
        origin: "en",
        en: "sections 4 and 5 say the same thing twice, and nobody would skim any of it",
        ru: "секции 4 и 5 говорят одно и то же дважды, и это невозможно пролистать",
      },
    ],
  },
  {
    skill: "grade-paper-writing",
    why: "prose craft — the sentence is the unit, NOT the section",
    pairs: [
      {
        origin: "ru",
        ru: "оцени как написано — читается как стена жаргона",
        en: "grade how it is written — it reads like a wall of jargon",
      },
      {
        origin: "en",
        en: "is the writing any good or does it read like shit",
        ru: "текст вообще нормальный или читается как дерьмо",
      },
      {
        origin: "ru",
        ru: "abstract звучит криво хотя по смыслу всё на месте, дай оценку прозе",
        en: "the abstract sounds clumsy even though the substance is fine, grade the prose",
      },
      {
        origin: "en",
        en: "grade the craft: title, abstract, sentence clarity, hedge stacking",
        ru: "оцени ремесло: заголовок, аннотация, ясность предложений, нагромождение хеджей",
      },
    ],
  },
  {
    skill: "argument-arc",
    why: "argument architecture — does one conclusion become inevitable",
    pairs: [
      {
        origin: "ru",
        ru: "ревьюер второй раз пишет что мы кидаем в него идеи без связи",
        en: "a reviewer has now said twice that we throw disconnected ideas at him",
      },
      {
        origin: "en",
        en: "does the paper actually carry a reader to one conclusion or just list stuff",
        ru: "статья реально ведёт читателя к одному выводу или просто перечисляет",
      },
      {
        origin: "ru",
        ru: "мы вводим пять именованных штук и три числа — по-моему это перебор",
        en: "we introduce five named things and three numbers — that feels like too much",
      },
      {
        origin: "en",
        en: "before the big rewrite I want one sentence per section, bottom up",
        ru: "перед большой переписью хочу по одному предложению на секцию, снизу вверх",
      },
    ],
  },
  {
    skill: "paper-adversarial-review",
    why: "ONE hostile reviewer, fast",
    pairs: [
      {
        origin: "ru",
        ru: "red-team эту статью, чем будет бить reviewer 2",
        en: "red-team this paper, what will reviewer 2 hit it with",
      },
      {
        origin: "en",
        en: "would reviewer 2 buy this claim about the hook finding",
        ru: "купится ли reviewer 2 на это утверждение про находку с хуком",
      },
      {
        origin: "ru",
        ru: "найди слабые места до сабмита — один злой но честный рецензент",
        en: "find the weak spots before submission — one hostile but fair reviewer",
      },
      {
        origin: "en",
        en: "what is our desk reject risk and where do we overclaim",
        ru: "какой у нас риск desk reject и где мы переобещаем",
      },
    ],
  },
  {
    skill: "pc-panel-review",
    why: "the WHOLE committee + an accept probability, not one reviewer",
    pairs: [
      {
        origin: "ru",
        ru: "какая вероятность принятия у этой статьи, если честно",
        en: "honestly, what is the acceptance probability for this paper",
      },
      {
        origin: "en",
        en: "simulate the whole program committee, not one reviewer",
        ru: "смоделируй весь программный комитет, а не одного рецензента",
      },
      {
        origin: "ru",
        ru: "что решат на PC discussion — accept или reject",
        en: "what will the PC discussion decide — accept or reject",
      },
      {
        origin: "ru",
        ru: "нужно несколько независимых ревьюеров с разными линзами плюс мета-ревью от чейра",
        en: "I need several independent reviewers with different lenses plus a meta-review from the chair",
      },
    ],
  },
  {
    skill: "cold-read-diff",
    why: "fires AFTER a prose edit — the reader with no context",
    pairs: [
      {
        origin: "ru",
        ru: "я переписал третий абзац intro — проверь что предложения вообще что-то значат",
        en: "I rewrote the third paragraph of the intro — check the sentences actually mean anything",
      },
      {
        origin: "en",
        en: "just edited the threats section, would a reader with no context get it",
        ru: "только что правил секцию threats, поймёт ли её читатель без контекста",
      },
      {
        origin: "ru",
        ru: "поправил формулировки в 4.2, прогони свежим читателем до того как я закрою правку",
        en: "I fixed the wording in 4.2, run a fresh reader over it before I close the edit",
      },
      {
        origin: "ru",
        ru: "эти предложения короткие, правдивые и всё равно непонятно что они утверждают",
        en: "these sentences are short, true, and it is still unclear what they claim",
      },
    ],
  },
  {
    skill: "verify-citations",
    why: "are the cites REAL — a pre-submit metadata gate",
    pairs: [
      {
        origin: "ru",
        ru: "проверь что все цитаты настоящие перед сабмитом",
        en: "check that every citation is real before submission",
      },
      {
        origin: "en",
        en: "did we hallucinate any of these refs",
        ru: "мы не выдумали какие-нибудь из этих ссылок",
      },
      {
        origin: "ru",
        ru: "сверь метаданные по каждому cite — год, венью, авторы, doi",
        en: "verify the metadata on every cite — year, venue, authors, doi",
      },
      {
        origin: "en",
        en: "one bibtex entry looks invented to me, check the whole bibliography",
        ru: "одна bibtex-запись выглядит выдуманной, проверь всю библиографию",
      },
    ],
  },
  {
    skill: "map-prior-work",
    why: "who already did this — BEFORE drafting, reshapes the contribution",
    pairs: [
      {
        origin: "ru",
        ru: "кто уже это сделал до нас — хочу знать до того как начну писать",
        en: "who has already done this before us — I want to know before I start writing",
      },
      {
        origin: "en",
        en: "sweep the landscape: everyone working on this, prior versus concurrent",
        ru: "прочеши ландшафт: все кто работает над этим, prior против concurrent",
      },
      {
        origin: "ru",
        ru: "нужен скелет related work и вердикт что мы ещё можем клеймить своим",
        en: "I need a related-work skeleton and a verdict on what we can still claim as ours",
      },
      {
        origin: "en",
        en: "find every competing group in this space and date them against our submission",
        ru: "найди все конкурирующие группы в этой области и датируй их относительно нашего сабмита",
      },
    ],
  },
];

// ── preflight ────────────────────────────────────────────────────────────────
// Same guard as the sibling eval, same reason: a misspelled skill or a changed namespace makes
// every `fired` predicate permanently false, and the run then reports a wall of confident 0.00s as
// though eight descriptions had simultaneously died.
function assertSkillIdsExist() {
  if (!existsSync(SKILLS_DIR))
    throw new Error(`no skills dir at ${SKILLS_DIR}`);
  const installed = new Set(
    readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, "SKILL.md")),
      )
      .map((e) => e.name),
  );
  const missing = CASES.map((c) => c.skill).filter((s) => !installed.has(s));
  if (missing.length)
    throw new Error(
      `these cases name skills that are not installed under ${SKILLS_DIR}: ${missing.join(", ")}. ` +
        `Every \`fired\` predicate for them would be permanently false.`,
    );
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

// A pair that is identical in both languages measures nothing, and a pair where one side is empty
// silently shrinks an arm. Both are free to check and neither is hypothetical — the strings below
// were written by hand.
for (const c of CASES) {
  for (const p of c.pairs) {
    if (!p.en?.trim() || !p.ru?.trim())
      throw new Error(
        `${c.skill}: a pair is missing a side: ${JSON.stringify(p)}`,
      );
    if (p.en.trim() === p.ru.trim())
      throw new Error(
        `${c.skill}: both sides of a pair are identical: ${p.en}`,
      );
    if (!/[а-яё]/i.test(p.ru))
      throw new Error(`${c.skill}: the "ru" side has no Cyrillic: ${p.ru}`);
    if (p.origin !== "en" && p.origin !== "ru")
      throw new Error(`${c.skill}: origin must be "en" or "ru"`);
  }
}

const installedCount = assertSkillIdsExist();

// Free and deterministic, and it runs before a token is spent. Checked PER LANGUAGE ARM: a set whose
// four prompts all read the same way makes that arm's rate one question asked four times, and an
// arm-vs-arm comparison between two such sets is worth nothing at all.
for (const c of CASES)
  for (const lang of ["en", "ru"])
    assertPromptDiversity(
      c.pairs.map((p) => p[lang]),
      { minPrompts: 4, minDistance: 0.3, label: `${c.skill}:${lang}` },
    );

const originCounts = CASES.flatMap((c) => c.pairs).reduce(
  (a, p) => ({ ...a, [p.origin]: (a[p.origin] ?? 0) + 1 }),
  {},
);
console.log(
  `matched pairs: OK (${CASES.length} cases × 4 pairs × 2 languages × ${TRIALS} trial(s) = ` +
    `${CASES.length * 4 * 2 * TRIALS} runs; origins: ${originCounts.en} en, ${originCounts.ru} ru; ` +
    `${installedCount} skills installed → ${installedCount - 1} competitors per run)`,
);

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
// One `measureTriggerRate` per (case, language). Everything except the prompt strings is held
// identical across the two arms — same skillsDir, same fixture, same allowedTools, same predicate,
// same trials — so the arm difference has one input.
const rows = [];
for (const c of selected) {
  const perLang = {};
  for (const lang of ["en", "ru"]) {
    const report = await measureTriggerRate({
      name: `pipeline-language:${c.skill}:${lang}`,
      skillsDir: SKILLS_DIR,
      prompts: c.pairs.map((p) => p[lang]),
      fired: (t) => skillResolved(t, id(c.skill)),
      fixture: FIXTURE,
      minPrompts: 4,
      minDistance: 0.3,
      trials: TRIALS,
      allowedTools: ["Skill", "Read"],
      concurrency: CONCURRENCY,
      spacingSec: 2,
      timeoutMs: 180000,
    });
    perLang[lang] = report;
  }
  rows.push({ case: c, perLang });
  console.log(`\n=== ${c.skill} — ${c.why}`);
  for (const lang of ["en", "ru"]) {
    const r = perLang[lang];
    console.log(`  ${lang}: ${(r.rate * 100).toFixed(0)}% (${r.n} runs)`);
    r.perPrompt.forEach((p, i) =>
      console.log(
        `    ${(p.fired / p.trials).toFixed(2)}  [${c.pairs[i].origin}] ${p.prompt.slice(0, 66)}`,
      ),
    );
  }
}

// ── the two lines that matter ────────────────────────────────────────────────
const pct = (x) => `${(x * 100).toFixed(0)}%`.padStart(5);
console.log(`\n${"skill".padEnd(26)}    en     ru    delta`);
for (const { case: c, perLang } of rows) {
  const d = perLang.ru.rate - perLang.en.rate;
  console.log(
    `${c.skill.padEnd(26)} ${pct(perLang.en.rate)}  ${pct(perLang.ru.rate)}  ${(d >= 0 ? "+" : "") + (d * 100).toFixed(0)}pp`,
  );
}

/** Fired/total across every selected case for one language, optionally filtered by pair origin. */
const tally = (lang, originFilter) => {
  let fired = 0;
  let n = 0;
  for (const { case: c, perLang } of rows)
    perLang[lang].perPrompt.forEach((p, i) => {
      if (originFilter && c.pairs[i].origin !== originFilter) return;
      fired += p.fired;
      n += p.trials;
    });
  return { fired, n, rate: n > 0 ? fired / n : 0 };
};

const EN = tally("en");
const RU = tally("ru");
console.log(
  `\nOVERALL   en ${EN.fired}/${EN.n} (${(EN.rate * 100).toFixed(0)}%)   ` +
    `ru ${RU.fired}/${RU.n} (${(RU.rate * 100).toFixed(0)}%)   ` +
    `delta ${((RU.rate - EN.rate) * 100).toFixed(0)}pp`,
);

// The translationese control. If the language gap exists among ru-ORIGINAL pairs (where the Russian
// is the natural text and the English is the translation) as well as among en-original pairs, then
// it is about language. If it exists only where the Russian was translated, it is about translation
// — a real finding, a different one, and NOT the one the lead claimed.
console.log(
  `\nSPLIT BY ORIGIN — is the gap about language, or about which side was translated?`,
);
console.log(`${"origin".padEnd(12)}    en     ru    delta`);
for (const o of ["en", "ru"]) {
  const e = tally("en", o);
  const r = tally("ru", o);
  const d = (r.rate - e.rate) * 100;
  console.log(
    `${`${o}-original`.padEnd(12)} ${pct(e.rate)}  ${pct(r.rate)}  ${(d >= 0 ? "+" : "") + d.toFixed(0)}pp` +
      `   (${e.fired}/${e.n} vs ${r.fired}/${r.n})`,
  );
}

// The same guard the sibling eval carries, for the same reason: a run that measured nothing must
// not be readable as a finding.
if (EN.fired === 0 && RU.fired === 0)
  throw new Error(
    "EVERY run in BOTH arms scored 0. That is far more likely a harness fault (wrong namespace, " +
      "skills not installed, `fired` predicate broken) than sixteen simultaneously dead descriptions.",
  );

// 🔴 NO GATE, AND THAT IS DELIBERATE. This eval answers a question; it does not police a property.
// A threshold here would have to encode the very effect being measured, which is how a check that
// can only confirm its own hypothesis gets written. The sibling eval owns the floor and the
// regression gate; this one reports and exits 0.
console.log(
  `\nNo gate: this file measures an effect, it does not enforce one. ` +
    `Read OVERALL first, then SPLIT BY ORIGIN — a gap that appears only on translated Russian is a ` +
    `finding about translation, not about Russian.`,
);

const snapshot = {
  name: "pipeline-language",
  trials: TRIALS,
  arms: {
    en: { runs: EN.n, metrics: { recall: EN.rate } },
    ru: { runs: RU.n, metrics: { recall: RU.rate } },
    "en:en-original": {
      runs: tally("en", "en").n,
      metrics: { recall: tally("en", "en").rate },
    },
    "ru:en-original": {
      runs: tally("ru", "en").n,
      metrics: { recall: tally("ru", "en").rate },
    },
    "en:ru-original": {
      runs: tally("en", "ru").n,
      metrics: { recall: tally("en", "ru").rate },
    },
    "ru:ru-original": {
      runs: tally("ru", "ru").n,
      metrics: { recall: tally("ru", "ru").rate },
    },
  },
  totalCostUsd: rows.reduce(
    (s, x) =>
      s + x.perLang.en.usage.totalCostUsd + x.perLang.ru.usage.totalCostUsd,
    0,
  ),
  aborted: false,
};
console.log(
  `\ntotal spend: $${snapshot.totalCostUsd.toFixed(2)} API-equivalent`,
);

if (flag("update-baseline")) {
  writeBaseline(BASELINE, [snapshot]);
  console.log(`baseline recorded → ${BASELINE}`);
} else if (!readBaseline(BASELINE)) {
  console.log(`no baseline at ${BASELINE} — record one with --update-baseline`);
}
