/**
 * Обе половины для утилиты `research-paper-pipeline check`, и отдельно — три отказа, каждый из
 * которых обязан быть ОБЪЯСНИМЫМ, а не просто ненулевым.
 *
 * 🔴 Два из проверяемых здесь дефектов утилита уже имела, и оба нашлись ПЕРВЫМ ЖЕ прогоном,
 * а не чтением:
 *   1. `rpp --help` отвечало «unknown command `--help`» — argv[0] становился командой
 *      безусловно;
 *   2. на пустом наборе ESLint БРОСАЕТ `NoFilesFoundError`, и сторож от зелёного ноля до своей
 *      проверки не доживал: вместо сообщения вылетал стек из недр eslint-helpers.
 * Оба закреплены ассертами ниже, чтобы вернуться назад было нельзя.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { run, parseArgs, buildConfig } = await import(join(HERE, "rpp.mjs"));

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

/** Прогон утилиты с перехватом вывода — тише и быстрее, чем поднимать процесс. */
async function cli(args, cwd) {
  const out = [];
  const prev = process.cwd();
  if (cwd) process.chdir(cwd);
  try {
    const code = await run(args, { log: (...a) => out.push(a.join(" ")), err: (...a) => out.push(a.join(" ")) });
    return { code, out: out.join("\n") };
  } finally {
    process.chdir(prev);
  }
}

// ── разбор аргументов ───────────────────────────────────────────────────────────────────
check("`--help` первым аргументом — это ФЛАГ, а не команда", parseArgs(["--help"]).help === true);
check("и команда при этом не выдумывается", parseArgs(["--help"]).cmd === null);
check("путь и опции разбираются", (() => {
  const a = parseArgs(["check", "papers", "--options", "o.json", "--json"]);
  return a.cmd === "check" && a.paths[0] === "papers" && a.options === "o.json" && a.json === true;
})());

// ── конфиг собирается, и данные потребителя доезжают ────────────────────────────────────
{
  const cfg = buildConfig({ typographyDebt: { x: { sectionSign: 3 } }, authorListCommand: "run-me" }, null);
  check("без языка LaTeX конфиг всё равно собирается — корпус без .tex не повод отказывать",
        Array.isArray(cfg) && cfg.length === 3);
  check("с языком LaTeX добавляется четвёртый блок", buildConfig({}, {}).length === 4);
  const status = cfg.find((c) => c.files.some((f) => f.includes("PIPELINE-STATUS")));
  check("команда из опций доезжает до правила",
        status.rules["paper/author-list"][1].command === "run-me");
}

// ── отказы обязаны быть ОБЪЯСНИМЫМИ ─────────────────────────────────────────────────────
{
  const r = await cli(["--help"]);
  check("`--help` печатает usage и выходит нулём", r.code === 0 && /npx research-paper-pipeline check/.test(r.out));
}
{
  const r = await cli(["frobnicate"]);
  check("неизвестная команда НАЗЫВАЕТСЯ", r.code === 2 && /unknown command `frobnicate`/.test(r.out));
}
{
  const r = await cli(["check"]);
  // Умолчание "." дало бы зелёный прогон по случайному содержимому — тот же контракт, что у
  // экшена, и та же причина.
  check("`check` без пути отказывает и говорит, чего не хватает",
        r.code === 2 && /needs at least one path/.test(r.out));
}

// ── на живых файлах: обе половины ───────────────────────────────────────────────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-cli-")));
  try {
    const paper = join(root, "papers", "p1");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(join(paper, "versions", "2026-07-22-submitted.pdf"), "x".repeat(100));
    const status = (bytes) =>
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: ${bytes}\n    source: versions/s.tex\n    sourceBytes: 4\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`;
    writeFileSync(join(paper, "versions", "s.tex"), "abcd");
    writeFileSync(join(paper, "paper.md"), "# Intro\n\nRQ1: does it hold?\n");

    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(100));
    const clean = await cli(["check", "papers"], root);
    check("на чистом корпусе — ноль и внятный отчёт", clean.code === 0 && /no findings/.test(clean.out));

    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(999));
    const dirty = await cli(["check", "papers"], root);
    check("подложенное расхождение байтов — находка и код 1", dirty.code === 1);
    check("и находка называет ОБА числа", /999/.test(dirty.out) && /100/.test(dirty.out));

    const json = await cli(["check", "papers", "--json"], root);
    check("`--json` отдаёт разбираемый JSON", (() => {
      try { return Array.isArray(JSON.parse(json.out)); } catch { return false; }
    })());

    // 🔴 Сторож от зелёного ноля: ESLint бросает на пустом наборе, и до починки здесь вылетал
    // стек вместо объяснения.
    mkdirSync(join(root, "nothing"), { recursive: true });
    const empty = await cli(["check", "nothing"], root);
    check("пустой набор — ОТКАЗ, а не зелёный ноль", empty.code === 1);
    check("и отказ объясняет, что именно не нашлось",
          /nothing was linted/.test(empty.out) && /not a clean report/.test(empty.out));

    writeFileSync(join(root, "bad.json"), "{ not json");
    const bad = await cli(["check", "papers", "--options", "bad.json"], root);
    check("битый файл опций НАЗЫВАЕТСЯ, а не роняет стек",
          bad.code === 2 && /not valid JSON/.test(bad.out));

    const noFile = await cli(["check", "papers", "--options", "nope.json"], root);
    check("отсутствующий файл опций тоже назван",
          noFile.code === 2 && /options file not found/.test(noFile.out));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(`✓ ${String(n)} assertions passed — rpp check, одна команда вместо конфига руками`);
