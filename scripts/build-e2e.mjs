#!/usr/bin/env node
/**
 * build-e2e.mjs — `rpp build` против НАСТОЯЩЕЙ `pdflatex`, от исходника до готового PDF.
 *
 * 🔴 ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ `src/build.harness.mjs`, И ПОЧЕМУ НУЖНЫ ОБА. Тот харнесс подставляет
 * вместо `spawnSync` свою функцию: он проверяет РЕШЕНИЯ — какой скрипт выбран, каким
 * интерпретатором, что вернулось при ненулевом коде. Ни один его ассерт не может сказать, что
 * на выходе получился PDF, и тем более — КАКОЙ. Здесь вторая половина: скрипт запускается
 * по-настоящему, и результат меряется инструментом, а не доверием.
 *
 * 🔴 ЧТО ИМЕННО ЭТО ЛОВИТ, И ЭТО НЕ ГИПОТЕЗА. `acmart.cls` проверяет наличие `libertine.sty`,
 * `zi4.sty` и `newtxmath.sty`; не найдя ЛЮБОЙ из них, он выставляет `\@ACM@newfontsfalse` и
 * тихо набирает статью Computer Modern. Сборка при этом ЗЕЛЁНАЯ, PDF выглядит нормальным, а
 * метрика другая — значит другая пагинация. Так уехала ОТПРАВЛЕННАЯ `aisec-2026`. Зелёный код
 * возврата про это не говорит ничего: отказ живёт в содержимом артефакта, поэтому и меряется
 * содержимое.
 *
 * 🔴 ОТСУТСТВИЕ TeX — ОБЪЯВЛЕННЫЙ ПРОПУСК, А НЕ ТИХИЙ. У участника без TeX Live этот прогон
 * законно невозможен, и он выходит нулём — СКАЗАВ об этом. В CI то же отсутствие означает
 * сломанное окружение, и `--strict` превращает пропуск в отказ: пропущенный шаг и прошедший
 * выглядят в интерфейсе одинаково, а это ровно тот класс, против которого написан весь пакет.
 *
 *   node scripts/build-e2e.mjs [--strict]
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  rmSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFonts } from "../skills/render-paper/extract-pdf-facts.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, "bin", "rpp.mjs");
const strict = process.argv.includes("--strict");

/**
 * Начертания, которыми `acmart` набирает статью, когда его шрифты НА МЕСТЕ. Список — из
 * замера на живом TeX Live 2023, а не из документации класса: `pdffonts` показывает
 * `LinLibertineT` (текст), `LinBiolinumTB` (заголовки), `LinLibertineTB` (жирный текст).
 */
const ACMART_FAMILIES = /^(LinLibertine|LinBiolinum)/;
/** Подпись молчаливой подмены: класс ушёл на шрифты по умолчанию. */
const FALLBACK_FAMILIES = /^(CMR|CMBX|CMTI|CMTT|CMSS|LMRoman)/;

const missing = ["pdflatex", "pdffonts"].filter(
  (b) => spawnSync("command", ["-v", b], { shell: true, stdio: "ignore" }).status !== 0,
);
if (missing.length) {
  const say = `build-e2e: пропущено — на машине нет ${missing.join(", ")}.`;
  if (!strict) {
    console.log(`${say}\nЭто законный пропуск для клона без TeX Live. В CI тот же случай — отказ (--strict).`);
    process.exit(0);
  }
  console.error(`${say}\nВ --strict это ОТКАЗ: в CI отсутствие инструмента есть поломка окружения,\nа пропущенная проверка неотличима от прошедшей.`);
  process.exit(2);
}

const fonts = (pdf) =>
  readFonts(execFileSync("pdffonts", [pdf], { encoding: "utf8" })).map((f) => f.name);

let bad = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail && !cond ? ` — ${detail}` : ""}`);
  if (!cond) bad++;
};

// Фикстуры копируются: сборка оставляет `paper.pdf`, `paper.aux` и `build.log` рядом с
// исходником, и в рабочем дереве это были бы неотслеживаемые файлы после каждого прогона.
const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-build-e2e-")));
try {
  cpSync(join(ROOT, "fixtures", "build-e2e"), join(work, "papers"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  // `--all` берёт каталог статей из конфига, а не из аргумента: охват называет ПОТРЕБИТЕЛЬ,
  // и это тот же контракт, из-за которого у `lint` нет умолчания ".".
  writeFileSync(join(work, "rpp.json"), JSON.stringify({ papers: "papers" }, null, 2));

  const r = spawnSync(process.execPath, [CLI, "build", "--all"], {
    cwd: work,
    encoding: "utf8",
  });
  const out = (r.stdout || "") + (r.stderr || "");
  console.log(out.trim().split("\n").map((l) => `  │ ${l}`).join("\n"));
  console.log();

  console.log("сборка на настоящем pdflatex");
  const acmartPdf = join(work, "papers", "acmart", "paper.pdf");
  check("acmart: PDF существует", existsSync(acmartPdf));
  if (existsSync(acmartPdf)) {
    const f = fonts(acmartPdf);
    check(
      "acmart: набрано СОБСТВЕННЫМИ шрифтами класса",
      f.length > 0 && f.every((n) => ACMART_FAMILIES.test(n)),
      f.join(", "),
    );
    check(
      "🔴 acmart: и НИ ОДНОГО шрифта молчаливой подмены",
      !f.some((n) => FALLBACK_FAMILIES.test(n)),
      f.join(", "),
    );
  }

  console.log();
  console.log("проверка шрифтов умеет краснеть");
  const fallbackPdf = join(work, "papers", "fallback", "paper.pdf");
  check("подменённый PDF тоже собрался — отказ не в сборке", existsSync(fallbackPdf));
  if (existsSync(fallbackPdf)) {
    const f = fonts(fallbackPdf);
    check(
      "и он ОТВЕРГНУТ проверкой шрифтов, хотя сборка была зелёной",
      f.some((n) => FALLBACK_FAMILIES.test(n)) && !f.every((n) => ACMART_FAMILIES.test(n)),
      f.join(", "),
    );
  }

  console.log();
  console.log("остальные исходы команды");
  check("упавшая сборка названа упавшей, с кодом", /✗ .*broken/.test(out) && /\b3\b/.test(out));
  check("статья без скрипта названа отдельно", /no-script|НЕТ скрипта/i.test(out));
  check("и прогон в целом — ОТКАЗ, раз две статьи из четырёх не собрались", r.status !== 0);
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log();
console.log(bad === 0 ? "✅ build e2e: всё сошлось" : `🔴 build e2e: ${bad} расхождений`);
process.exit(bad === 0 ? 0 : 1);
