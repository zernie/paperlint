/**
 * `runMutations` — три исхода харнесса, а не два.
 *
 * ── ПОЧЕМУ ЭТОТ ФАЙЛ ПОЯВИЛСЯ ПОСЛЕДНИМ, А НЕ ПЕРВЫМ ────────────────────────────
 * Движок, выносящий вердикт ВСЕМ батареям репозитория, до 2026-09-15 не проверялся
 * ничем. Каждая его защита (путь харнесса в никуда · мутация-пустышка · повтор
 * не-убийства · базовая линия красных) написана ПОСЛЕ того, как поймала настоящий
 * дефект, и ни одна не имела теста. Поэтому следующий дефект того же класса приехал
 * в CI и был прочитан как «две мутации выжили».
 *
 * Здесь закреплён третий исход — SKIP. Фикстуры настоящие: харнесс-пропуск зовёт
 * `skip()` ИЗ vigiles, а не изображает её кодом 77 руками, иначе тест проверял бы
 * моё представление о протоколе вместо протокола.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { runMutations } from "./mutation-driver.mjs";

// Фикстура живёт во временном каталоге, где `node` не найдёт `vigiles` подъёмом по
// дереву. Спецификатор резолвится ЗДЕСЬ, резолвером самой ноды, и подставляется
// абсолютным — так пропуск делает настоящая `skip()`, а не её имитация кодом 77.
// Имитация проверяла бы моё представление о протоколе вместо протокола.
const VIGILES = pathToFileURL(createRequire(import.meta.url).resolve("vigiles")).href;

const SUBJECT = "export const MARKER = 'keep-me';\n";
const cases = [];

/** Временный корень: фикстурный предмет + харнесс, который о нём судит. */
function fixture(harnessBody) {
  const root = mkdtempSync(join(tmpdir(), "mutdrv-"));
  const subject = join(root, "subject.mjs");
  const harness = join(root, "probe.harness.mjs");
  writeFileSync(subject, SUBJECT);
  writeFileSync(harness, harnessBody(subject));
  return { root, subject, harness };
}

const quiet = { log: console.log, error: console.error };
/** Вердикт читается по коду возврата и выводу, поэтому вывод драйвера перехватывается. */
function silently(fn) {
  const lines = [];
  console.log = console.error = (...a) => lines.push(a.join(" "));
  try {
    return { code: fn(), out: lines.join("\n") };
  } finally {
    console.log = quiet.log;
    console.error = quiet.error;
  }
}

// ── 1. ХАРНЕСС ПРОПУСКАЕТСЯ ⇒ батарея ОТКАЗЫВАЕТСЯ, а не объявляет мутацию выжившей.
// Наблюдённый отказ (прогон 34966606186): в CI не было бинаря `claude`, харнесс
// пропускался, `vigiles test` отдавал 0, и драйвер печатал «🔴 SURVIVED» — утверждение
// о ТЕСТЕ, которое на деле было утверждением о СРЕДЕ.
{
  const { root, subject, harness } = fixture(
    () => `import { skip } from ${JSON.stringify(VIGILES)};\nskip("fixture: the capability this tier observes is absent");\n`,
  );
  try {
    const before = readFileSync(subject, "utf8");
    const { code, out } = silently(() =>
      runMutations({
        root,
        runner: "node",
        cases: [{ name: "marker removed", harness, expect: "MARKER", disables: "фикстура", edits: [[subject, "keep-me", "gone"]] }],
      }),
    );
    assert.equal(code, 2, `пропуск обязан ОТКАЗЫВАТЬ, а не судить; получено ${code}\n${out}`);
    assert.doesNotMatch(out, /SURVIVED/, "и не заявлять выжившую мутацию — это ложный диагноз");
    assert.match(out, /SKIP on clean source/, "отказ обязан называть причину");
    assert.match(out, /probe\.harness\.mjs/, "и называть, КАКОЙ харнесс пропускается");
    assert.equal(
      readFileSync(subject, "utf8"), before,
      "отказ обязан случиться ДО правки файлов — сообщение приходит с чистым деревом",
    );
    cases.push("харнесс пропускается → отказ до правки файлов, без вердикта о мутации");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── 2. ХАРНЕСС РАБОТАЕТ ⇒ прежнее поведение цело. Без этой половины первая
// неотличима от движка, который отказывается всегда.
{
  const { root, subject, harness } = fixture(
    (s) => `import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nassert.match(readFileSync(${JSON.stringify(s)}, "utf8"), /keep-me/, "MARKER пропал");\n`,
  );
  try {
    const { code, out } = silently(() =>
      runMutations({
        root,
        runner: "node",
        cases: [{ name: "marker removed", harness, expect: "MARKER пропал", disables: "фикстура", edits: [[subject, "keep-me", "gone"]] }],
      }),
    );
    assert.equal(code, 0, `рабочий харнесс обязан убить мутацию; получено ${code}\n${out}`);
    assert.match(out, /RED \(expected case\)/, "и убить её СВОИМ сообщением, а не любым покраснением");
    assert.equal(readFileSync(subject, "utf8"), SUBJECT, "исходник обязан быть восстановлен");
    cases.push("харнесс работает → мутация убита своим ассертом, исходник восстановлен");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(`mutation-driver: ${cases.length} исход(а) закреплены:`);
for (const c of cases) console.log(`  ok  ${c}`);
