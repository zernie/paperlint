/**
 * skill-checks.mjs — everything asserted about ONE skill, as a function you call with its name.
 * `checkSkill("verify-citations")`.
 *
 * WHY A FUNCTION AND NOT A HARNESS. Until 2026-08-11 these assertions lived in
 * `skills.harness.mjs`, a 614-line file named after no surface, and the 21 colocated per-skill
 * harnesses reached it by setting `PIPELINE_SKILL_ONLY` and importing it for its side effects.
 * That is a script pretending to be an API: the caller could not pass an argument, could not get
 * a result, and the coupling was an environment variable. The owner asked three times why the
 * file survived; the answer was that I had wrapped it instead of splitting it.
 *
 * WHAT IS CHECKED HERE vs NEXT DOOR. Anything decidable from one SKILL.md: strict-YAML
 * frontmatter, the declared tool contract, every script path it instructs, whether it is
 * PERMITTED to run what it instructs, whether it files under its OWN identity, and its verdict
 * vocabulary. Anything about the SET — name uniqueness, the gate table, the exclusion list — is
 * `pipeline-corpus.harness.mjs`, because a per-skill run structurally cannot see it.
 *
 * 🔴 KNOWN-RED ASSERTIONS ARE DEFERRED, NOT WEAKENED, and the deferral list is now PER CALL.
 * A throw would abort the rest, making one open finding silently skip every check after it —
 * the failure this whole directory exists to end. Per call matters too: with one shared list,
 * a full sweep could attribute one skill's failures to another's line in the report.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordCheck } from "vigiles";

// Разбор разметки — парсером (`CLAUDE.md`, 2026-08-11). `requireMarkdown()` вызывает
// `skill-corpus.mjs` при импорте ниже, так что до первого разбора здесь парсер уже
// либо есть, либо процесса нет.
import { headings as mdHeadings } from "./markdown.mjs";

// 🔴 2026-08-28: девять имён убраны из этого списка, и это НЕ уборка стиля — они разъехались
// с тем, что файл делает. `EXCLUDED PIPELINE_MARKER GATE_SKILLS EXPECTED_GATES KINDS parseGate`
// — про НАБОР скиллов (уникальность имён, таблица гейтов, список исключений); шапка файла сама
// пишет, что это работа `pipeline-corpus.harness.mjs`, и проверено грепом — все шесть там
// действительно используются, логика не потеряна. `frontmatter` и `toolList` вызываются ВНУТРИ
// `load()` (`skill-corpus.mjs:286,289`), прямой импорт был вторым путём к тем же данным.
// `allBold` — сырьё для `namedKinds`/`namedRetired`, которые импортируются рядом.
import {
  SKILLS, SKILLS_DIR, RETIRED, ABSTENTIONS, record, ROOT, LEDGER_ONLY_BASH,
  recordBlock, namedKinds, namedRetired,
  load, commands, permits, definedKinds, namedReasons, ADMISSION,
  tmp,
} from "./skill-corpus.mjs";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHERE THE PIPELINE'S SCRIPTS ARE — ASKED, NOT SPELLED (2026-09-12)
//
// Until today this file carried the string `.claude/skills/paper-pipeline/scripts/` in SEVEN
// places: two announce/record templates, two `indexOf` ordering probes, one `startsWith` filter
// and two regular expressions. Every one of them is this consumer's own layout, and a mechanism
// that spells one consumer's layout has exactly one possible user — the thing the extraction
// exists to undo. Nine colocated harnesses of wave ① import THIS module and nothing else from
// `lib/`, so until the seven literals left, none of them could be built anywhere but here.
//
// The value now comes from the package, as the fourth carrier beside `papersRoot()` (where the
// papers are), `ledgerPath()` (where the journal is) and `citeChecks` (where the consumer's own
// citation checkers are). One declaration in `package.json`, default
// `.claude/skills/paper-pipeline/scripts`, and the resolver REFUSES a root that is not on disk
// or that resolves inside `node_modules`.
//
// 🔴 WHY THE REFUSAL IS THE POINT AND NOT DEFENSIVENESS. Six of the seven uses are FILTERS —
// `startsWith`, `indexOf`, `RegExp.test`. A wrong prefix does not make them wrong; it makes them
// match nothing, so every loop body below goes unentered and `checkSkill` reports a clean skill
// it never examined. That failure is byte-identical to success, and a throw while this module is
// still LOADING is the only place it can be made visible.
//
// `{ env: {}, cwd: ROOT }` rather than the defaults: `ROOT` above already resolved
// `CLAUDE_PROJECT_DIR`, and letting the resolver consult it again would make the two disagree on
// exactly one input (an empty-string variable — `??` keeps it, `||` does not).
import { pipelineScripts, scriptsRoot } from "../skills/paper-pipeline/scripts/consumer.mjs";

const PIPELINE = pipelineScripts(scriptsRoot({ env: {}, cwd: ROOT }));

/**
 * A literal path, embedded in a RegExp. Not a parser dodge — the subject here IS a string (a
 * path, which has no grammar to ask), and this is the standard way to put one inside a pattern.
 */
const reEscape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `Bash(node <pipeline scripts>/<name>.mjs:*)` — the narrowed entry the ledger-only skills get. */
const LEDGER_BASH_RE = new RegExp(`^Bash\\(node ${reEscape(PIPELINE.prefix)}[a-z-]+\\.mjs:\\*\\)$`);

/**
 * A command that is one of the two ledger calls.
 *
 * ⚠️ DELIBERATELY NOT ANCHORED AT THE START, because the literal it replaced was not either. The
 * anchored form would be tighter and is probably what anyone would write today, but tightening it
 * in the same change that parameterises it would mean a `before = after` comparison could no
 * longer tell a successful parameterisation from a changed rule.
 */
const LEDGER_SCRIPT_RE = new RegExp(`${reEscape(PIPELINE.prefix)}(announce|ledger)\\.mjs$`);

/**
 * Assert everything single-skill about `name`. Throws with EVERY finding, not the first.
 * Returns the number of skills checked (1) so a caller can report what it actually did.
 */
export async function checkSkill(name) {
  if (!SKILLS.includes(name))
    throw new Error(`"${name}" is not a wired pipeline skill. Known: ${SKILLS.join(", ")}`);
  const deferred = [];
  const soft = (fn) => { try { fn(); } catch (e) { deferred.push(e); } };
  const skills = [load(name)];
  const skillDirs = new Set(readdirSync(SKILLS_DIR).filter((d) => existsSync(join(SKILLS_DIR, d, "SKILL.md"))));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 1. GONE, AND THAT IS THE RESULT (2026-08-19). This slot held a strict-YAML assertion whose whole
  // job was to police the gap between how the corpus was READ here (a hand-rolled lenient reader)
  // and how every other consumer reads it (a real YAML parser). The corpus owner, on being shown the mutation
  // suite: «звучит как хак… давай подумаем как сделать правильнее». The right fix was not a better
  // check — it was to stop being lenient: the two remaining unparseable descriptions were quoted and
  // `parseFm` in skill-corpus.mjs now throws on anything a real parser rejects.
  //
  // So the defect class is not detected here any more; it is UNREACHABLE. A skill whose frontmatter
  // is not valid YAML does not reach these assertions with a plausible-looking object and a missing
  // `allowed-tools` — it does not load at all, and says why. What the corpus does about the root
  // cause (`vigiles compile` interpolating the description into YAML raw) is written where the
  // parser lives.

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 2-4. Identity and contract fields, read from the strict parse — there is no other kind now, and
  // nothing above can fail while leaving these reachable. `name` is what the ledger and `skillHash()`
  // key on: a name that disagrees
  // with its directory means every verdict this skill records hashes against a directory that is not
  // its own, and staleness detection quietly stops working for it.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills) {
    soft(() => assert.equal(s.fm.name, s.name,
      `${s.name}: frontmatter name is ${JSON.stringify(s.fm.name)} but the directory is "${s.name}". ` +
      `skillHash() resolves by DIRECTORY and the ledger stores whatever the SKILL.md text passes — ` +
      `disagreement here splits one skill's history across two keys and neither is ever fresh.`));

    soft(() => assert.ok((s.fm.description || "").length > 40,
      `${s.name}: description is missing or trivially short (${(s.fm.description || "").length} chars). ` +
      `The description is the ONLY thing the model matches on when choosing a skill — an empty one is ` +
      `a skill that never fires, and a skill that never fires is indistinguishable from one that works.`));

    soft(() => assert.ok(s.tools.length > 0,
      `${s.name}: no allowed-tools. A skill declaring nothing INHERITS EVERYTHING — Bash, WebFetch and ` +
      `every MCP server (Calendar, GitHub-write, Vercel) — over a repo holding health data, DNA and ` +
      `bank balances. This is the finding the 2026-08-03 audit closed for all 35 skills.`));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 5-6. The two wired blocks: `## Run me` (announce, first) and `Record the verdict` (ledger, last).
  // The README calls these the whole wiring contract. Each is checked three ways — the block exists,
  // the script it names exists on disk, and the SKILL NAME IT PASSES IS ITS OWN. The third is the
  // copy-paste defect: these blocks differ from their siblings' by one token, and `announce.mjs`
  // validates nothing, so a stale token records a real verdict under another skill's name.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills) {
    const cmds = commands(s.src);

    // 2026-08-11: «есть ли блок `## Run me`» — вопрос про ЗАГОЛОВОК, значит про уровень и
    // текст, а не про число решёток. Прежнее `/^#{1,3} Run me\s*$/m` считало заголовком и
    // строку `## Run me` внутри ```-блока: скилл, ПОКАЗЫВАЮЩИЙ чужой блок в примере, проходил
    // проверку, не имея своего. Тишина у soft-ассерта и есть успех, так что заметить это было
    // нечем.
    soft(() => assert.ok(mdHeadings(s.src).some((h) => h.depth <= 3 && h.text === "Run me"),
      `${s.name}: no "## Run me" block. Without it the skill leaves no trace of having started, and ` +
      `an advisory pass that leaves no trace cannot be observed failing — silence is both its error ` +
      `state and its normal state. Three hooks in this repo died exactly that way.`));

    for (const [label, script, want] of [["announce", PIPELINE.announce, "Run me"],
                                         ["record", PIPELINE.ledger, "Record the verdict"]]) {
      const hits = cmds.filter((c) => c.script === script);
      soft(() => assert.ok(hits.length > 0,
        `${s.name}: the "${want}" block instructs no \`node ${script}\` command. The block may be present ` +
        `and empty — the README's contract is the CALL, not the heading.`));
      for (const h of hits) {
        soft(() => assert.ok(existsSync(join(ROOT, h.script)),
          `${s.name}: instructs \`${h.cmd}\` and ${h.script} DOES NOT EXIST. A skill naming a path that ` +
          `is not there is a dead instruction: the model reads it, does something adjacent, and reports ` +
          `success. Prose cannot notice this; nothing else in this repo was looking.`));
        // arg[0] for announce is the skill; for ledger.mjs it is the literal `record`, then the skill.
        const passed = label === "announce" ? h.args[0] : (h.args[0] === "record" ? h.args[1] : h.args[0]);
        soft(() => assert.equal(passed, s.name,
          `${s.name}: its ${label} command files under ${JSON.stringify(passed)}, not "${s.name}" — ` +
          `\`${h.cmd}\`. These blocks are copy-paste templates differing in one token and announce.mjs ` +
          `validates nothing, so this records a real run under a SIBLING'S identity: the wrong gate ` +
          `reads FRESH in status.mjs and the right one reads NEVER-RUN.`));
      }
    }

    soft(() => {
      const a = s.src.indexOf(PIPELINE.announce);
      const r = s.src.indexOf(`${PIPELINE.ledger} record`);
      if (a >= 0 && r >= 0) assert.ok(a < r,
        `${s.name}: the ledger record call appears BEFORE the announce call. The contract is announce ` +
        `first / record last; a verdict written before the run started is a verdict about nothing.`);
    });

    soft(() => assert.ok(recordBlock(s.src),
      `${s.name}: no "Record the verdict" heading. A run with an announce row and no verdict row is ` +
      `indistinguishable from a skill that started and died.`));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 7. EVERY script path the skill instructs resolves — not only the two ledger calls.
  //
  // Scoped to paths that are unambiguously resolvable: `.claude/…` is repo-root-relative and
  // `scripts/…` is skill-relative (both conventions are used consistently across the corpus). Paths
  // like `repro/build-submission.sh` are relative to a PAPER directory that does not exist at test
  // time, so they are excluded BY NAME rather than by a guess that would fire on correct text.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills) {
    for (const c of commands(s.src)) {
      const abs = c.script.startsWith(".claude/") ? join(ROOT, c.script)
                : c.script.startsWith("scripts/") ? join(SKILLS_DIR, s.name, c.script)
                : null;
      if (!abs) continue;
      soft(() => assert.ok(existsSync(abs),
        `${s.name}: instructs \`${c.cmd}\` but ${c.script} does not exist (looked at ${abs}). Dead ` +
        `instruction — the model will improvise something adjacent and report it as done.`));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 8. A skill is PERMITTED TO RUN what it instructs. The inverse-direction risk of narrowing: over-
  // narrow an allowed-tools entry and the skill's own first instruction is denied at runtime, which
  // looks like the skill silently declining to announce — the same invisible failure as a dead hook,
  // arrived at from the opposite direction. Nothing else checks the two halves against each other.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills) {
    for (const c of commands(s.src)) {
      // The calls the pipeline contract owns. Was `.claude/pipeline/` until 2026-08-15, when that
      // directory was dissolved and `ledger.mjs`/`announce.mjs` went home to the skill they serve.
      if (!c.script.startsWith(PIPELINE.prefix)) continue;
      soft(() => assert.ok(s.tools.some((t) => permits(t, c.cmd)),
        `${s.name}: instructs \`${c.cmd}\` but its allowed-tools [${s.tools.join(", ")}] permit no such ` +
        `Bash command. The instruction is denied at runtime and the skill simply does not announce or ` +
        `record — invisible, because a gate that never wrote a row looks exactly like one nobody ran.`));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 9. The nine ledger-only skills keep their Bash NARROWED.
  //
  // A plain `Bash` on one of these is the regression that took this repo's Safety score from 70 to 0
  // in the audit's own arithmetic: Read + Bash + WebFetch is the lethal trifecta, and these nine are
  // analysis skills that read the knowledge base. `argument-arc` grading a paper does not need a
  // shell; it needs to append one line to a JSONL. Construction beats prose — with the narrow entry
  // the capability is ABSENT, and absence cannot be talked around by injected text in a fetched CFP.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills.filter((s) => LEDGER_ONLY_BASH.has(s.name))) {
    const bash = s.tools.filter((t) => t === "Bash" || t.startsWith("Bash("));
    soft(() => assert.ok(bash.length > 0,
      `${s.name}: listed as ledger-only-Bash but declares no Bash entry at all — it cannot run its own ` +
      `announce/record calls. Either add the narrow entries or remove it from LEDGER_ONLY_BASH here.`));
    for (const b of bash) {
      soft(() => assert.match(b, LEDGER_BASH_RE,
        `${s.name}: Bash entry ${JSON.stringify(b)} is not narrowed to the ledger. This skill gained Bash ` +
        `ONLY to append a run row; a bare \`Bash\` hands a knowledge-base reader a shell and completes ` +
        `the lethal trifecta. See ALLOWED-TOOLS-AUDIT-2026-08-03.md §2 for why this one was narrowed.`));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 10. THE VOCABULARY, TURNED AROUND ON 2026-08-10.
  //
  // WHAT THIS USED TO ASSERT, and why it had to change rather than be deleted. The old text was:
  // "the vocabulary contains a REACHABLE NEGATIVE — or the text admits it does not", because a gate
  // documented as PASS-only cannot say no and no amount of running would reveal it. With `PASS`
  // deleted from the ledger, the literal form of that assertion is VACUOUS: `FINDING` and
  // `ABSTAINED` are the only constructors, so every conforming block names a negative by
  // construction and the check would pass on every file forever while reading as though it still
  // guarded something. A vacuous assertion is worse than a missing one — it is a green light with
  // nothing behind it, which is this directory's whole subject.
  //
  // So the property is carried over rather than the wording. It was never really "names a negative";
  // it was **"this check is capable of reporting that something is wrong."** Under the new
  // vocabulary that is: the block names FINDING, the evidence-carrying constructor. A block that
  // documents only how to abstain describes a check that cannot fail — the same defect, wearing the
  // new words.
  //
  // 10b is genuinely new and is the migration guard: a block still instructing a RETIRED constructor
  // tells the model to run a command that now exits 2. Prose survives refactors that code does not,
  // and 22 files were rewritten by hand today.
  //
  // 10c requires a named abstention REASON, because `ABSTAINED` with no reason is the deleted `PASS`
  // with a longer name — the closed reason vocabulary is the entire mechanism separating "ran and
  // found nothing" from "could not run".
  //
  // The escape hatch on 10a is deliberate and is the honest case, not a loophole: `draft-paper`
  // GENERATES, will abstain nearly always, and its text says so in status.mjs's own terms. That
  // admission is load-bearing documentation — delete it and an explained limitation becomes an
  // unexplained never-finding check — so it is asserted directly, not merely permitted.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  for (const s of skills) {
    const blk = recordBlock(s.src);
    if (!blk) continue;

    soft(() => assert.ok(namedKinds(blk).includes("FINDING") || ADMISSION.test(blk),
      `${s.name}: its record block names [${namedKinds(blk).join(", ") || "nothing"}] and not FINDING, ` +
      `and does not admit that it cannot produce one. FINDING is the only constructor that carries ` +
      `evidence; a block documenting only how to ABSTAIN describes a check that can never report that ` +
      `anything is wrong. Either name the finding this skill can return, or state plainly that it ` +
      `generates rather than judges — as draft-paper does.`));

    soft(() => assert.deepEqual(namedRetired(blk), [],
      `${s.name}: its record block still instructs the RETIRED constructor(s) ` +
      `[${namedRetired(blk).join(", ")}]. ${[...RETIRED.keys()].filter((k) => namedRetired(blk).includes(k))
        .map((k) => `${k} ${RETIRED.get(k)}`).join(" ")} ` +
      `A model following this block runs a command that exits 2 at the last step of finished work.`));

    soft(() => assert.ok(namedReasons(blk).length > 0,
      `${s.name}: its record block names no abstention reason from [${[...ABSTENTIONS.keys()].join(", ")}]. ` +
      `An ABSTAINED with an unnamed reason is the deleted PASS with more characters: the closed reason ` +
      `set is the only thing separating "ran and found nothing" from "could not run", and a block that ` +
      `does not say which one applies leaves the model to invent a string record() will refuse.`));
  }
  // Guarded for one-skill mode: this assertion is ABOUT draft-paper, so it only runs
  // when draft-paper is in scope. Silently skipping it in a full sweep would be the
  // vacuity this file hunts, so the guard is the membership test, not a try/catch.
  const draftPaper = skills.find((s) => s.name === "draft-paper");
  if (draftPaper)
  soft(() => assert.match(recordBlock(draftPaper.src), ADMISSION,
    `draft-paper: the honest admission is gone from its record block. It is the one skill in the ` +
    `pipeline that will almost always abstain, and the paragraph saying so — in status.mjs's own ` +
    `terms, "a generator is not a gate" — is what keeps that flag readable as a known limitation ` +
    `rather than an unexplained never-finding check someone later "fixes" by faking one.`));

  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  // 11. No skill instructs something `record()` will throw on — proven by CALLING IT, not by reading
  // the vocabulary list. `record()` validates its argument and throws; a skill telling the model to
  // record `GREEN`, `OK` or `PASS` produces a crash at the last step of a completed pass, after the
  // work is done.
  //
  // Each constructor is called in its VALID shape, because the shape is part of the contract: a
  // FINDING needs a count and an existing report, an ABSTENTION needs a reason from the closed set.
  // Calling `record` with a bare kind would prove only that the kind string is spelled right.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════
  {
    writeFileSync(join(tmp, "fixture-report.md"), "---\nfindings: 1\n---\n\nharness fixture\n");
    for (const s of skills) {
      const blk = recordBlock(s.src);
      if (!blk) continue;
      for (const v of definedKinds(blk)) {
        soft(() => record(
          v === "ABSTAINED"
            ? { skill: s.name, paper: tmp, kind: v, reason: namedReasons(blk)[0] ?? null, note: "harness fixture" }
            : { skill: s.name, paper: tmp, kind: v, findings: 1, report: "fixture-report.md", note: "harness fixture" }
        ));
      }
    }
  }
  // Every skill name any of these files hands to announce.mjs or ledger.mjs must resolve to a real
  // skill, including names inside worked examples. announce.mjs does NOT validate: an unknown name
  // hashes to `????????` and the row is written anyway.
  for (const s of skills) {
    for (const c of commands(s.src)) {
      if (!LEDGER_SCRIPT_RE.test(c.script)) continue;
      const passed = c.script.endsWith("announce.mjs") ? c.args[0] : (c.args[0] === "record" ? c.args[1] : null);
      if (!passed || passed.startsWith("<")) continue;
      soft(() => assert.ok(skillDirs.has(passed),
        `${s.name}: instructs \`${c.cmd}\`, naming skill "${passed}", which has no directory under ` +
        `.claude/skills/. announce.mjs validates nothing — it hashes the unknown name to "????????" ` +
        `and writes the row, so the typo is permanent and silent in the ledger.`));
    }
  }
  if (deferred.length) {
    const e = new Error(
      `${deferred.length} assertion(s) failed for pipeline skill "${name}":\n\n` +
      deferred.map((d, i) => `  [${i + 1}] ${d.message}`).join("\n\n")
    );
    e.stack = e.message;
    throw e;
  }
  // Reported so `vigiles test` can tell a run that verified this skill from a file that merely
  // sits beside it — the distinction colocation cannot make (see vigiles check-count.ts).
  recordCheck();
  console.log(`✓ ${name}: frontmatter, wiring, script paths, tool contract, verdict vocabulary`);
  return 1;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// checkProseSkill — для скиллов БЕЗ пайплайна (2026-08-27)
//
// ПОЧЕМУ ОТДЕЛЬНАЯ ФУНКЦИЯ, А НЕ ФЛАГ У checkSkill. `checkSkill` требует `## Run me`, вызов
// `announce.mjs` и блок «Record the verdict» — это конвенции paper-пайплайна, и у скилла вроде
// `avito-posting` их нет и быть не должно. Прогнать его через checkSkill значит получить три
// красных ассерта про отсутствие того, чего он не обещал. Проверка, красная по построению, живёт
// один день, после чего её глушат, — в этой репе это уже происходило.
//
// 🔴 ОБЕ ПОЛОВИНЫ ВСТРОЕНЫ, А НЕ ДОПИСЫВАЮТСЯ РУКАМИ. Правило `CLAUDE.md` требует у каждой
// проверки двух половин: срабатывает на подложенном дефекте И молчит на чистом входе. Половину
// «срабатывает» пишут реже — она не нужна, чтобы прогон позеленел. Поэтому здесь она не поручена
// автору: КАЖДЫЙ предикат ниже прогоняется дважды — по настоящему тексту и по мутированному, и
// расхождение вердиктов и есть ассерт. Забыть мутацию нельзя, её негде забыть.
//
// ЧЕГО ЭТО НЕ ДОКАЗЫВАЕТ: что скилл срабатывает на нужном запросе и что его совет даёт хороший
// результат. Первое — trigger-эвал, второе — модель. Здесь только то, что решается из текста.
// ═════════════════════════════════════════════════════════════════════════════════════════════════

/** Относительные markdown-ссылки, которые не резолвятся от каталога скилла. */
function danglingLinks(src, dir) {
  const out = [];
  for (const m of src.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const t = m[1].split("#")[0];
    if (!t || /^(https?:|mailto:)/.test(t)) continue;
    if (!existsSync(join(dir, t))) out.push(t);
  }
  return out;
}

/**
 * Проверить прозаический скилл `name`.
 *
 * @param {string} name — имя каталога в `.claude/skills/`
 * @param {{mustSay?: [RegExp,string][], mustNotSay?: [RegExp,string][],
 *          toolsNeeded?: Record<string,string>}} opts
 *   `mustSay` — то, чьё ИСЧЕЗНОВЕНИЕ есть регрессия (добытое замером правило).
 *   `mustNotSay` — то, чьё ПОЯВЛЕНИЕ есть регрессия (опровергнутое утверждение).
 *   `toolsNeeded` — {инструмент: ПРИЧИНА}. Снимает запрет на Bash/Agent/Task для скилла,
 *     которому инструмент нужен ПО СУЩЕСТВУ. Причина обязательна и непустая.
 *
 * 🔴 Почему `toolsNeeded` появился (01.09) и почему он с ПРИЧИНОЙ, а не флагом.
 * Запрет на Bash/Agent/Task писался под два текстовых скилла и был вшит как всеобщий:
 * «скилл, который только пишет текст». Для `session-retro` это ложь — его собственная
 * инструкция предписывает СПАВНИТЬ аудиторов («Spawn parallel audit subagents») и гонять
 * замеры, то есть без Agent и Bash он не делает того, чем является.
 *
 * Соблазн был отключить проверку для него целиком. Это неверно: запрет защищает
 * репозиторий с health-данными и балансами от третьей ноги lethal trifecta, и он
 * по-прежнему верен для остальных. Поэтому не флаг, а ИМЕНОВАННОЕ освобождение с
 * причиной — та же форма, что `vigiles:local-by-design` в этой же базе: отключение
 * возможно, но остаётся написанным, и следующий читатель видит, ЧТО именно решили.
 */
export async function checkProseSkill(name, opts = {}) {
  const { skillContract } = await import("vigiles");
  const dir = join(SKILLS_DIR, name);
  const md = join(dir, "SKILL.md");
  const deferred = [];
  const soft = (fn) => { try { fn(); } catch (e) { deferred.push(e); } };

  assert.ok(existsSync(md), `${name}: нет ${md} — проверять нечего`);
  const src = readFileSync(md, "utf8");

  // 1. Контракт инструментов. Оба скилла осознанно СНЯЛИ Bash — он был третьей ногой lethal
  // trifecta над репой с health-данными и балансами. Регрессия сюда молчалива: скилл без
  // разбираемого `allowed-tools` НАСЛЕДУЕТ ВСЁ, и выглядит это ровно как объявленный контракт.
  const c = await skillContract(dir);
  soft(() => assert.equal(c.malformed, false,
    `${name}: allowed-tools не разбирается. Файл ВЫГЛЯДИТ объявляющим контракт, а строгий парсер ` +
    `не видит ничего — скилл молча наследует все инструменты. Известная причина: \`vigiles compile\` ` +
    `снимает кавычки со скаляра, содержащего «: », и ломает YAML (см. CLAUDE.md, замер 19.08).`));
  soft(() => assert.ok(c.declared.length > 0, `${name}: пустой allowed-tools — наследует всё`));
  const needed = opts.toolsNeeded ?? {};
  // Освобождение без причины освобождением не является: пустая строка проходила бы как
  // «решено», не сообщая ничего. Тот же промах, что «счётчик, считающий то, что игнорирует».
  for (const [tool, why] of Object.entries(needed))
    assert.ok(typeof why === "string" && why.trim().length >= 10,
      `${name}: toolsNeeded.${tool} объявлен без внятной причины. Освобождение обязано говорить, ` +
      `ЗАЧЕМ инструмент нужен по существу — иначе это молчаливое отключение проверки.`);
  for (const banned of ["Bash", "Agent", "Task"]) {
    if (banned in needed) continue;
    soft(() => assert.ok(!c.declared.includes(banned),
      `${name}: в контракте появился ${banned}. Он был снят намеренно; возврат восстанавливает ` +
      `ногу lethal trifecta (данные + сеть + исполнение) у скилла, который только пишет текст. ` +
      `Если инструмент нужен ПО СУЩЕСТВУ — объявить его в toolsNeeded С ПРИЧИНОЙ, а не молча.`));
  }
  // Обратная сторона: освобождение, которое ничего не освобождает, — мусор, и он копится.
  // Через год такие строки читаются как «тут был риск», хотя риска нет.
  for (const tool of Object.keys(needed))
    soft(() => assert.ok(c.declared.includes(tool),
      `${name}: toolsNeeded.${tool} объявлен, но самого ${tool} в контракте НЕТ. ` +
      `Освобождение протухло — снять его, иначе оно описывает не тот скилл.`));

  // 2. Ссылки. Класс, на котором обожглись 27.08: файл переезжает на уровень глубже, ссылка
  // остаётся прежней и молча перестаёт резолвиться. Греп по имени такого не видит.
  const dangling = danglingLinks(src, dir);
  soft(() => assert.deepEqual(dangling, [],
    `${name}: висячие ссылки → ${dangling.join(", ")}. Скилл, называющий несуществующий путь, — ` +
    `мёртвая инструкция: модель читает, делает что-то соседнее и отчитывается об успехе.`));
  // мутация: подложенная битая ссылка обязана ловиться
  assert.equal(danglingLinks(src + "\n[x](./net-takogo-fayla.md)\n", dir).length, dangling.length + 1,
    `${name}: проверка ссылок не сработала на подложенной битой ссылке — она мертва`);

  // 3. Скомпилирован ли. Правка markdown руками рассинхронизирует sha и тихо откатывается
  // следующим `vigiles compile`.
  soft(() => assert.ok(/vigiles:sha256:/.test(src),
    `${name}: нет марки компиляции. Значит SKILL.md правили руками, а не через .spec.ts — ` +
    `следующий \`vigiles compile\` затрёт правку без предупреждения.`));

  // 4-5. Содержательные якоря, каждый с ОБЕИМИ половинами.
  for (const [re, why] of opts.mustSay || []) {
    soft(() => assert.ok(re.test(src), `${name}: пропало «${why}» (${re})`));
    // Мутация: без совпавшего куска предикат обязан упасть. Замена ГЛОБАЛЬНАЯ — `replace` с
    // неглобальной регуляркой снимает только первое вхождение, и якорь, встречающийся дважды
    // (например и в description, и в теле), «прошёл» бы и на мутированном тексте. Тогда падал бы
    // этот ассерт, а не сам якорь, — то есть сообщение указывало бы не туда.
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    assert.equal(re.test(src.replace(g, "")), false,
      `${name}: якорь ${re} проходит и на тексте БЕЗ него — проверка ничего не закрепляет`);
  }
  for (const [re, why] of opts.mustNotSay || []) {
    soft(() => assert.ok(!re.test(src), `${name}: вернулось «${why}» (${re})`));
    assert.equal(re.test(src + "\n" + why + "\n"), true,
      `${name}: запрет ${re} не срабатывает на подложенной строке «${why}» — проверка мертва`);
  }

  if (deferred.length) throw new AggregateError(deferred, `${name}: ${deferred.length} находок`);
  recordCheck();
  return 1;
}
