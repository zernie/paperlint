/**
 * Обе половины для `rpp doctor` — команды, чей предмет СОСТОЯНИЕ УСТАНОВКИ, а не файл.
 *
 * 🔴 ПОЧЕМУ У НЕЁ ОСОБЕННО ВАЖЕН ТЕСТ. Doctor существует ровно потому, что `paper-edit-guard`
 * не умеет сказать «я сторожу пустоту»: молчание — его успех. Сломанный doctor обладает ровно
 * тем же свойством — он напечатает бодрый список галочек и не заметит расхождения. То есть
 * проверка на тихий отказ сама отказывает тихо, и отличить одно от другого может только этот
 * файл.
 *
 * Прогон:   npx vigiles test src/doctor.harness.mjs
 * Убивается: src/doctor.mutations.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { doctor, detectPapers, PROGRAMS, found } = await import(join(HERE, "doctor.ts"));
const { papersRoot } = await import(
  join(HERE, "..", "hooks", "paper-edit-guard.hook.mjs")
);

let n = 0;
const check = (label, cond) => {
  n++;
  assert.ok(cond, label);
};

/** Потребитель на диске: каталог статей, объявления в одном или обоих местах. */
function consumer({ papersDir, pkgKey, rppJson, makeDir = true }) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rpp-doctor-")));
  if (makeDir && papersDir) {
    mkdirSync(join(dir, papersDir, "some-paper"), { recursive: true });
    writeFileSync(join(dir, papersDir, "some-paper", "PIPELINE-STATUS.md"), "# s\n");
  }
  const pkg = { name: "consumer", version: "1.0.0" };
  if (pkgKey !== undefined) pkg["research-paper-pipeline"] = { papers: pkgKey };
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  if (rppJson !== undefined)
    writeFileSync(join(dir, "rpp.json"), JSON.stringify({ papers: rppJson }, null, 2));
  return dir;
}

/** Запуск doctor в памяти: весь вывод собирается, программы подменяются, чтобы не зависеть от машины. */
const runDoctor = (dir, { cliPapers = null, have = () => 0 } = {}) => {
  const lines = [];
  const code = doctor({
    log: (...a) => lines.push(a.join(" ")),
    cwd: dir,
    projectDir: dir,
    cliPapers,
    run: (_bin, _args) => ({ status: have(_args?.[1]) }),
  });
  return { code, out: lines.join("\n") };
};

// ── I. СОГЛАСОВАННАЯ УСТАНОВКА МОЛЧИТ ───────────────────────────────────────────────────────
{
  const dir = consumer({ papersDir: "papers", pkgKey: "papers" });
  const r = runDoctor(dir, { cliPapers: "papers" });
  check("согласованная установка — выход НОЛЬ", r.code === 0);
  check(
    "и сказано прямо, что линтуется то же, что сторожится",
    /the same directory/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── II. ТОТ САМЫЙ ДЕФЕКТ: УСТАНОВКА ПО ДОКУМЕНТАЦИИ ─────────────────────────────────────────
// `rpp init` пишет rpp.json и не трогает package.json; хук читает package.json. Замер 18.09.
{
  const dir = consumer({ papersDir: "writing/drafts", rppJson: "writing/drafts" });
  const r = runDoctor(dir, { cliPapers: "writing/drafts" });
  check("установка по документации — ОТКАЗ, а не бодрый отчёт", r.code === 2);
  check(
    "и названы ОБА каталога, чтобы расхождение было видно, а не выведено",
    /will lint\s+writing\/drafts/.test(r.out) && /will guard\s+papers/.test(r.out),
  );
  check(
    "🔴 и сказано ПОСЛЕДСТВИЕ: записи проходят мимо сторожа",
    /passes the guard unseen/.test(r.out),
  );
  check(
    "каталог, которого нет, назван пустым сторожем",
    /watching nothing/.test(r.out),
  );
  check(
    "и подсказано, где статьи ЛЕЖАТ на самом деле — измерено, а не угадано",
    /papers look like they live in: writing\/drafts/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── II-бис. ПРОПАВШАЯ ДЕКЛАРАЦИЯ, КОТОРАЯ ПОКА НЕ ВРЕДИТ ───────────────────────────────────
// Статьи лежат ровно там, куда указывает умолчание хука. Установка РАБОТАЕТ — по совпадению.
// Падать тут нельзя (ложное срабатывание уровня error дороже пропуска), но и молчать нельзя.
{
  const dir = consumer({ papersDir: "papers", rppJson: "papers" });
  const r = runDoctor(dir, { cliPapers: "papers" });
  check("работающая по совпадению установка НЕ валится", r.code === 0);
  check(
    "но пропавшая декларация НАЗВАНА, а не пропущена",
    /⚠ package\.json has no "research-paper-pipeline"/.test(r.out),
  );
  check(
    "и сказано, чем именно это опасно — работает, пока каталог не переедет",
    /works only while your papers happen to live there/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── III. ДВЕ ДЕКЛАРАЦИИ РАЗЪЕХАЛИСЬ ─────────────────────────────────────────────────────────
{
  const dir = consumer({ papersDir: "writing/drafts", pkgKey: "papers", rppJson: "writing/drafts" });
  mkdirSync(join(dir, "papers"), { recursive: true });
  const r = runDoctor(dir, { cliPapers: "writing/drafts" });
  check("обе декларации на месте, но разные — ОТКАЗ", r.code === 2);
  check("⚠ про устаревший rpp.json сказано", /rpp\.json is present/.test(r.out));
  rmSync(dir, { recursive: true, force: true });
}

// ── IV. КОРЕНЬ БЕРЁТСЯ У САМОГО ХУКА, А НЕ ПЕРЕСКАЗЫВАЕТСЯ ─────────────────────────────────
// Это несущее: копия логики разошлась бы молча и печатала бы уверенный неверный ответ.
{
  const dir = consumer({ papersDir: "docs/papers", pkgKey: "docs/papers/" });
  const r = runDoctor(dir, { cliPapers: "docs/papers" });
  const fromHook = papersRoot(
    JSON.stringify({ "research-paper-pipeline": { papers: "docs/papers/" } }),
  );
  check("хук сам срезает хвостовой слеш", fromHook === "docs/papers");
  check(
    "и doctor печатает РОВНО то, что вернул хук, а не своё прочтение",
    new RegExp(`will guard\\s+${fromHook}$`, "m").test(r.out),
  );
  check("хвостовой слеш не делает установку расходящейся", r.code === 0);
  rmSync(dir, { recursive: true, force: true });
}

// ── V. ОТКАЗ ХУКА ПЕРЕДАЁТСЯ, А НЕ ПРЕВРАЩАЕТСЯ В КАТАЛОГ ──────────────────────────────────
{
  const dir = consumer({ papersDir: "papers", pkgKey: "" });
  const r = runDoctor(dir, { cliPapers: "papers" });
  check(
    "пустая строка в декларации — хук отказывает, и doctor это НАЗЫВАЕТ",
    /the guard refuses/.test(r.out),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── VI. ВНЕШНИЕ ПРОГРАММЫ — ФАКТ, А НЕ ВЕРДИКТ ─────────────────────────────────────────────
{
  const dir = consumer({ papersDir: "papers", pkgKey: "papers" });
  const none = runDoctor(dir, { cliPapers: "papers", have: () => 1 });
  check(
    "🔴 отсутствующий tex НЕ валит прогон — гейт на совете глушат целиком",
    none.code === 0,
  );
  check("но каждая пропажа НАЗВАНА", /✗ pdflatex/.test(none.out));
  check(
    "и несёт ЛЕКАРСТВО, а не только диагноз",
    /apt-get install -y texlive-latex-recommended/.test(none.out),
  );
  check(
    "и последствие: без чего какие проверки молча не идут",
    /nothing else spell-checks the text/.test(none.out),
  );
  check("список программ ОБЪЯВЛЕН, а не зашит в печать", PROGRAMS.length >= 7);
  rmSync(dir, { recursive: true, force: true });
}

// ── VII. ОБНАРУЖЕНИЕ КАТАЛОГА СТАТЕЙ ───────────────────────────────────────────────────────
{
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rpp-detect-")));
  mkdirSync(join(dir, "writing", "drafts", "p1"), { recursive: true });
  writeFileSync(join(dir, "writing", "drafts", "p1", "paper.tex"), "x");
  mkdirSync(join(dir, "node_modules", "pkg", "papers", "p"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "pkg", "papers", "p", "paper.tex"), "x");
  const hits = detectPapers(dir);
  check("находит корень по маркеру внутри подкаталога", hits.includes("writing/drafts"));
  check(
    "🔴 и это КОРЕНЬ, а не сама статья — иначе конфиг указал бы на один документ",
    !hits.includes("writing/drafts/p1"),
  );
  check(
    "node_modules не обыскивается — чужие статьи не наши",
    !hits.some((h) => h.startsWith("node_modules")),
  );
  rmSync(dir, { recursive: true, force: true });
}

// ── VIII. `found` СПРАШИВАЕТ СИСТЕМУ, А НЕ УГАДЫВАЕТ ПО ИМЕНИ ──────────────────────────────
{
  check("реально существующая программа найдена", found("node") === true);
  check(
    "выдуманная — нет (иначе проверка отвечает на форму, а не на предмет)",
    found("rpp-definitely-not-a-real-binary-xyz") === false,
  );
}

console.log(`✓ ${n} assertions passed — rpp doctor, установка отвечает за себя сама`);
