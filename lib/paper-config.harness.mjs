/**
 * Обе половины для `lib/paper-config.mjs` — и, шире, для НАБОРА мест, которые публикуют эти две
 * константы.
 *
 * 🔴 ПОЧЕМУ ПРОВЕРКА ПЕРЕЕХАЛА СЮДА ИЗ `hooks/hooks.harness.mjs`. Там она сравнивала три хука
 * между собой — и была права ровно настолько, насколько был верен её ОХВАТ. Замер 2026-09-18:
 * объявлений было восемь в пяти файлах, по четыре на каждую константу, и у каждой ровно одна
 * копия лежала ВНЕ сравнения (`eslint-rules/papers.mjs`, `skills/paper-pipeline/scripts/consumer.mjs`).
 * Разъехались бы — не заметил бы никто. Проверка, живущая у хуков, по построению не могла
 * увидеть не-хуков; переезд к самому предмету это чинит.
 *
 * 🔴 ЗНАЧЕНИЯ ИМПОРТИРУЮТСЯ. Прежняя редакция читала их регуляркой по исходнику, и добавление
 * `export` — правка, ничего не менявшая в поведении, — её покрасила. Паттерн по коду есть тень
 * объявления, у тени есть написания; импорт даёт само значение.
 *
 * ⚠️ ГДЕ ОСТАЁТСЯ РИСК, И ОН НАЗВАН, А НЕ СПРЯТАН. Список носителей ниже — явный. Появится
 * шестой файл со своей копией — сравнивать его будет нечему. Поэтому ниже стоит вторая
 * проверка, ПОЛНОТЫ: она ищет объявления по всему корпусу и требует, чтобы каждый найденный
 * файл был в списке. У неё предмет другой — «есть ли файл, о котором я не знаю», — и текстовый
 * поиск для него законен: он ищет КАНДИДАТОВ, а значение всё равно берётся импортом.
 *
 * Прогон:   npx vigiles test lib/paper-config.harness.mjs
 * Убивается: lib/paper-config.mutations.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

/**
 * Каждое место, публикующее хотя бы одну из двух констант. Три хука дублируют их вынужденно
 * (компилируемому хуку запрещено импортировать что-либо кроме `vigiles/hook`); остальные
 * ре-экспортируют из `lib/paper-config.mjs` и держатся здесь ровно затем, чтобы ре-экспорт,
 * подменённый однажды обратно на собственное объявление, был пойман.
 */
const CARRIERS = [
  "lib/paper-config.mjs",
  "hooks/paper-edit-guard.hook.mjs",
  "hooks/paper-skills-nudge.hook.mjs",
  "hooks/paper-status-gates.hook.mjs",
  "eslint-rules/papers.mjs",
  "skills/paper-pipeline/scripts/consumer.mjs",
];

const loaded = await Promise.all(
  CARRIERS.map(async (rel) => {
    const mod = await import(pathToFileURL(join(ROOT, rel)).href);
    return { rel, key: mod.CONFIG_KEY, def: mod.DEFAULT_PAPERS_ROOT };
  }),
);

// ── I. ИСТОЧНИК ГОВОРИТ ТО, ЧТО ДОЛЖЕН ──────────────────────────────────────────────────────
{
  // 🔴 ЗДЕСЬ НЕТ ЛИТЕРАЛА КЛЮЧА, И ЭТО НАМЕРЕННО. Первая редакция сверяла `src.key` с
  // «research-paper-pipeline» прямо тут — и тем самым делала НЕУБИВАЕМОЙ проверку ниже, что
  // ключ равен имени пакета: любая порча значения валилась раньше, на литерале. Значение
  // пиновано ровно в одном месте — там, где у него есть ПРИЧИНА быть таким.
  const src = loaded[0];
  check(
    "источник объявляет обе константы непустыми строками",
    typeof src.key === "string" && src.key.length > 0 &&
      typeof src.def === "string" && src.def.length > 0,
  );
  check("умолчание каталога статей — `papers`", src.def === "papers");
}

// ── II. ВСЕ НОСИТЕЛИ СОГЛАСНЫ С ИСТОЧНИКОМ ──────────────────────────────────────────────────
{
  const keys = new Set(loaded.map((c) => c.key).filter((v) => v !== undefined));
  const defs = new Set(loaded.map((c) => c.def).filter((v) => v !== undefined));
  check(
    `все носители согласны о CONFIG_KEY (${[...keys].join(" / ")})`,
    keys.size === 1,
  );
  check(
    `все носители согласны о DEFAULT_PAPERS_ROOT (${[...defs].join(" / ")})`,
    defs.size === 1,
  );
  check(
    "и ни один носитель не молчит про обе сразу — такой в списке лишний",
    loaded.every((c) => c.key !== undefined || c.def !== undefined),
  );
  // Ключ — это ИМЯ ПАКЕТА, а не совпадающая с ним строка. Разойдутся при переименовании
  // пакета — потребитель будет объявлять настройки под одним именем, а читаться будет другое.
  check(
    "ключ конфига равен имени пакета в package.json",
    loaded[0].key ===
      JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).name,
  );
}

// ── III. ХУКИ ДУБЛИРУЮТ, И ЭТО ПРОВЕРЯЕТСЯ ОТДЕЛЬНО ────────────────────────────────────────
// Хук, начавший импортировать константы, скомпилируется, запустится и пройдёт сверку значений —
// но нарушит контракт `checkHookImports`, то есть перестанет быть хуком с доказанной
// поверхностью способностей. Значения тут ни при чём, поэтому проверка своя.
{
  const { checkHookImports } = await import("vigiles/hook");
  for (const rel of CARRIERS.filter((c) => c.endsWith(".hook.mjs"))) {
    const offending = checkHookImports(readFileSync(join(ROOT, rel), "utf8"), rel);
    check(
      `${rel} не тянет ничего вне словаря хуков (${offending.join(", ") || "чисто"})`,
      offending.length === 0,
    );
  }
}

// ── IV. ПОЛНОТА СПИСКА: НЕТ ЛИ ШЕСТОГО НОСИТЕЛЯ ────────────────────────────────────────────
// Предмет этой проверки — не значение, а СУЩЕСТВОВАНИЕ файла, о котором список не знает.
{
  const skip = new Set(["node_modules", ".git", "dist", "_build", "fixtures", "repro"]);
  const declares = /^(?:export )?const (?:CONFIG_KEY|DEFAULT_PAPERS_ROOT)\s*=/m;
  const found = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || skip.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(mjs|ts)$/.test(e.name) && !/\.(harness|mutations)\.(mjs|ts)$/.test(e.name)) {
        if (declares.test(readFileSync(p, "utf8"))) found.push(relative(ROOT, p));
      }
    }
  };
  walk(ROOT);
  const unknown = found.filter((f) => !CARRIERS.includes(f));
  check(
    `ни одного объявления вне списка носителей (${unknown.join(", ") || "чисто"})`,
    unknown.length === 0,
  );
  check(
    "и сам поиск не пуст — иначе он ищет не там, а его ноль читается как порядок",
    found.length >= 4,
  );
}

console.log(`✓ ${n} assertions passed — one source for the consumer's config key`);
