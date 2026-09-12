#!/usr/bin/env node
/**
 * check-provenance — есть ли у статьи гейт чисел на этапе сборки, и что он ещё НЕ покрывает.
 *
 * 🔴 ТРИ ИЗ ПЯТИ ПРОВЕРОК УЕХАЛИ В ПРАВИЛА ESLint 2026-08-26 (`eslint-rules/paper-registry.mjs`):
 *
 *   arm-mismatch     → `paper/number-arm-mismatch`
 *   untraced-number  → `paper/number-untraced`
 *   arm-unlabelled   → `paper/number-arm-unlabelled`
 *
 * Все три говорили про ПРЕДЛОЖЕНИЕ В СТАТЬЕ, а провенанс-файлы (`NOTES.md`, `CLAIMS.md`,
 * `repro/artifact-anon/NUMBERS.md`, `NUMBER-ARMS.tsv`) были для них КОНФИГУРАЦИЕЙ — тем, что
 * задаёт, какое предложение считать дефектным. Ровно как профиль площадки для `pdf/profile`.
 * Паритет доказан ДО удаления: настоящая статья (5 `arm-mismatch` + 5 чисел `untraced`,
 * множества совпали) плюс 17 фикстур. Разбор —
 * `the author's private research notes`.
 *
 * ЧТО ОСТАЛОСЬ ЗДЕСЬ, И ПОЧЕМУ ЭТО НЕ ЛЕНЬ. Две оставшиеся проверки **не читают тело статьи
 * вообще** — им на вход дан только каталог:
 *
 *   no-numbers-gate   в статье нет `repro/paper_numbers.py`, то есть каждая напечатанная величина
 *                     здесь — набранная руками цифра, чья единственная связь с файлом данных —
 *                     чья-то память.
 *   numbers-coverage  сколько величин засорсено и сколько ещё сырых (храповик
 *                     `numbers-grandfathered.txt`). Это ВООБЩЕ НЕ НАХОДКА, а замер покрытия —
 *                     у ESLint нет severity «к сведению», а выкинуть его значило бы потерять
 *                     единственную строку, отвечающую «а гейт-то покрывает то, что проверит
 *                     рецензент?».
 *
 * Проверка, которая не читает линтуемый файл, не может быть правилом о нём — этот различитель и
 * решил обе.
 *
 * ═══ ИСТОРИЯ ОТКАЗА, из-за которого файл вообще появился (сохранена дословно) ═══
 * 2026-08-05, за 29 часов до дедлайна. Заголовок статьи читал «147 real rules files exactly as
 * their projects committed them, 22 fail admission». В агрегате артефакта
 * `.all.annotated.failedContradicted = 22` — на файлах КАК ЗАКОММИЧЕНО не падает ничего. 22 —
 * контрфактическая рука, где догадки экстрактора вписаны так, будто их написал автор.
 *
 * Ни одна проверка пайплайна этого не видела, и причина структурная: каждая смотрит на ОДНУ
 * сторону. verify-citations проверяет, что ссылка настоящая. Диф сохранения клеймов — что клейм
 * не вырос (и он не вырос, 22 всегда было 22). Ревьюер артефакта пересчитывает число из данных, и
 * оно сходится, потому что число ВЕРНОЕ. Панель читает прозу и принимает «unmodified» за факт.
 * Дефект живёт только в СТЫКЕ между предложением и путём к полю, и обе стороны сразу не держал
 * никто. Держит их теперь `paper/number-arm-mismatch`.
 *
 * Advisory. Exit 0 always; findings on stdout.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { isMain } from "./consumer.mjs";

// 🔴 ИМПОРТА `markdown.mjs` БОЛЬШЕ НЕТ, И ЭТО СЛЕДСТВИЕ ПЕРЕЕЗДА, А НЕ УПРОЩЕНИЕ. Разметку тут
// разбирать больше нечем и незачем: обе оставшиеся проверки смотрят на КАТАЛОГ, а не на текст.
// Границы библиографии (`## References`), ради которых стоял `requireMarkdown()`, нужны теперь
// правилам в `eslint-rules/paper-registry.mjs`, и там их даёт сам ESLint.

/**
 * Has this paper adopted the build-time numbers gate, and how far?
 *
 * SUPERSEDED, 2026-08-05, same day it was written. The registry below (`NUMBER-ARMS.tsv`) keyed its
 * rules on the NUMBER — "wherever 22 appears, one of these phrases must be near it". That is wrong
 * in a way that shows up immediately in a real paper: `<paper-a>` prints two unrelated 22s
 * (22 files that fail admission in the counterfactual arm, and 8 of 22 abstentions in a paired
 * sample), and a number-keyed rule cannot tell them apart. It fires on the innocent one and, worse,
 * would go on passing if the guilty one were reworded.
 *
 * The replacement keys on the OCCURRENCE: the paper writes `{{annotated.failedContradicted}}`, not
 * `22`, so each printed quantity carries its own identity and its own guard, and the build refuses
 * a PDF where the value has gone stale or the surrounding prose claims the wrong arm. See
 * `<paper>/repro/paper_numbers.py`. That gate is per-paper because the data layout is per-paper;
 * what belongs HERE is the generic question: does this paper have one, and what does it still leave
 * uncovered?
 *
 * ⚠️ Чтение `NUMBER-ARMS.tsv` (находка `arm-unlabelled`) уехало 2026-08-26 в правило
 * `paper/number-arm-unlabelled`; реестр по-прежнему работает для статьи, у которой он есть.
 */
function checkNumbersGate(dir) {
  const out = [];
  const gate = join(dir, "repro", "paper_numbers.py");
  const registry = join(dir, "repro", "numbers.tsv");
  if (!existsSync(gate)) {
    out.push({
      kind: "no-numbers-gate",
      msg:
        "no repro/paper_numbers.py — every printed figure here is a hand-typed digit whose only " +
        "link to its data file is somebody's memory. Copy the gate from a paper that already has one; the " +
        "defect it catches (right number, wrong experimental arm) is invisible to every other check",
    });
    return out;
  }
  if (!existsSync(registry)) return out;
  const rows = readFileSync(registry, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#")).length;
  const allow = join(dir, "repro", "numbers-grandfathered.txt");
  const raw = existsSync(allow)
    ? readFileSync(allow, "utf8")
        .split("\n")
        .filter((l) => l.split("#")[0].trim()).length
    : 0;
  // Not a finding — a fact the scorecard should carry, because "we have a gate" and "the gate
  // covers the numbers a reviewer will check" are different claims and only the second matters.
  out.push({
    kind: "numbers-coverage",
    msg:
      `${rows} quantities are sourced and guarded, ${raw} are still raw and grandfathered — ` +
      `the grandfathered ones are an admission, not a clearance`,
  });
  return out;
}

/**
 * Почему гварды вынесены В ОТДЕЛЬНУЮ функцию, а не оставлены ранними `return` внутри
 * `checkProvenance` — замер 2026-08-26.
 *
 * 🔴 Скрипт печатал `🔢 check-provenance — clean` для `<paper-b>` и `<paper-c>`, ни разу
 * ничего не проверив: обе статьи в LaTeX, `paper.md` у них нет, `find(existsSync)` отдавал
 * `undefined`, и функция выходила пустым массивом. То есть **«у тебя нет гейта чисел» было
 * заглушено ровно на тех статьях, у которых его нет** — `repro/paper_numbers.py` существует
 * только у `<paper-a>`. Уверенный зелёный на трёх статьях из четырёх.
 *
 * Пропуск, неотличимый от прохода, — это тот же отказ, что «0 checks» против «checks passed» в
 * интерфейсе PR. Соседи по каталогу (`artifact-coverage.mjs`, `population-map.mjs`) давно
 * печатают `⏭️ SKIPPED … absence of findings here is absence of checking, not a clean bill`;
 * этот файл был единственным, кто молчал.
 *
 * Гвард — ОДИН на оба потребителя (список находок и вывод CLI), чтобы причина пропуска не могла
 * разъехаться с самим пропуском.
 */
export function provenanceScope(dir) {
  const paper = ["paper.md", "draft.md"]
    .map((f) => join(dir, f))
    .find(existsSync);
  if (!paper) {
    return {
      covered: false,
      reason:
        "нет paper.md и draft.md — чекер читает только markdown, статья в .tex им НЕ покрыта",
    };
  }
  const prov = [
    "NOTES.md",
    "CLAIMS.md",
    join("repro", "artifact-anon", "NUMBERS.md"),
  ]
    .map((f) => join(dir, f))
    .filter(existsSync)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  if (!prov) {
    return {
      covered: false,
      reason:
        "нет ни одного непустого NOTES.md / CLAIMS.md / repro/artifact-anon/NUMBERS.md",
    };
  }
  return { covered: true, reason: null };
}

export function checkProvenance(dir) {
  if (!provenanceScope(dir).covered) return [];
  return [...checkNumbersGate(dir)];
}

if (isMain(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? ".");
  const f = checkProvenance(dir);
  if (f.length) {
    console.log(`🔢 check-provenance — ${f.length} finding(s):`);
    for (const x of f) console.log(`   [${x.kind}] ${x.msg}`);
  } else {
    // Пропуск и проход печатаются РАЗНЫМИ строками — см. комментарий у `provenanceScope`.
    const scope = provenanceScope(dir);
    if (scope.covered) console.log("🔢 check-provenance — clean");
    else
      console.log(`⏭️  check-provenance SKIPPED для ${dir} — ${scope.reason}`);
  }
  process.exit(0);
}
