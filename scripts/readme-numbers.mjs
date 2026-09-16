#!/usr/bin/env node
/**
 * README называет числа. Здесь они ПРОИЗВОДЯТСЯ и сверяются с названными.
 *
 * 🔴 ЗАЧЕМ ЭТО ВООБЩЕ. `CLAUDE.md` этого репозитория говорит: «число в сообщении коммита,
 * которого не произвела ни одна команда, — это то, что репозиторий существует сделать
 * невозможным». README при этом нёс четыре таких числа, написанных РУКОЙ и вдобавок СЛОВАМИ
 * («Forty-five of those»). Замер 2026-09-17: обещано 45 харнессов и 22 батареи, на диске 49 и 27.
 * Разъехалось молча, потому что сверять было нечем — а число, написанное словом, не сравнить
 * даже грепом.
 *
 * 🔴 И ВТОРОЕ, ИЗ-ЗА ЧЕГО СКРИПТ УСТРОЕН ИМЕННО ТАК. Первая версия счётчика правил считала
 * `default.rules` и молча записывала всё остальное в «не плагин правил». На `tex-build.mjs`,
 * который экспортирует правила ПРЯМО в `default`, она потеряла два правила и уверенно
 * напечатала 8 вместо 10. Это в точности «счётчик, который считает то, что игнорирует»:
 * пропуск ничего не обещает, а счётчик обещает покрытие.
 *
 * Поэтому модуль, форму которого распознать не удалось, — ОШИБКА, а не пропуск. Модули без
 * правил перечислены ПОИМЁННО ниже: новый безымянный модуль не сможет исчезнуть тихо.
 */
import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Модули в `eslint-rules/`, у которых правил НЕТ по построению, с причиной. Список именно
 * поимённый: «нет правил» и «форму не распознали» обязаны различаться.
 */
const NOT_RULE_PLUGINS = new Map([
  ["papers.mjs", "хелперы путей: DEFAULT_PAPERS_ROOT, paperFiles, papersRoot"],
  ["latex-language.mjs", "ЯЗЫК `tex/latex`, а не плагин правил"],
]);

/** Считает правила, принимая ОБЕ формы экспорта, которые есть в этом репозитории. */
export async function countRules(root = ROOT) {
  const dir = join(root, "eslint-rules");
  let total = 0;
  const unknown = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".mjs") || /\.(harness|mutations)\.mjs$/.test(f)) continue;
    if (NOT_RULE_PLUGINS.has(f)) continue;
    const mod = await import(join(dir, f));
    const d = mod.default;
    // Форма A: `{ rules: { … } }` — плагин. Форма B: `{ … }` — сами правила, как в tex-build.
    const rules = d?.rules ?? d;
    const looksLikeRules =
      rules && typeof rules === "object" && Object.values(rules).every((r) => r && typeof r.create === "function");
    if (!looksLikeRules) {
      unknown.push(f);
      continue;
    }
    total += Object.keys(rules).length;
  }
  if (unknown.length) {
    const e = new Error(
      `форму экспорта не удалось распознать: ${unknown.join(", ")}. ` +
        `Это ОШИБКА, а не пропуск: молчаливый пропуск уже стоил двух правил. ` +
        `Либо модуль экспортирует правила, либо он назван в NOT_RULE_PLUGINS с причиной.`,
    );
    e.unknown = unknown;
    throw e;
  }
  return total;
}

/**
 * Файлы по суффиксу, рекурсивно, мимо node_modules.
 *
 * 🔴 `lstatSync`, А НЕ `statSync`, И ЭТО НЕСУЩЕЕ. `statSync` идёт ПО СИМЛИНКУ, а в этом
 * репозитории `.claude/skills/*` — двадцать четыре симлинка обратно в `skills/`. Первая версия
 * насчитала 83 харнесса вместо 49: те же файлы посчитались дважды, по одному разу на каждый
 * путь к ним. Поймано не глазом, а расхождением с двумя независимыми командами — `git ls-files`
 * и `find` дают 49 обе. Симлинк на каталог — это не новый каталог.
 */
export function countFiles(root, suffix) {
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      if (e === "node_modules" || e === ".git") continue;
      const p = join(d, e);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(p);
      else if (e.endsWith(suffix)) n++;
    }
  };
  walk(root);
  return n;
}

export async function actualCounts(root = ROOT) {
  return {
    rules: await countRules(root),
    harnesses: countFiles(root, ".harness.mjs"),
    batteries: countFiles(root, ".mutations.mjs"),
    skills: readdirSync(join(root, "skills")).filter((d) => lstatSync(join(root, "skills", d)).isDirectory()).length,
  };
}

/**
 * Числа, ОБЪЯВЛЕННЫЕ в README. Форма — явная пометка, а не проза: `<!-- count:rules -->10`.
 * Цифрами, а не словами, ровно потому, что «Forty-five» нечем сравнить.
 */
export function declaredCounts(text) {
  const out = {};
  for (const m of text.matchAll(/<!--\s*count:([a-z]+)\s*-->\s*(\d+)/g)) out[m[1]] = Number(m[2]);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const readme = readFileSync(join(ROOT, "README.md"), "utf-8");
  const declared = declaredCounts(readme);
  const actual = await actualCounts();
  const keys = Object.keys(actual);

  // Пустой скан — это НЕ «расхождений нет». Без этого стража удаление всех пометок из README
  // сделало бы проверку вечно зелёной.
  if (Object.keys(declared).length === 0) {
    console.error("🔴 в README нет ни одной пометки `<!-- count:… -->` — сверять нечего, а значит проверка ничего не утверждает");
    process.exit(1);
  }

  const bad = [];
  for (const k of keys) {
    if (!(k in declared)) bad.push(`  ${k}: на диске ${actual[k]}, а в README не объявлено вовсе`);
    else if (declared[k] !== actual[k]) bad.push(`  ${k}: README обещает ${declared[k]}, на диске ${actual[k]}`);
  }
  for (const k of Object.keys(declared)) {
    if (!keys.includes(k)) bad.push(`  ${k}: README объявляет ${declared[k]}, но такого счётчика нет`);
  }

  if (bad.length) {
    console.error("🔴 README называет числа, которых нет на диске:");
    for (const b of bad) console.error(b);
    console.error("\n  Числа в README производятся этой командой, а не пишутся рукой.");
    process.exit(1);
  }
  console.log(
    `✓ README: ${keys.map((k) => `${k} ${actual[k]}`).join(" · ")} — каждое число сверено с диском`,
  );
}
