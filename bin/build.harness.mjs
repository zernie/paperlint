/**
 * Обе половины для `build.mjs` — модуля, который решает, ЧЕМ собирается статья.
 *
 * 🔴 ГЛАВНОЕ, ЧТО ЗДЕСЬ ЗАКРЕПЛЕНО: «скрипта нет» — это ОТКАЗ, а не пропуск. Именно
 * неразличение этих двух случаев и стоило корпусу тихой дыры: цикл в CI искал
 * `repro/build-submission.sh`, у принятой статьи лежал `build.sh`, и «не нашли, чем собирать»
 * выглядело как «нечего собирать» — зелёный прогон над статьёй, которую не проверил никто.
 */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const {
  BUILD_SCRIPTS,
  findBuildScript,
  interpreterFor,
  buildPaper,
  papersIn,
  formatResults,
  anyFailed,
  remedyFor,
} = await import(join(HERE, "build.mjs"));

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-build-")));
const paper = (name, files) => {
  const dir = join(root, "papers", name);
  mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
};

try {
  const top = paper("top", {
    "PIPELINE-STATUS.md": "x",
    "build.sh": "#!/usr/bin/env bash\ntouch RAN\n",
  });
  const nested = paper("nested", {
    "paper.tex": "x",
    "repro/build-submission.sh": "#!/usr/bin/env bash\nexit 0\n",
  });
  const both = paper("both", {
    "venue.json": "{}",
    "build.sh": "#!/usr/bin/env bash\nexit 0\n",
    "repro/build-submission.sh": "#!/usr/bin/env bash\nexit 0\n",
  });
  const bare = paper("bare", { "paper.md": "# x" });
  paper("not-a-paper", { "NOTES.md": "x" });
  // Скрытый каталог с настоящим маркером: без него мутация «считать скрытые статьями» выживает,
  // то есть проверка отсутствует ровно там, где выглядит присутствующей.
  paper(".hidden-paper", { "PIPELINE-STATUS.md": "x" });

  // ── поиск скрипта ────────────────────────────────────────────────────────────────────
  check(
    "находит build.sh в корне статьи",
    findBuildScript(top)?.rel === "build.sh",
  );
  check(
    "находит repro/build-submission.sh — ВТОРУЮ конвенцию, из-за расхождения с которой всё и началось",
    findBuildScript(nested)?.rel === "repro/build-submission.sh",
  );
  check(
    "порядок значим: при обоих побеждает build.sh — то, что автор видит, открыв каталог",
    findBuildScript(both)?.rel === "build.sh",
  );
  check("нет ни одного — честный null", findBuildScript(bare) === null);
  check(
    "список кандидатов ОБЪЯВЛЕН, а не зашит в одну строку",
    Array.isArray(BUILD_SCRIPTS) && BUILD_SCRIPTS.length >= 2,
  );

  // ── интерпретатор по расширению, а не по биту исполнения ─────────────────────────────
  check("shell", interpreterFor("/x/build.sh")[0] === "bash");
  check("node", interpreterFor("/x/build.mjs")[0] === process.execPath);
  check("python", interpreterFor("/x/build.py")[0] === "python3");
  check(
    "неизвестное расширение — bash, а не отказ: у скриптов сборки его часто нет вовсе",
    interpreterFor("/x/build")[0] === "bash",
  );

  // ── ОТКАЗ, А НЕ ПРОПУСК ──────────────────────────────────────────────────────────────
  const noScript = buildPaper(bare, { cwd: root });
  check(
    "статья без скрипта — статус no-script",
    noScript.status === "no-script",
  );
  check(
    "🔴 и это СЧИТАЕТСЯ ОТКАЗОМ наравне с упавшей сборкой",
    anyFailed([noScript]) === true,
  );
  check(
    "лекарство называет ОБА пути, по которым искали",
    /build\.sh/.test(remedyFor([noScript])) &&
      /repro\/build-submission\.sh/.test(remedyFor([noScript])),
  );
  check(
    "и говорит, что это НЕ «нечего собирать» — иначе читается как норма",
    /НЕ «нечего собирать»/.test(remedyFor([noScript])),
  );
  check(
    "при полном успехе лекарства НЕТ — пустая строка, а не бодрый абзац",
    remedyFor([{ dir: "d", status: "built", script: "build.sh" }]) === "",
  );

  // ── код возврата скрипта проходит насквозь ───────────────────────────────────────────
  const calls = [];
  const fake = (code) => (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return { status: code };
  };
  check(
    "ноль — собрано",
    buildPaper(top, { cwd: root, run: fake(0) }).status === "built",
  );
  check(
    "ненулевой — упало, и код НАЗВАН",
    (() => {
      const r = buildPaper(top, { cwd: root, run: fake(7) });
      return r.status === "failed" && r.code === 7;
    })(),
  );
  check(
    "и запускается ИМЕННО найденный скрипт нужным интерпретатором",
    calls.at(-1).bin === "bash" &&
      /\/build\.sh$/.test(calls.at(-1).args.at(-1)),
  );
  check(
    "вывод скрипта идёт НАСКВОЗЬ к человеку (stdio inherit), а не копится в буфер",
    calls.at(-1).opts.stdio === "inherit",
  );

  // ── 🔴 --dry-run НЕ ЗАПУСКАЕТ. Проверяется ЭФФЕКТОМ на диске, а не возвращённым объектом
  //
  // Первая редакция этого флага была разобрана в CLI и передана сюда, где его НЕ СУЩЕСТВОВАЛО:
  // деструктуризация опций проглотила неизвестный ключ молча, сборка отработала полностью и
  // переписала PDF в рабочем дереве. Ассерт над возвращённым объектом этого бы не поймал —
  // ловит только отсутствие файла, который создаёт настоящий скрипт.
  const dry = buildPaper(top, { cwd: root, dryRun: true });
  check(
    "--dry-run: статус built и пометка dry",
    dry.status === "built" && dry.dry === true,
  );
  check(
    "--dry-run: скрипт НАЗВАН, иначе аудит бесполезен",
    dry.script === "build.sh",
  );
  check(
    "🔴 --dry-run: скрипт НЕ ЗАПУСКАЛСЯ — на диске нет следа, который он оставляет",
    !existsSync(join(top, "RAN")),
  );
  check(
    "и в отчёте это видно словами, а не молча",
    /--dry-run/.test(formatResults([dry])),
  );

  // ── обход корпуса ────────────────────────────────────────────────────────────────────
  const found = papersIn(join(root, "papers"))
    .map((d) => d.split("/").pop())
    .sort();
  check(
    "каталог без маркеров статьёй не считается",
    !found.includes("not-a-paper"),
  );
  check(
    "а все четыре настоящих — считаются",
    ["bare", "both", "nested", "top"].every((x) => found.includes(x)),
  );
  check(
    "скрытый каталог статьёй не считается, даже с настоящим маркером внутри",
    !found.includes(".hidden-paper"),
  );
  check(
    "несуществующий корень не роняет",
    papersIn(join(root, "nope")).length === 0,
  );

  // ── формат отчёта ────────────────────────────────────────────────────────────────────
  const mixed = [
    { dir: "a", status: "built", script: "build.sh" },
    { dir: "b", status: "failed", script: "build.sh", code: 3 },
    { dir: "c", status: "no-script" },
  ];
  const out = formatResults(mixed);
  check(
    "успех, падение и отсутствие скрипта РАЗЛИЧИМЫ в отчёте",
    /✓ a/.test(out) && /✗ b/.test(out) && /✗ c/.test(out),
  );
  check("у падения назван код", /кодом 3/.test(out));
  check(
    "у отсутствия — сказано, чего именно нет",
    /НЕТ скрипта сборки/.test(out),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — build: «нет скрипта» это ОТКАЗ, а не пропуск`,
);
