/**
 * E2E УСТАНОВКИ: упаковать пакет и поставить его в ЧИСТОГО потребителя каждым доступным
 * менеджером, затем проверить то, что потребитель реально делает.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ПРОГОН, А НЕ ЯЧЕЙКА В `npm test`. Всё, что проверяют 55 харнессов, живёт
 * ВНУТРИ репозитория, где рядом лежит и `node_modules`, и исходники, и конфиг. Потребитель
 * получает другое дерево: тарбол, распакованный менеджером ПО ЕГО ПРАВИЛАМ. Между этими двумя
 * мирами уже разъехалось одно решение — перевод `vigiles` из peer в обычные зависимости
 * работает на npm и НЕ работает на pnpm, потому что проводка хуков адресует рантайм от корня
 * проекта, а pnpm транзитивы в корень не кладёт. Найдено это было не тестом.
 *
 * 🔴 ГЛАВНАЯ ПРОВЕРКА — КОМАНДА ХУКА ВЫПОЛНЯЕТСЯ, А НЕ СОВПАДАЕТ СО СТРОКОЙ. Грепнуть путь в
 * `hooks.json` бесполезно: строка там верна при любом менеджере, а резолвится она или нет —
 * свойство разложенного на диск дерева. Поэтому команда запускается, и вердикт выносится по
 * тому, умерла ли она на `Cannot find module`.
 *
 * Прогон: node scripts/install-e2e.mjs [--keep]
 * Код возврата: 0 — все менеджеры прошли; 1 — хоть один не прошёл.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const KEEP = process.argv.includes("--keep");

const sh = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: "utf8", ...opts });

/** Менеджер считается доступным, только если он реально запускается. */
function managers() {
  const out = [];
  for (const [name, probe, install] of [
    [
      "npm",
      ["npm", ["--version"]],
      (tgz) => ["npm", ["install", "--silent", tgz]],
    ],
    [
      "pnpm",
      ["pnpm", ["--version"]],
      (tgz) => ["pnpm", ["install", "--silent", tgz]],
    ],
  ]) {
    const r = sh(probe[0], probe[1]);
    if (r.status === 0)
      out.push({ name, version: (r.stdout ?? "").trim(), install });
  }
  return out;
}

/** Небольшой, но НАСТОЯЩИЙ корпус: `lint` обязан пройти его начисто. */
function stageCorpus(root) {
  const paper = join(root, "papers", "p1");
  mkdirSync(join(paper, "versions"), { recursive: true });
  writeFileSync(join(paper, "versions", "s.tex"), "abcd");
  writeFileSync(
    join(paper, "versions", "2026-07-22-submitted.pdf"),
    "x".repeat(100),
  );
  writeFileSync(join(paper, "paper.md"), "# Intro\n\nRQ1: does it hold?\n");
  writeFileSync(
    join(paper, "PIPELINE-STATUS.md"),
    `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: 100\n    source: versions/s.tex\n    sourceBytes: 4\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`,
  );
}

/**
 * Команды хуков берутся ИЗ ОПУБЛИКОВАННОГО `hooks.json`, а не из копии в репозитории:
 * проверяем то, что доехало, а не то, что мы отправляли.
 */
function hookCommands(consumer) {
  const file = join(
    consumer,
    "node_modules",
    "research-paper-pipeline",
    "plugin",
    "hooks",
    "hooks.json",
  );
  if (!existsSync(file))
    return { err: `plugin/hooks/hooks.json не доехал в тарболе: ${file}` };
  let json;
  try {
    json = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return { err: `hooks.json не разбирается: ${e.message}` };
  }
  const cmds = [];
  for (const entries of Object.values(json.hooks ?? {}))
    for (const entry of entries ?? [])
      for (const h of entry.hooks ?? []) if (h.command) cmds.push(h.command);
  if (cmds.length === 0)
    return { err: "в hooks.json ноль команд — проверять нечего" };
  return { cmds };
}

const results = [];
// realpathSync — НЕ украшение: на macOS `/var` это симлинк на `/private/var`, и путь,
// записанный до резолва, не совпадает с тем, что вернёт процесс изнутри. Это отдельный
// класс, уже стоивший красного npm test только на macOS (vigiles#241).
const work = realpathSync(mkdtempSync(join(tmpdir(), "rpp-e2e-")));
try {
  const packed = execFileSync(
    "npm",
    ["pack", "--silent", "--pack-destination", work],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  )
    .trim()
    .split("\n")
    .pop();
  const tgz = join(work, packed);
  if (!existsSync(tgz)) throw new Error(`npm pack не оставил тарбол: ${tgz}`);
  console.log(`тарбол: ${packed}\n`);

  const mgrs = managers();
  if (mgrs.length === 0)
    throw new Error("ни одного менеджера пакетов не запускается");

  for (const m of mgrs) {
    const consumer = join(work, `consumer-${m.name}`);
    mkdirSync(consumer, { recursive: true });
    writeFileSync(
      join(consumer, "package.json"),
      '{"name":"c","version":"1.0.0","private":true}',
    );
    const fail = [];
    const ok = (label) => console.log(`  ✓ ${label}`);
    const bad = (label, detail) => {
      fail.push(label);
      console.log(
        `  ✗ ${label}${detail ? `\n      ${String(detail).trim().split("\n").slice(0, 3).join("\n      ")}` : ""}`,
      );
    };

    console.log(`── ${m.name} ${m.version}`);
    const [cmd, args] = m.install(tgz);
    const inst = sh(cmd, args, { cwd: consumer });
    if (inst.status === 0) ok("установка прошла");
    else bad("установка прошла", inst.stderr || inst.stdout);

    // 🔴 БИН ЗАПУСКАЕТСЯ НАПРЯМУЮ, А НЕ ЧЕРЕЗ `node <путь>`. У npm в `.bin` лежит СИМЛИНК на
    // `.mjs`, и `node` его проглатывает; у pnpm там SHELL-ОБЁРТКА, и `node` давится на первой
    // же строке `basedir=$(dirname …)`. Первая редакция этого теста звала `node bin` и
    // отрапортовала три ложных падения на pnpm — то есть измеряла мой способ запуска, а не
    // пакет. Потребитель зовёт `npx rpp`, что исполняет файл, а не скармливает его ноде.
    const bin = join(consumer, "node_modules", ".bin", "rpp");
    const help = sh(bin, ["--help"], { cwd: consumer });
    help.status === 0
      ? ok("`rpp --help` отвечает нулём")
      : bad("`rpp --help` отвечает нулём", help.stderr);

    const init = sh(bin, ["init"], { cwd: consumer });
    existsSync(join(consumer, "rpp.json"))
      ? ok("`rpp init` написал rpp.json")
      : bad("`rpp init` написал rpp.json", init.stderr);

    stageCorpus(consumer);
    const lint = sh(bin, ["lint"], { cwd: consumer });
    lint.status === 0 && /no findings/.test(lint.stdout ?? "")
      ? ok("`rpp lint` прошёл корпус начисто")
      : bad(
          "`rpp lint` прошёл корпус начисто",
          (lint.stdout ?? "") + (lint.stderr ?? ""),
        );

    // 🔴 Несущая проверка: команды ВЫПОЛНЯЮТСЯ.
    const { cmds, err } = hookCommands(consumer);
    if (err) bad("hooks.json доехал и разбирается", err);
    else {
      let resolved = 0;
      for (const command of cmds) {
        const r = sh("bash", ["-c", command], {
          cwd: consumer,
          input: "{}",
          env: { ...process.env, CLAUDE_PROJECT_DIR: consumer },
        });
        const out = (r.stderr ?? "") + (r.stdout ?? "");
        // Код возврата не судим: страж вправе вернуть 2 по существу. Судим РЕЗОЛВ.
        if (
          // 🔴 `is NOT running` В СПИСКЕ — НЕСУЩЕЕ. Первая редакция искала только
          // `Cannot find module`, а `rpp hook` при нерезолвящемся рантайме ловит исключение
          // и жалуется ДРУГИМИ словами, возвращая 0 — и тест напечатал «все 3 команды
          // резолвятся» при полностью неработающих хуках. Ложный зелёный ровно того класса,
          // ради которого тест и написан: проверка искала написание, которое ПОМНИЛА, а не
          // саму вещь.
          /Cannot find module|MODULE_NOT_FOUND|No such file or directory|is NOT running/.test(
            out,
          )
        )
          bad(
            `команда хука резолвится (${cmds.indexOf(command) + 1}/${cmds.length})`,
            out,
          );
        else resolved++;
      }
      if (resolved === cmds.length)
        ok(`все ${cmds.length} команд(ы) хуков резолвятся`);
    }

    results.push({ manager: `${m.name} ${m.version}`, fail });
    console.log("");
  }
} finally {
  if (KEEP) console.log(`(--keep) дерево осталось: ${work}`);
  else rmSync(work, { recursive: true, force: true });
}

console.log("── итог");
let red = 0;
for (const r of results) {
  if (r.fail.length === 0) console.log(`  ✅ ${r.manager}`);
  else {
    red++;
    console.log(`  🔴 ${r.manager} — не прошло: ${r.fail.join(" · ")}`);
  }
}
process.exit(red > 0 ? 1 : 0);
