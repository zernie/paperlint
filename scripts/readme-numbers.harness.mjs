/**
 * Обе половины для `check:readme`, и третья, без которой проверка чисел бессмысленна: она сама
 * обязана уметь СЧИТАТЬ ВЕРНО.
 *
 * 🔴 Два бага этого скрипта были пойманы не глазом, а расхождением с независимыми командами, и
 * оба закреплены здесь ассертами:
 *   1. счёт правил принимал только форму `{ rules: {…} }` и МОЛЧА записывал `tex-build.mjs`
 *      (правила прямо в `default`) в «не плагин» — уверенное 8 вместо 10;
 *   2. обход дерева шёл `statSync`, то есть ПО СИМЛИНКАМ, и 24 ссылки `.claude/skills/*` →
 *      `skills/*` дали 83 харнесса вместо 49.
 * Оба — «счётчик, который считает то, что игнорирует»: пропуск ничего не обещает, счётчик обещает.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { countFiles, countRules, declaredCounts, actualCounts } = await import(
  join(HERE, "readme-numbers.mjs")
);

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

// ── пометки в прозе ─────────────────────────────────────────────────────────────────────
const d = declaredCounts("текст <!-- count:rules -->10 и ещё <!--count:skills-->24 хвост");
check("пометки читаются, пробелы внутри не обязательны", d.rules === 10 && d.skills === 24);
// Число СЛОВОМ сравнить нечем — ровно из-за этого README и разъехался. Ассерт фиксирует, что
// такая форма НЕ считается объявлением.
check("число словом объявлением не считается",
      Object.keys(declaredCounts("Forty-five of those.")).length === 0);
check("текст без пометок даёт пустой набор — CLI на этом выходит с кодом 1",
      Object.keys(declaredCounts("# README\n\nникаких чисел")).length === 0);

// ── обход дерева не идёт по симлинкам ───────────────────────────────────────────────────
{
  // 🔴 `realpathSync` вокруг `mkdtempSync`: на macOS `/var` сам симлинк на `/private/var`, и без
  // этого сравнение путей ловит два написания одного каталога. Этот класс уже стоит отдельным
  // issue (#9) на трёх харнессах репозитория — здесь он не воспроизводится намеренно.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "readme-nums-")));
  try {
    mkdirSync(join(root, "real"), { recursive: true });
    writeFileSync(join(root, "real", "a.harness.mjs"), "");
    writeFileSync(join(root, "real", "b.harness.mjs"), "");
    check("считает настоящие файлы", countFiles(root, ".harness.mjs") === 2);

    symlinkSync(join(root, "real"), join(root, "mirror"), "dir");
    check("СИМЛИНК на каталог не удваивает счёт — это не новый каталог",
          countFiles(root, ".harness.mjs") === 2);

    // 🔴 ВТОРОЙ вид ссылки, и его здесь не было — поймала мутация, а не я. Ссылка на КАТАЛОГ
    // отсекается уже тем, что `lstat` не считает её каталогом; отдельный страж
    // `isSymbolicLink()` нужен ради ссылки на ФАЙЛ с подходящим суффиксом — она прошла бы
    // проверку `endsWith` и удвоила счёт. Без этого ассерта страж выглядел бы мёртвым кодом.
    symlinkSync(join(root, "real", "a.harness.mjs"), join(root, "link.harness.mjs"));
    check("СИМЛИНК на файл-харнесс тоже не удваивает счёт",
          countFiles(root, ".harness.mjs") === 2);

    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "node_modules", "pkg", "c.harness.mjs"), "");
    check("node_modules не считается", countFiles(root, ".harness.mjs") === 2);

    // Драйвер `run-mutations.mjs` кончается на `mutations.mjs`, но батареей не является:
    // суффикс проверяется С ТОЧКОЙ. Именно на этом ошибался `git grep`, давая 27 вместо 26.
    writeFileSync(join(root, "real", "run-mutations.mjs"), "");
    writeFileSync(join(root, "real", "x.mutations.mjs"), "");
    check("`run-mutations.mjs` не батарея — суффикс требует точку",
          countFiles(root, ".mutations.mjs") === 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── счёт правил принимает обе формы и НЕ молчит о третьей ───────────────────────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "readme-rules-")));
  try {
    const dir = join(root, "eslint-rules");
    mkdirSync(dir, { recursive: true });
    const rule = '{ meta: { schema: [] }, create() { return {}; } }';
    writeFileSync(join(dir, "plugin-shape.mjs"), `export default { rules: { a: ${rule}, b: ${rule} } };`);
    writeFileSync(join(dir, "bare-shape.mjs"), `export default { c: ${rule} };`);
    check("обе формы экспорта считаются — плагин и голые правила",
          (await countRules(root)) === 3);

    // Третья форма — та, на которой скрипт уже ошибся молча. Теперь это ОШИБКА.
    writeFileSync(join(dir, "helpers.mjs"), "export const helper = () => 1;");
    let threw = null;
    try { await countRules(root); } catch (e) { threw = e; }
    check("модуль неизвестной формы — ОШИБКА, а не тихий пропуск", threw !== null);
    check("и ошибка НАЗЫВАЕТ файл, а не жалуется вообще",
          threw && /helpers\.mjs/.test(threw.message));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── на живом дереве числа положительны и правдоподобны ──────────────────────────────────
const live = await actualCounts();
check("на живом дереве все четыре счётчика больше нуля",
      Object.values(live).every((v) => Number.isInteger(v) && v > 0));

console.log(`✓ ${String(n)} assertions passed — check:readme, числа производятся, а не пишутся`);
