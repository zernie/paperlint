// run-mechanical.mjs — run every check that is a SCRIPT, and record what each said.
//
//   node .claude/skills/paper-pipeline/scripts/run-mechanical.mjs <papers-root>/<paper-a>
//
// WHY THIS EXISTS, and why it is separate from the judgement gates. Half this pipeline is a
// program and half is a reading. The program half needs no agent, no model and no author — it
// needs someone to type the command, and that was the whole failure: `structure.mjs` shipped on
// 2026-08-05 wired to nothing, its findings reachable only by a person who remembered it existed.
// A check nobody runs and a check that does not exist differ only in the disappointment.
//
// So this runs them all, in one command, and writes each row to the ledger. What it does NOT
// do is decide anything: the exit code is the worst check's, and a BLOCKING finding here means a
// fact is wrong, never that a judgement is unfavourable. Judgement gates (cold-read-diff,
// tighten-paper, the panels) are read by a person or an agent and record themselves — they are
// not in this file, and putting them here would be the category error the CI workflow just got
// fixed for.
//
// ── 2026-08-10: ONE CHECK, ONE ROW ───────────────────────────────────────────────────────────
//
// 🔴 THE KEY USED TO BE `skill`, AND THAT WAS THE DEFECT. `status()` takes the last row per key,
// which is right across repeated runs of one check and wrong across two different checks. Filed
// under one skill name, two checks took turns being the answer: a clean run of the second erased
// a finding of the first from every derived view, while `runs.jsonl` still honestly held both.
//
// The cost was measurable and was paid. `repro/arm_permutation.py` and `repro/delivered_pdf.py`
// were LEFT OUT of this file for exactly that reason — their natural owner is `build-benchmark`
// and `check-provenance.mjs` was already sitting on that row, so wiring them in would have made
// three checks take turns. Both are wired in below now that each carries its own `check` id.
//
// There is no `PASS` verdict any more (see ledger.mjs). A check that runs and finds nothing
// records `ABSTAINED no-witness`, and "the paper is clean" is an inference the reader makes from
// the absence of findings — never a value this file writes down.

import { record, ABSTENTIONS } from "./ledger.mjs";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isMain } from "./consumer.mjs";
import { consumerRoot } from "./consumer.mjs";
const HERE = dirname(fileURLToPath(import.meta.url));

// 🔴 2026-08-26 — ЗДЕСЬ БЫЛО `'..', '..'`, И ЭТО ЛОМАЛО ВЕСЬ ФАЙЛ МОЛЧА. Файл переехал 15.08 из
// `.claude/pipeline/` в `.claude/skills/paper-pipeline/scripts/`, то есть на два уровня глубже, а
// счётчик `..` не поменялся: `ROOT` резолвился в `.claude/skills`, и КАЖДАЯ команда из `GATES`
// (все пути в них — от корня репо) искалась по `.claude/skills/.claude/skills/…`.
//
// Замер до починки, `run-mechanical.mjs <papers-root>/<paper-a>`: восемь чеков из
// тринадцати упали с `Cannot find module '.claude/skills/.claude/skills/…'`, и ни
// один не записался как `crashed` — `e.code === 'ENOENT'` ловит отсутствие ИНТЕРПРЕТАТОРА, а node
// нашёлся и сам напечатал стектрейс в stderr. Режим `flags` посчитал его строки: в леджер уехало
// **шесть строк `FINDING` с findings: 16**, где шестнадцать — это длина стектрейса. Одна из них
// (`verify-cites`, `read: 'exit'`) вдобавок `blocking: true`, то есть прогон «нашёл факт».
//
// Это ровно класс «четыре формы ссылки» из `CLAUDE.md`: у переехавшего файла меняется ГЛУБИНА
// `../` до корня, и грепом по пути этого не видно. Все пятнадцать соседей по каталогу
// (`*.harness.mjs`, `*.mutations.mjs`) при расселении получили четыре `..`; этот файл — нет,
// потому что он единственный не был тестом и его никто не прогонял.
const ROOT = consumerRoot();

// Имена правил структуры берутся ИЗ САМОГО МОДУЛЯ, а не переписываются сюда списком. Список,
// написанный руками, протухает в день, когда в `paper-structure.mjs` добавят тринадцатое правило —
// и протухает в сторону тишины: новое правило просто не попадёт в фильтр, а строка леджера
// продолжит выглядеть работающей. `CLAUDE.md`: всё, что можно вывести, выводить.
// Оба цитатных чекера живут в ОДНОМ месте и наводятся на build каждой статьи; копия на
// статью — это четыре файла, которые надо держать в согласии.
// 🔴 ОБЪЯВЛЕНИЕ, А НЕ АДРЕС. Цитатные чекеры (`report-submission.py`, `uncited_refs.py`) — это
// python, который живёт У ПОТРЕБИТЕЛЯ: пайплайн их вызывает, но не везёт. Здесь стоял путь
// внутрь конкретной статьи первого потребителя — в вынесенном пакете он и указывал бы в чужое
// дерево, и называл бы чужую работу.
//
// ⚠️ УМОЛЧАНИЯ НЕТ СОЗНАТЕЛЬНО, и это отличает ключ от `papers`/`ledger`. Там умолчание
// осмысленно (каталог `papers`, файл рядом); здесь любой угаданный путь был бы неверен у всех,
// кроме одного. Не объявлено — три строки `GATES` просто не запускаются: `needs()` ниже проверяет
// каталог на диске, то есть отсутствие читается как ABSTAINED `input-missing`, а не как падение
// и не как чистый прогон.
const CITE_CHECKS =
  process.env.PIPELINE_CITE_CHECKS ||
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))[
    "research-paper-pipeline"
  ]?.citeChecks ||
  null;
// Каталог цитатных чекеров есть и объявлен. Стоит в `needs()` каждой строки, которая его зовёт:
// без этого неверный или неуказанный путь падал бы стектрейсом python, а стектрейс в режиме
// `flags` считается построчно и уезжает в леджер как FINDING с находками длиной в трассу — ровно
// то, что уже случилось здесь 26.08 с неверной глубиной `..`.
const hasCiteChecks = () => CITE_CHECKS !== null && existsSync(join(ROOT, CITE_CHECKS));
// 🔴 A CHECKER THAT IS NOT INSTALLED IS `input-missing`, NEVER A RUN. Some rows shell out to
// scripts belonging to OTHER skills of the pipeline, which a consumer may not have installed.
// Without this the command fails, node prints a stack trace, and `read: "flags"` COUNTS ITS LINES
// — a missing checker arrives in the ledger as a FINDING whose count is the height of the trace.
// That is not hypothetical: it happened here on 2026-08-26 (see the note on ROOT above), six rows,
// one of them blocking. `needs()` is the only place where «I could not run» stays distinct from
// «I ran and saw something».
const hasScript = (rel) => existsSync(join(ROOT, rel));
// Единственное различие раскладки: часть статей рендерит в `build/`, остальные собираются на месте.
const buildOf = (d) => (existsSync(join(d, "build")) ? join(d, "build") : d);
const hasBuilt = (d, ext) =>
  existsSync(buildOf(d)) &&
  readdirSync(buildOf(d)).some((f) => f.endsWith(ext));
// `.body-limit` объявляет лимит страниц площадки — то есть статью, у которой есть отправка,
// а значит и смысл в блоках про анонимность/URL/страницы. Признак лежит В САМОЙ статье, а не
// именем в скрипте, поэтому новая статья подхватится сама.
const hasVenue = (d) => existsSync(join(d, ".body-limit"));

// 🔴 THE CONSUMER'S RULE MODULE, RESOLVED FROM THE CONSUMER ROOT — not by counting `..` from
// this file. It was `../../../../eslint-rules/paper-structure.mjs`, which was a distance, and a
// distance stops being true the moment the file moves; from inside `node_modules` those four
// levels land two directories above the repository. The names are still READ FROM THE MODULE
// rather than copied here — a hand-written list rots toward silence the day a rule is added.
//
// Absence is tolerated and REPORTED, because this module belongs to the consumer: a repository
// that lints its papers some other way has no such file, and the one gate that filters on these
// names simply does not run. `needs()` on that gate asks the same question, so the absence
// arrives as ABSTAINED `input-missing` rather than as a clean run.
const STRUCTURE_RULES_FILE = join(ROOT, "eslint-rules", "paper-structure.mjs");
const STRUCTURE_RULES = existsSync(STRUCTURE_RULES_FILE)
  ? new Set(
      Object.keys((await import(pathToFileURL(STRUCTURE_RULES_FILE).href)).default).map(
        (r) => `paper/${r}`,
      ),
    )
  : new Set();

// skill      → the skill this check belongs to (its SKILL.md is what `skillHash` keys on)
// check      → THE ROW KEY, unique per check. Two checks under one skill are two rows.
// cmd        → argv, run from the repo root
// read       → how to read the result:
//                `exit` — the script's own exit code is the answer (a FACT check); a non-zero
//                         exit is a BLOCKING finding.
//                `flags` — non-empty output is a finding and never blocking (a JUDGEMENT check).
//                `json`  — stdout is a JSON array of findings; its length is the count.
//                `eslint` — stdout is ESLint's `--format json` (an array of FILES, each with its
//                         own `messages`), so the count is the number of messages whose `ruleId`
//                         is in this gate's `rules` set — never the length of the array, which is
//                         the number of files and would read 1 on a paper with fifty findings.
// rules      → `read: 'eslint'` only: the rule ids this row owns. One ESLint run carries every
//              rule that matched the file, and the rows here are per-check, so each row takes its
//              own and leaves the rest to the row that owns them.
// Экспортируется РАДИ ХАРНЕССА. `main()` запускается только при прямом вызове (низ файла), так
// что импорт этого модуля побочных эффектов не имеет, а тест получает возможность взять строку и
// прогнать ЕЁ КОМАНДУ — а не свою копию команды, которая разъедется с этой при первой правке.
export const GATES = [
  {
    skill: "render-paper",
    check: "report-submission",
    cmd: (d) => [
      "python3",
      join(CITE_CHECKS, "report-submission.py"),
      buildOf(d),
    ],
    needs: (d) => hasCiteChecks() && hasBuilt(d, ".log") && hasVenue(d),
    read: "exit",
    note: "body pages, overfull boxes, unresolved refs, dropped characters, anonymity, artifact URLs",
  },
  {
    // Та же программа, узкий срез: у статьи без объявленного лимита площадки блоки про
    // анонимность и URL отвечают о чужом вопросе (замер 28.08 на ПРИНЯТОЙ agenticdev: 18
    // находок анонимности, ни одна не дефект — camera-ready деанонимизирована намеренно).
    // Гейт, красный по причинам, которые читатель обязан игнорировать, перестают читать.
    skill: "render-paper",
    check: "report-submission-citations",
    cmd: (d) => [
      "python3",
      join(CITE_CHECKS, "report-submission.py"),
      buildOf(d),
      "--only",
      "citations",
    ],
    needs: (d) => hasCiteChecks() && hasBuilt(d, ".log") && !hasVenue(d),
    read: "exit",
    note: "a \\cite with no bibliography entry, from the pdflatex log",
  },
  {
    // 🔴 2026-08-26 — ЭТА СТРОКА БЫЛА ЗЕЛЁНЫМ-И-МЁРТВЫМ ГЕЙТОМ РОВНО ОДИН ДЕНЬ, И ЭТО ЗАМЕР.
    // Раньше здесь стоял `node .claude/skills/tighten-paper/structure.mjs --flags-only`. В тот же
    // день все шестнадцать проверок оттуда уехали в правила ESLint (`eslint-rules/paper-structure.mjs`),
    // и режим `--flags-only` стал МОЛЧАТЬ ВСЕГДА и выходить в 0 — намеренно, чтобы указатель
    // «смотри eslint» не превратился в вечную ложную находку. Но `read: 'flags'` читает молчание
    // как «находок нет», так что леджер записывал `ABSTAINED no-witness` ПО МОЛЧАНИЮ, А НЕ ПО
    // ПРОВЕРКЕ. Замер на `<paper-a>/paper.md`: `--flags-only` — 0 строк, exit 0; те же
    // байты через ESLint — **6 находок** (`subsection-size` ×2 · `section-lead` · `free-section-size`
    // ×2 · `block-ungraded`). Шесть находок, о которых потребитель узнавал ноль.
    //
    // ПОЧЕМУ ПЕРЕВОД, А НЕ УДАЛЕНИЕ СТРОКИ. Для шага в CI удаление было правильным — там рядом уже
    // стоит `npx eslint … .` по всему репо, и структурные находки печатает он. Здесь дубля нет:
    // ESLint в леджер не пишет НИЧЕГО, а леджер — единственное место, где «структуру этой статьи
    // на этих байтах кто-то смотрел» хранится с хешем входа. Снять строку значило бы обменять
    // молчание на отсутствие.
    //
    // Фильтр по `STRUCTURE_RULES` намеренный: ESLint на этом файле даёт 30 находок, из них 24 —
    // проза и ремесло, у которых в леджере СВОЯ строка. Без фильтра одна строка забирала бы чужие
    // находки, а это ровно «две проверки по очереди становятся ответом», ради лечения которого
    // ключом строки сделали `check`.
    skill: "tighten-paper",
    check: "structure",
    cmd: (d) => [
      "node_modules/.bin/eslint",
      "--no-config-lookup",
      "--config",
      "eslint.config.mjs",
      "--format",
      "json",
      join(d, "paper.md"),
    ],
    // Бинарь не установлен — это `input-missing` (проверяющий инструмент есть вход прогона), а не
    // `crashed`. Та же логика и та же форма, что у `textidote` ниже.
    // Плюс сам модуль правил: без него `rules` пуст, а фильтр по пустому множеству оставил бы
    // ноль находок из тридцати — уверенный зелёный прогон вместо честного «входа нет».
    needs: () =>
      existsSync(join(ROOT, "node_modules/.bin/eslint")) && STRUCTURE_RULES.size > 0,
    read: "eslint",
    rules: STRUCTURE_RULES,
    note: "section weights, the free half vs the half under a page limit, unjustified blocks",
  },
  {
    skill: "grade-paper-writing",
    check: "prose-lint",
    cmd: (d) => [
      "node",
      ".claude/skills/grade-paper-writing/prose-lint.mjs",
      "--flags-only",
      join(d, "paper.md"),
    ],
    needs: () => hasScript(".claude/skills/grade-paper-writing/prose-lint.mjs"),
    read: "flags",
    note: "thresholds with published baselines; judgement, so it never fails the run",
  },
  {
    skill: "verify-citations",
    check: "verify-cites",
    cmd: () => [
      "node",
      ".claude/skills/verify-citations/scripts/verify-cites.test.mjs",
    ],
    needs: () => hasScript(".claude/skills/verify-citations/scripts/verify-cites.test.mjs"),
    read: "exit",
    note: "the mechanical half only — the fetching half needs the network and a reader",
  },
  {
    skill: "harden-paper",
    check: "artifact-coverage",
    cmd: (d) => [
      "node",
      join(HERE, "artifact-coverage.mjs"),
      d,
    ],
    read: "flags",
    note: "does the released bundle hold data for what the paper points at",
  },
  {
    skill: "build-benchmark",
    check: "check-provenance",
    cmd: (d) => [
      "node",
      join(HERE, "check-provenance.mjs"),
      d,
    ],
    read: "flags",
    note: "bolded figures with no row in any provenance file",
  },
  // 🔴 THE TWO THAT HAD NOWHERE TO FILE. Both are `build-benchmark` checks; both were unwired
  // until the row key became the check, and until then their only runner was their own harness.
  {
    skill: "build-benchmark",
    check: "arm-permutation",
    cmd: (d) => [
      "python3",
      join(d, "repro/arm_permutation.py"),
      "--repro",
      join(d, "repro"),
      "--paper",
      join(d, "paper.md"),
      "--json",
    ],
    needs: (d) => existsSync(join(d, "repro/arm_permutation.py")),
    read: "json",
    note: "a quantity that does not move when its arm label moves was transcribed, not computed",
  },
  {
    skill: "build-benchmark",
    check: "delivered-pdf",
    cmd: (d) => [
      "python3",
      join(d, "repro/delivered_pdf.py"),
      "--repro",
      join(d, "repro"),
      "--paper",
      join(d, "paper.md"),
      "--pdf",
      join(d, "build/acl_latex.pdf"),
      "--json",
    ],
    needs: (d) =>
      existsSync(join(d, "repro/delivered_pdf.py")) &&
      existsSync(join(d, "build/acl_latex.pdf")),
    read: "json",
    note: "every registered quantity reached the delivered page beside the prose that claims it",
  },
  {
    // Ported from MedSci Skills' `check_generated_code.py` (arXiv:2606.09500v4). Filed under
    // `build-benchmark` because that is the pass that builds the reproduction artifact, and this
    // asks whether the scripts inside it run the same way twice on somebody else's disk.
    //
    // 🔴 NOT a duplicate of `check-anon.sh` category 5, which greps the same four path prefixes.
    // That one reads the SHIPPED BUNDLE and asks whether it leaks the author's machine layout;
    // this one reads the WORKING TREE before the scripts run and asks whether they are portable at
    // all. The trees they scan are disjoint by construction — the bundle is excluded here — and the
    // exclusion is printed in the check's own ignore ledger rather than hidden in a glob.
    skill: "build-benchmark",
    check: "generated-code",
    cmd: (d) => [
      "node",
      join(HERE, "generated-code.mjs"),
      d,
    ],
    read: "flags",
    note: "analysis scripts that never seed randomness, hard-code an absolute path, or clobber their own input",
  },
  // 🔴 TWO EXTERNAL CHECKERS, ADDED 2026-08-10. Both cover a surface every check in this file
  // reads past: one has no dictionary, the other never looks at the citation graph backwards.
  {
    // Filed under `grade-paper-writing` DELIBERATELY, not under `verify-citations` or a skill of
    // its own. That skill already owns `prose-lint`, which is the paper's PROSE surface; spelling
    // and grammar are the same surface, judged by a different instrument. A separate skill would
    // have meant a 23rd SKILL.md to keep wired, and filing it under `render-paper` (which owns the
    // built artifact) would have put a source-text check on the row for the check that reads PDFs.
    skill: "grade-paper-writing",
    check: "textidote",
    cmd: (d) => [
      "python3",
      join(d, "repro/textidote_check.py"),
      "--paper",
      join(d, "paper.md"),
      "--baseline",
      join(d, "repro/textidote-grandfathered.txt"),
      "--json",
    ],
    // The jar is 224 MB and is NOT committed, so its absence is normal on a fresh container and
    // must read as `input-missing` rather than as silence. `crashed` would be the other honest
    // answer; `input-missing` is chosen because the checker is an input the run did not have.
    // 🔴 MIRRORS `find_jar()` IN THE CHECKER, INCLUDING ITS ONE RULE: an explicit $TEXTIDOTE_JAR is
    // AUTHORITATIVE, so naming a missing file means "absent" rather than "fall back to /opt". The
    // first version of this line used `.some()` over both candidates and disagreed with the checker
    // — the gate would have called the input present and the checker would then have refused, so an
    // absent jar was recorded as `crashed` instead of `input-missing`. Two answers to one question,
    // which is the whole failure mode of a gate that does not read what it gates.
    needs: (d) =>
      existsSync(join(d, "repro/textidote_check.py")) &&
      existsSync(process.env.TEXTIDOTE_JAR || "/opt/textidote/textidote.jar"),
    read: "json",
    note: "a spelling or grammar warning with no row in repro/textidote-grandfathered.txt",
  },
  {
    // `verify-citations` owns the bibliography, and this is that surface read in the one direction
    // its own check cannot see: verify-cites asks whether an ENTRY names a real work, and this asks
    // whether anything points AT the entry. Same file, opposite arrow, so the same skill.
    skill: "verify-citations",
    check: "uncited-refs",
    cmd: (d) => [
      "python3",
      join(CITE_CHECKS, "uncited_refs.py"),
      "--build",
      buildOf(d),
      "--json",
    ],
    needs: (d) => hasCiteChecks() && hasBuilt(d, ".aux"),
    read: "json",
    note: "a bibliography entry no \\cite in the paper points at",
  },
  {
    skill: "draft-paper",
    check: "population-map",
    cmd: (d) => [
      "node",
      join(HERE, "population-map.mjs"),
      d,
    ],
    read: "flags",
    note: "can the reader tell WHICH SET each number counts",
  },
  {
    // `tighten-paper` owns this row because it is the pass told to pay the ratchet back: a review
    // round that only ever ADDS text is this project's oldest recorded drift, and the one gate whose
    // job is to remove text is the right place to weigh it. Four of the thirteen finding kinds read
    // the WHOLE body at both revisions rather than the round's declared scope — coverage that is a
    // function of what happened to be edited degrades silently, which is documented upstairs.
    skill: "tighten-paper",
    check: "round-diff",
    cmd: (d) => [
      "node",
      join(HERE, "round-diff.mjs"),
      d,
      "--json",
    ],
    needs: (d) => existsSync(join(d, "rounds")),
    read: "json",
    note: "a review round may only change what it declared; the whole body is weighed every round",
  },
];

/**
 * Write the check's own output where a reader can open it, and hand back the repo-relative path.
 *
 * 🔴 THIS IS NOT DECORATION. Before today this file recorded findings with NO report path, and
 * `record()` now refuses that — correctly, and for a reason measured on real rows: four of six
 * runs on 2026-08-07 stored a count and dropped the location, leaving thirty-six findings that
 * were a number and nothing else. A count with no location is a rumour, and a rumour gets
 * re-derived from scratch next session. The frontmatter states the count so the ledger and the
 * report can be checked against each other, which `record()` does.
 */
function writeReport(dir, g, count, body) {
  const rel = join("reviews", "mechanical", `${g.skill}--${g.check}.md`);
  const abs = join(dir, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(
    abs,
    [
      "---",
      `title: "${g.skill}/${g.check} — mechanical check output"`,
      `created: ${new Date().toISOString().slice(0, 10)}`,
      `findings: ${count}`,
      "---",
      "",
      `Written by \`run-mechanical.mjs\`. What this check looks at: ${g.note}`,
      "",
      "```",
      body.trimEnd() || "(the check produced no output)",
      "```",
      "",
    ].join("\n"),
  );
  return rel;
}

function main(argv) {
  const dir = resolve(argv[2] || ".");
  if (!existsSync(join(dir, "paper.md"))) {
    console.error(`no paper.md in ${dir}`);
    return 2;
  }

  // A duplicate key would silently restore the exact defect this file was refactored to remove,
  // so it is checked here rather than trusted to review. Cheap, and it cannot be forgotten.
  const keys = GATES.map((g) => `${g.skill}/${g.check}`);
  const dupe = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dupe) {
    console.error(
      `two checks share the row key "${dupe}" — they would take turns being the answer`,
    );
    return 2;
  }

  let worst = 0;
  for (const g of GATES) {
    const key = `${g.skill}/${g.check}`;
    const abstain = (reason, note) => {
      console.log(
        `\n⬜ ${key} — abstained (${reason}): ${ABSTENTIONS.get(reason)}`,
      );
      record({
        skill: g.skill,
        check: g.check,
        paper: dir,
        kind: "ABSTAINED",
        reason,
        note: note ?? g.note,
      });
    };

    if (g.needs && !g.needs(dir)) {
      abstain("input-missing");
      continue;
    }

    // `out` без начального значения: try присваивает, catch присваивает ниже (2026-08-28)
    let out,
      code = 0,
      crashed = false;
    try {
      out = execFileSync(g.cmd(dir)[0], g.cmd(dir).slice(1), {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      if (e.code === "ENOENT") {
        crashed = true;
      }
      code = e.status ?? 1;
      out = (e.stdout || "") + (e.stderr || "");
    }
    if (crashed) {
      abstain("crashed", `${g.cmd(dir)[0]} is not installed`);
      continue;
    }

    const lines = out.split("\n").filter((l) => l.trim()).length;
    let count,
      blocking = false;
    if (g.read === "exit") {
      count = code === 0 ? 0 : Math.max(1, lines);
      blocking = code !== 0;
    } else if (g.read === "eslint") {
      // Три способа, которыми ESLint может НЕ проверить файл, и все три выглядят как чистый
      // прогон, если читать только длину отфильтрованного списка. Каждый разводится в свою
      // строку леджера, потому что «не проверял» и «проверил, ничего не нашёл» — разные факты.
      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        parsed = null;
      }
      // 1. не JSON вообще: сломанный конфиг, глоб без единого файла (`No files matching the
      //    pattern … were found`, exit 2), отсутствующий бинарь. Всё это уходит в stderr.
      if (!Array.isArray(parsed)) {
        abstain(
          "crashed",
          `eslint не отдал JSON: ${(out.trim().split("\n")[0] || "(пустой вывод)").slice(0, 160)}`,
        );
        continue;
      }
      const msgs = parsed.flatMap((f) =>
        f.messages.map((m) => ({ ...m, filePath: f.filePath })),
      );
      // 2. правило само упало на этом файле. `fatal` приходит с `ruleId: null`, то есть после
      //    фильтра исчезает бесследно и читается как «находок нет».
      const fatal = msgs.find((m) => m.fatal);
      if (fatal) {
        abstain("crashed", `eslint упал на файле: ${fatal.message}`);
        continue;
      }
      // 3. к файлу не применилось НИ ОДНО правило («File ignored because outside of base path» —
      //    так выглядит фикстура во временном каталоге, «…because no matching configuration» —
      //    файл вне глоба конфига). Ноль находок тут означает «никто не смотрел».
      const ignored = msgs.find(
        (m) => !m.ruleId && /^File ignored/.test(m.message),
      );
      if (ignored) {
        abstain(
          "input-missing",
          `eslint не применил к файлу ни одного правила: «${ignored.message}»`,
        );
        continue;
      }
      const mine = msgs.filter((m) => g.rules.has(m.ruleId));
      count = mine.length;
      // severity 2 — это правила, объявленные в `eslint.config.mjs` бинарными («ссылка либо
      // разрешается, либо нет»), то есть FACT в словаре этого файла. Пороги, выбранные человеком,
      // объявлены `warn` и остаются судейскими.
      blocking = mine.some((m) => m.severity === 2);
      out = mine
        .map(
          (m) =>
            `${m.filePath}:${m.line}:${m.column}  ${m.severity === 2 ? "error" : "warning"}  ${m.ruleId}  ${m.message}`,
        )
        .join("\n");
    } else if (g.read === "json") {
      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        parsed = null;
      }
      if (!Array.isArray(parsed)) {
        abstain(
          "crashed",
          "output was not the JSON array of findings it documents",
        );
        continue;
      }
      count = parsed.length;
      out = JSON.stringify(parsed, null, 2);
    } else {
      // `flags` mode prints a header line even when clean, so one line is not a finding.
      //
      // 🔴 PREFER THE CHECK'S OWN COUNT WHEN IT STATES ONE. Counting output lines is what this file
      // did before 2026-08-10, and writing the report out made the consequence visible on the page:
      // `check-provenance` printed "7 finding(s)" in a report whose frontmatter said 13, because
      // thirteen was the number of LINES. The ledger and the report agreed with each other and both
      // disagreed with the checker — which is the exact "two numbers, one already wrong" state the
      // evidence contract exists to catch, sitting one level up where the contract could not see it.
      // Lines remain the fallback for checks that state nothing.
      const stated = /—\s*(\d+)\s+finding\(s\)/.exec(out);
      count = stated ? Number(stated[1]) : lines > 1 ? lines : 0;
    }

    if (count === 0) {
      // 🔴 NOT a pass. The check ran and produced no finding, and it has no witness for the
      // negative — so it abstains and the reader derives cleanliness from the absence, if they
      // want to claim it.
      console.log(`\n🤍 ${key} — no finding recorded (abstained: no-witness)`);
      console.log(`   ${g.note}`);
      record({
        skill: g.skill,
        check: g.check,
        paper: dir,
        kind: "ABSTAINED",
        reason: "no-witness",
        note: g.note,
      });
      continue;
    }

    const report = writeReport(dir, g, count, out);
    console.log(
      `\n${blocking ? "🔴" : "🟠"} ${key} — ${count} finding(s) → ${report}`,
    );
    console.log(`   ${g.note}`);
    console.log(
      out
        .split("\n")
        .slice(0, 12)
        .map((l) => "   " + l)
        .join("\n"),
    );
    record({
      skill: g.skill,
      check: g.check,
      paper: dir,
      kind: "FINDING",
      findings: count,
      report,
      blocking,
      note: g.note,
    });
    if (blocking) worst = 1;
  }

  console.log(
    `\n${worst === 0 ? "🟢 no FACT check recorded a blocking finding" : "🔴 a FACT check found something — see above"}`,
  );
  console.log(
    `   Judgement checks report and never fail the run; read them, and never grep this for green.\n`,
  );
  return worst;
}

if (isMain(import.meta.url))
  process.exit(main(process.argv));
