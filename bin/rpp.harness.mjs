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
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { run, parseArgs, buildConfig, nextSteps } = await import(
  join(HERE, "rpp.mjs")
);

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
    const code = await run(args, {
      log: (...a) => out.push(a.join(" ")),
      err: (...a) => out.push(a.join(" ")),
    });
    return { code, out: out.join("\n") };
  } catch (e) {
    // 🔴 УТЕЧКА ИСКЛЮЧЕНИЯ — ЭТО СВОЙСТВО, КОТОРОЕ НАДО УТВЕРЖДАТЬ АССЕРТОМ, А НЕ ЛОВИТЬ
    // ПАДЕНИЕМ. Мутация, снимающая catch вокруг ESLint, роняла харнесс СТЕКОМ, и драйвер — по
    // своему строгому правилу «убито только на СВОЁМ ассерте» — отказывался считать это
    // убийством и печатал «survived». То есть настоящий дефект выглядел как слабый тест.
    return { code: 99, out: `THREW: ${e?.message ?? e}` };
  } finally {
    process.chdir(prev);
  }
}

// ── разбор аргументов ───────────────────────────────────────────────────────────────────
check(
  "`--help` первым аргументом — это ФЛАГ, а не команда",
  parseArgs(["--help"]).help === true,
);
check("и команда при этом не выдумывается", parseArgs(["--help"]).cmd === null);
check(
  "путь и опции разбираются",
  (() => {
    const a = parseArgs(["check", "papers", "--options", "o.json", "--json"]);
    return (
      a.cmd === "check" &&
      a.paths[0] === "papers" &&
      a.options === "o.json" &&
      a.json === true
    );
  })(),
);

// ── конфиг собирается, и данные потребителя доезжают ────────────────────────────────────
{
  const cfg = buildConfig(
    { typographyDebt: { x: { sectionSign: 3 } }, authorListCommand: "run-me" },
    null,
  );
  check(
    "без языка LaTeX конфиг всё равно собирается — корпус без .tex не повод отказывать",
    Array.isArray(cfg) && cfg.length === 3,
  );
  check(
    "с языком LaTeX добавляется четвёртый блок",
    buildConfig({}, {}).length === 4,
  );
  const status = cfg.find((c) =>
    c.files.some((f) => f.includes("PIPELINE-STATUS")),
  );
  check(
    "команда из опций доезжает до правила",
    status.rules["paper/author-list"][1].command === "run-me",
  );
}

// ── отказы обязаны быть ОБЪЯСНИМЫМИ ─────────────────────────────────────────────────────
{
  const r = await cli(["--help"]);
  check(
    "`--help` печатает usage и выходит нулём",
    r.code === 0 && /npx research-paper-pipeline check/.test(r.out),
  );
}
// ── `init` — единственный ответ на «как это запустить» ──────────────────────────────────
{
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "rpp-init-")));
  try {
    const first = await cli(["init", dir]);
    check(
      "init выходит нулём и называет записанный файл",
      first.code === 0 && /wrote .*rpp\.json/.test(first.out),
    );
    // Все три шага на месте. Третий теперь НЕ зовёт `/plugin install` до того, как рантайм
    // стоит: плагин без vigiles ставит хуки, которые не загрузятся, — тот самый класс, ради
    // которого этот пакет существует. Пока рантайма нет, третий шаг предлагает его поставить.
    check(
      "и печатает ВСЕ три следующих шага, а не только первый",
      /rpp check/.test(first.out) &&
        /research-paper-pipeline@/.test(first.out) &&
        /npm i -D vigiles/.test(first.out),
    );
    check(
      "и НЕ советует ставить плагин, пока его рантайма нет",
      !/plugin install/.test(first.out),
    );
    check(
      "файл действительно на диске и это валидный JSON",
      JSON.parse(readFileSync(join(dir, "rpp.json"), "utf8")).minFindings === 3,
    );

    // Вторая половина: чужой файл не трогаем. Молча затереть настройку пользователя хуже,
    // чем не сделать ничего, поэтому отказ обязан быть ГРОМКИМ.
    writeFileSync(join(dir, "rpp.json"), '{"mine":true}', "utf8");
    const second = await cli(["init", dir]);
    check(
      "повторный init НЕ перезаписывает и говорит об этом",
      second.code === 0 && /already there/.test(second.out),
    );
    check(
      "и содержимое пользователя цело побайтово",
      readFileSync(join(dir, "rpp.json"), "utf8") === '{"mine":true}',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
{
  const r = await cli(["frobnicate"]);
  check(
    "неизвестная команда НАЗЫВАЕТСЯ",
    r.code === 2 && /unknown command `frobnicate`/.test(r.out),
  );
}
{
  const r = await cli(["check"]);
  // Умолчание "." дало бы зелёный прогон по случайному содержимому — тот же контракт, что у
  // экшена, и та же причина.
  check(
    "`check` без пути отказывает и говорит, чего не хватает",
    r.code === 2 && /needs at least one path/.test(r.out),
  );
}

// ── на живых файлах: обе половины ───────────────────────────────────────────────────────
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-cli-")));
  try {
    const paper = join(root, "papers", "p1");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(
      join(paper, "versions", "2026-07-22-submitted.pdf"),
      "x".repeat(100),
    );
    const status = (bytes) =>
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: ${bytes}\n    source: versions/s.tex\n    sourceBytes: 4\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`;
    writeFileSync(join(paper, "versions", "s.tex"), "abcd");
    writeFileSync(join(paper, "paper.md"), "# Intro\n\nRQ1: does it hold?\n");

    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(100));
    const clean = await cli(["check", "papers"], root);
    check(
      "на чистом корпусе — ноль и внятный отчёт",
      clean.code === 0 && /no findings/.test(clean.out),
    );

    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(999));
    const dirty = await cli(["check", "papers"], root);
    check("подложенное расхождение байтов — находка и код 1", dirty.code === 1);
    check(
      "и находка называет ОБА числа",
      /999/.test(dirty.out) && /100/.test(dirty.out),
    );

    const json = await cli(["check", "papers", "--json"], root);
    check(
      "`--json` отдаёт разбираемый JSON",
      (() => {
        try {
          return Array.isArray(JSON.parse(json.out));
        } catch {
          return false;
        }
      })(),
    );

    // 🔴 Сторож от зелёного ноля: ESLint бросает на пустом наборе, и до починки здесь вылетал
    // стек вместо объяснения.
    mkdirSync(join(root, "nothing"), { recursive: true });
    const empty = await cli(["check", "nothing"], root);
    check(
      "утилита НЕ выпускает исключение наружу — отказ объявляется кодом возврата",
      empty.code !== 99,
    );
    check("пустой набор — ОТКАЗ, а не зелёный ноль", empty.code === 1);
    check(
      "и отказ объясняет, что именно не нашлось",
      /nothing was linted/.test(empty.out) &&
        /not a clean report/.test(empty.out),
    );

    writeFileSync(join(root, "bad.json"), "{ not json");
    const bad = await cli(["check", "papers", "--options", "bad.json"], root);
    check(
      "битый файл опций НАЗЫВАЕТСЯ, а не роняет стек",
      bad.code === 2 && /not valid JSON/.test(bad.out),
    );

    const noFile = await cli(
      ["check", "papers", "--options", "nope.json"],
      root,
    );
    check(
      "отсутствующий файл опций тоже назван",
      noFile.code === 2 && /options file not found/.test(noFile.out),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── ЗАПУСК ЧЕРЕЗ СИМЛИНК — единственный способ, которым утилиту зовёт потребитель ───────
//
// 🔴 npm кладёт в `node_modules/.bin/` СИМЛИНК. Первая редакция сравнивала `import.meta.url` с
// `file://${process.argv[1]}`: у симлинка эти два пути РАЗНЫЕ, условие ложно, и утилита молча
// выходила с нулём. Прямой `node bin/rpp.mjs` при этом работал — то есть дефект был невидим
// ровно тем способом, которым его проверяют.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-link-")));
  try {
    const link = join(root, "rpp-shim");
    symlinkSync(join(HERE, "rpp.mjs"), link);
    const paper = join(root, "papers", "p");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(
      join(paper, "PIPELINE-STATUS.md"),
      "---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/a.pdf\n    bytes: 1\n---\n# S\n",
    );
    const r = spawnSync(process.execPath, [link, "check", "papers"], {
      cwd: root,
      encoding: "utf8",
    });
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    check(
      "через СИМЛИНК утилита работает, а не выходит молча нулём",
      r.status === 1,
    );
    check("и печатает находки", /paper\/stages/.test(out));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(
  `✓ ${String(n)} assertions passed — rpp check, одна команда вместо конфига руками`,
);

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 must not send anyone to `/plugin install` before the runtime is on disk.
//
// 🔴 This survived the withdrawal of the `--with-hooks` flag, because it is not about the flag.
// Claude Code's contract is «a failed or skipped install never blocks the plugin», so a plugin
// installed without its runtime loads and its hooks die on `Cannot find module` with nothing
// said. Telling someone to install the plugin first is therefore telling them to build that.

{
  const before = nextSteps("papers", { hooksReady: false });
  const after = nextSteps("papers", { hooksReady: true });
  check(
    "without the runtime, step 3 names the runtime and its size",
    /npm i -D vigiles/.test(before) && /93 MB/.test(before),
  );
  check(
    "and says skipping it costs only the hooks",
    /rules and the CLI do not use vigiles/.test(before),
  );
  check(
    "without the runtime, /plugin install is NOT offered",
    !before.includes("/plugin install"),
  );
  check(
    "with the runtime, only the plugin wiring is left",
    after.includes("/plugin install research-paper-pipeline"),
  );
  check(
    "and the install line is gone once it is installed",
    !after.includes("npm i -D vigiles"),
  );
}
