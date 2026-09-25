/**
 * skill-trigger-cases.mjs — the per-skill trigger cases, in ONE place.
 *
 * WHY A SHARED MODULE AND NOT 21 FILES OF PROMPTS. Coverage is decided by
 * placement (vigiles, 2026-08-11), so every skill needs a test file inside its own
 * directory. That rule is right — a test that merely names a surface was crediting
 * surfaces nothing touched — but satisfying it by copying prompts 21 times would
 * recreate the drift the rule exists to prevent. So the colocated files are thin
 * and the DATA lives here, reviewed as one table where collisions are visible.
 *
 * ── HOW TO READ A CASE ──────────────────────────────────────────────────────────
 *
 *   skill     the skill under test
 *   why       the territory it owns, in one line — the thing a sibling must NOT take
 *   prompts   should-fire. FOUR each, deliberately mixed (below)
 *   collides  siblings whose own should-fire prompts become this case's
 *             irrelevantPrompts. That is how "the WRONG skill must not fire" is
 *             asserted, and it is symmetric: each side of a collision is measured
 *             from both directions.
 *
 * 🔴 THE PROMPTS ARE MIXED ON PURPOSE, AND THE MIX DECIDES THE NUMBER.
 * `framing-vs-vocabulary.eval.mjs` measured the same skills two ways: prompts that
 * NAME the action scored 78%, prompts that describe a SITUATION scored 25%. A set
 * written only in the description's own verbs would report a flattering rate and
 * measure how well the prompts were copied from the description. So each case
 * carries both kinds — a couple that name the action, a couple that describe the
 * situation the way the author actually types, in the language he actually types.
 * Expect the aggregate to sit BELOW a same-vocabulary set. That is the point.
 *
 * Russian is over-represented on purpose too: `pipeline-language.eval.mjs`
 * measured English 78.1% vs Russian 60.4% over 32 matched pairs (paired sign test
 * p = 0.0074), and every description here is English while the author writes
 * Russian. A set that quietly dropped the Russian prompts would hide the gap.
 *
 * The eight cases below marked HARVESTED were written for
 * `paper-pipeline/pipeline-firing.eval.mjs` and moved here unchanged, so the two
 * runners cannot drift apart. The thirteen marked NEW were added 2026-08-11 to
 * finish the corpus; they have never been run, so their rates are UNKNOWN rather
 * than assumed good.
 */

const PACKAGE_CASES = [
  // ── HARVESTED (written for pipeline-firing.eval.mjs, measured) ───────────────
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

  // ── NEW 2026-08-11 (never run — rates UNKNOWN, not assumed good) ─────────────
  {
    skill: "analyze-sibling-paper",
    why: "ONE named rival, deep-read — is our delta real or cosmetic",
    prompts: [
      "вышла статья почти про то же самое, надо понять насколько мы пересекаемся",
      "рецензент пишет «это же уже сделано в X» — разбери X целиком",
      "read this competitor end to end and tell me the strongest scoop they could claim",
      "они препринт выложили раньше нас на месяц — это prior work или concurrent",
    ],
    collides: ["map-prior-work", "verify-citations"],
  },
  {
    skill: "build-benchmark",
    why: "design + RUN the study, and ship the artifact reviewers execute",
    prompts: [
      "надо спроектировать сам замер, а не описывать его — как считать честно",
      "нужны парные прогоны, доверительные интервалы и поправка на множественные сравнения",
      "build the artifact a reviewer can run that recomputes every number in the paper",
      "у нас n маленькое и разброс большой — это результат или шум",
    ],
    collides: ["research-ideate", "draft-paper"],
  },
  {
    skill: "camera-ready",
    why: "AFTER accept — de-anonymize, archive, disclose",
    prompts: [
      "пришёл accept, что теперь делать до дедлайна финальной версии",
      "надо снять анонимизацию и выложить артефакт уже под своим именем",
      "we got in — swap the view-only artifact for a real repo and get a DOI",
      "перед публичным релизом надо закрыть responsible disclosure по найденной дыре",
    ],
    collides: ["submit-paper", "extend-paper"],
  },
  {
    skill: "draft-paper",
    why: "numbers exist → WRITE it: sections, claim-sizing, threats",
    prompts: [
      "числа есть, пора писать текст",
      "turn these findings into an actual submission",
      "нужен abstract и intro, и явный абзац «чего мы НЕ утверждаем»",
      "как сформулировать вклад чтобы он был точным, а не раздутым",
    ],
    collides: ["argument-arc", "build-benchmark"],
  },
  {
    skill: "extend-paper",
    why: "accepted workshop paper → a SECOND, stronger publication",
    prompts: [
      "воркшопную статью приняли — как сделать из неё полноценную вторую",
      "сколько нового материала нужно чтобы это не считалось дублем",
      "we have one accepted short paper and I want a body of work, not a one-hit",
      "куда подавать расширенную версию и не нарушу ли я правило про dual submission",
    ],
    collides: ["camera-ready", "find-venue"],
  },
  {
    skill: "find-venue",
    why: "WHERE to send it — ranked by indexing and accept-probability",
    prompts: [
      "куда это вообще подавать",
      "нужен список площадок с дедлайнами и понять какие индексируются",
      "which workshop gives real peer review and lands in the ACM DL",
      "успеваем ли мы куда-нибудь до конца осени и с какой вероятностью пройдём",
    ],
    collides: ["plan-paper-timeline", "study-accepted-papers"],
  },
  {
    skill: "harden-paper",
    why: "the pre-submit GATE — a vector of gates, worst first",
    prompts: [
      "статья готова к сабмиту или нет",
      "прогони финальную проверку перед загрузкой, всё ли закрыто",
      "what is still missing before I upload this thing",
      "хочу вердикт по всем осям сразу, а не одно ревью",
    ],
    collides: ["pc-panel-review", "paper-adversarial-review"],
  },
  {
    skill: "plan-paper-timeline",
    why: "CFP dates → a scheduled, buffered plan on the calendar",
    prompts: [
      "дедлайн 15 сентября — разложи по датам что когда делать",
      "поставь события в календарь: сабмит, дедлайн, камера-реди",
      "build the schedule backwards from the deadline with buffer for the review passes",
      "две статьи подряд получаются, разведи их чтобы не слиплись перед подачей",
    ],
    collides: ["find-venue"],
  },
  {
    skill: "render-paper",
    why: "compile the LaTeX and produce readable page images",
    prompts: [
      "собери pdf и покажи страницы",
      "хочу посмотреть как это выглядит вёрсткой с телефона",
      "compile the tex and screenshot the pages so I can read them",
      "сборка падает на шрифтах, а мне нужен свежий pdf",
    ],
    collides: ["submit-paper"],
  },
  {
    skill: "research-ideate",
    why: "is this idea WORTH doing — go/no-go before any effort",
    prompts: [
      "есть идея — замерить, как часто агенты молча игнорируют правила из CLAUDE.md. стоит ли вообще за неё браться",
      "это тянет на публикацию или это блог-пост",
      "is there a fast MVP finding here that does not need a scary result",
      "думаю переключиться на бенчмарк промпт-инъекций в MCP-серверах — не уведёт ли это нас из нашей линии в сторону",
    ],
    collides: ["map-prior-work", "sweep-design-space"],
  },
  {
    skill: "study-accepted-papers",
    why: "mine the VENUE's accepted corpus for what makes papers strong there",
    prompts: [
      "посмотри что принимали на этой площадке и чем те статьи сильны",
      "хочу дотянуть с accept до strong accept — что для этого нужно именно там",
      "read a dozen accepted papers from this venue and diff our draft against them",
      "какие приёмы у них заходят — артефакты, threat model, запоминающееся название",
    ],
    collides: ["find-venue", "harden-paper"],
  },
  {
    skill: "submit-paper",
    why: "the actual upload — artifact hosting, HotCRP, double-blind hygiene",
    prompts: [
      "пора загружать, проведи по шагам",
      "как захостить артефакт анонимно чтобы не спалить авторство",
      "walk me through the hotcrp form and the double blind checks",
      "в pdf не осталось ли моего имени в метаданных",
    ],
    collides: ["camera-ready", "harden-paper"],
  },
  {
    skill: "sweep-design-space",
    why: "GENERATE mechanisms — when the last three ideas all rhymed",
    prompts: [
      "твои варианты стухли, предложи что-то из другой оперы",
      "мы третий раз крутим одни и те же два решения",
      "sweep the design space properly — type systems, capabilities, other professions",
      "нужен механизм, а не ещё один замер того же самого",
    ],
    collides: ["research-ideate"],
  },

  // ── NEW 2026-08-11 (second batch — the three the coverage sweep found) ───────
  // These finish the paper lane. Same rule as the batch above: never run, so
  // their rates are UNKNOWN, not assumed good.
  {
    skill: "paper-status",
    why: "REPORT state — measured page count, git, which gates ran. Reports; does not grade or fix",
    prompts: [
      "что там по статье, что осталось",
      "готова ли статья к сабмиту или ещё нет",
      "what's the status of the paper right now",
      "я вернулся после недели, напомни где мы остановились",
    ],
    // harden-paper is the sharpest collision in the corpus: both answer a
    // question shaped like "is it ready?", but one MEASURES and the other JUDGES.
    // If the selector cannot separate these two, a status question triggers a
    // 36-minute gate run.
    collides: ["harden-paper", "paper-pipeline"],
  },
  {
    skill: "osf-artifact-upload",
    why: "PUSH a file to the OSF project over the API — the mechanics, not the decision to submit",
    prompts: [
      "залей новый artifact.zip на osf",
      "я починил README в артефакте, нужно обновить версию на osf",
      "replace the artifact file on the OSF project via the api",
      "рецензентам нужна свежая версия артефакта по той же view-only ссылке",
    ],
    collides: ["submit-paper"],
  },
  {
    skill: "paper-pipeline",
    why: "DRIVE the whole lifecycle — the conductor, when the ask is the whole arc not one step",
    prompts: [
      "хочу довести статью от идеи до принятия, веди меня по всему процессу",
      "с чего вообще начинать новую статью",
      "run the whole paper pipeline for this idea, not just one stage",
      "непонятно в каком порядке всё это делать и что от чего зависит",
    ],
    collides: ["paper-status", "plan-paper-timeline"],
  },
];

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE CONSUMER'S OWN CASES — A FIFTH CARRIER, NOT A FORK (2026-09-12)
//
// The table above covers THIS PACKAGE'S skills. A consumer installs the package alongside skills
// of its own, and those collide with each other far harder than the paper skills do: the first
// consumer's three non-paper cases share the very wording of the request («write a message…»),
// which is exactly the confusion a trigger measurement exists to expose. Dropping them would not
// make the measurement smaller, it would make it WRONG — `irrelevantFor()` builds each case's
// false-positive set out of its colliders, so a missing collider silently turns a precision
// measurement into a recall measurement.
//
// 🔴 AND THEY CANNOT SIMPLY BE CARRIED HERE: the first consumer's cases name private skills and
// quote private prose. A package that ships one user's private vocabulary has one possible user —
// the same argument that moved `papersRoot()`, `ledgerPath()`, `citeChecks` and `scriptsRoot()`
// out of the code and into a declaration. This is the fifth of those carriers and reads the same
// key from the same file.
//
//     // <consumer>/package.json
//     "paperlint": { "triggerCases": ".claude/lib/skill-trigger-cases.local.mjs" }
//
// The module it names must export `CASES` in the shape documented at the top of this file.
//
// ⚠️ DECLARED-AND-MISSING THROWS; UNDECLARED IS SILENT. A consumer with no extra skills is the
// normal case and must not be nagged. A consumer that declared a path and typoed it is a
// keystroke away from measuring precision against half a corpus and never being told — the same
// distinction `scriptsRoot()` makes between `undefined` and `null`.
//
// ⚠️ A CONSUMER MAY NOT REDEFINE A PACKAGE CASE. Two tables answering "what should fire on this
// prompt" is two truths; the override would live in the consumer and the original would keep
// looking authoritative here. Throws, naming the skill.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  CONFIG_KEY,
  consumerRoot,
  settingsOf,
} from "../skills/paper-pipeline/scripts/consumer.mjs";

const DEFAULT_LOCAL_CASES = ".claude/lib/skill-trigger-cases.local.mjs";

async function consumerCases() {
  const root = consumerRoot();
  let declared;
  try {
    declared = settingsOf(
      JSON.parse(readFileSync(join(root, "package.json"), "utf8")),
    )?.triggerCases;
  } catch {
    declared = undefined;
  }
  const rel = declared === undefined ? DEFAULT_LOCAL_CASES : declared;
  if (typeof rel !== "string" || rel.length === 0)
    throw new TypeError(
      `${CONFIG_KEY}: "triggerCases" must be a non-empty string, got ${JSON.stringify(rel)}`,
    );
  const abs = resolve(root, rel);
  let mod;
  try {
    mod = await import(pathToFileURL(abs).href);
  } catch (e) {
    if (declared === undefined && e?.code === "ERR_MODULE_NOT_FOUND") return [];
    throw new Error(
      `${CONFIG_KEY}: could not load the consumer's trigger cases from ${abs}` +
        (declared === undefined
          ? ` (the default location; declare another in package.json under ` +
            `"${CONFIG_KEY}": { "triggerCases": … } if the file lives elsewhere).`
          : ` — it is declared in package.json as "triggerCases": ${JSON.stringify(declared)}.`) +
        `
A missing case set does not shrink the measurement, it CHANGES it: ` +
        `\`irrelevantFor()\` builds the false-positive set out of a case's colliders, so an ` +
        `absent collider turns a precision number into a recall number with no sign that it did.` +
        `
${String(e?.message ?? e)}`,
    );
  }
  const extra = mod?.CASES;
  if (!Array.isArray(extra))
    throw new TypeError(
      `${CONFIG_KEY}: ${abs} must export an array named CASES`,
    );
  const mine = new Set(PACKAGE_CASES.map((c) => c.skill));
  for (const c of extra)
    if (mine.has(c.skill))
      throw new Error(
        `${CONFIG_KEY}: ${abs} redefines the case for "${c.skill}", which this package already ` +
          `owns. Two tables answering the same question is two truths; rename the skill or drop ` +
          `the local case.`,
      );
  return extra;
}

/** This package's cases plus the consumer's own, as one table. */
export const CASES = [...PACKAGE_CASES, ...(await consumerCases())];

/** Case lookup by skill name — the colocated files' entry point. */
export const BY_SKILL = new Map(CASES.map((c) => [c.skill, c]));

/**
 * The irrelevant set for a case: its colliders' should-fire prompts, sliced so no
 * two cases receive an identical set. Near-duplicate sets pass the per-set
 * diversity gate while making two cases' false-positive rates the same
 * measurement twice.
 */
export function irrelevantFor(skill, want = 4) {
  const c = BY_SKILL.get(skill);
  if (!c) throw new Error(`unknown skill: ${skill}`);
  // Take enough from EACH collider to reach `want` in total. Fixed 2026-08-11:
  // this used to take a flat 2 per collider, which is 4 for a two-collider case
  // and only 2 for a one-collider case — and the diversity gate needs at least
  // `minPrompts` (4) in BOTH sets. Every one-collider skill therefore threw
  // instead of measuring: map-prior-work, paper-adversarial-review,
  // pc-panel-review, plan-paper-timeline, render-paper, sweep-design-space,
  // verify-citations — seven of twenty-one, exactly the set with `collides.length
  // === 1`. Two-collider cases are unaffected (ceil(4/2) === 2), so numbers
  // measured before the fix stay comparable.
  const per = Math.ceil(want / c.collides.length);
  return c.collides
    .flatMap((sib, i) => {
      const s = BY_SKILL.get(sib);
      if (!s) throw new Error(`${skill} collides with unknown skill "${sib}"`);
      // Rotate by the collider's index so two cases sharing a collider do not
      // receive byte-identical irrelevant sets.
      return [...s.prompts.slice(i), ...s.prompts.slice(0, i)].slice(0, per);
    })
    .slice(0, want);
}
