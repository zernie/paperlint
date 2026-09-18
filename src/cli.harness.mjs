/**
 * Обе половины для утилиты `research-paper-pipeline lint`, и отдельно — отказы, каждый из
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
  existsSync,
  rmSync,
  realpathSync,
  symlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { run, parseArgs, buildConfig, nextSteps, findConfig, findDeclaration, toPaths, runHook } =
  await import(join(HERE, "cli.ts"));
const { init, choosePapers, offerWorkflow, syncRppJson, missingPrograms, WORKFLOW_PATH } =
  await import(join(HERE, "init.ts"));
const { PROGRAMS } = await import(join(HERE, "doctor.ts"));

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

/** Прогон утилиты с перехватом вывода — тише и быстрее, чем поднимать процесс. */
async function cli(args, cwd) {
  // 🔴 ПОТОКИ РАЗВЕДЕНЫ, И ЭТО НЕСУЩЕЕ. Пока харнесс складывал log и err в один массив, он
  // физически не мог увидеть, что строка `config: …` уезжает в stdout ПЕРЕД JSON и ломает
  // любой парсер у потребителя. Дефект нашёлся не тестом, а попыткой подключить к этому
  // выводу собственный экшен — то есть тест был слеп ровно к тому, что обязан был ловить.
  // `out` остаётся склейкой для ассертов про текст; `stdout` — то, что уйдёт в пайп.
  const stdout = [];
  const stderr = [];
  const prev = process.cwd();
  if (cwd) process.chdir(cwd);
  try {
    const code = await run(args, {
      log: (...a) => stdout.push(a.join(" ")),
      err: (...a) => stderr.push(a.join(" ")),
    });
    return {
      code,
      out: [...stdout, ...stderr].join("\n"),
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } catch (e) {
    // 🔴 УТЕЧКА ИСКЛЮЧЕНИЯ — ЭТО СВОЙСТВО, КОТОРОЕ НАДО УТВЕРЖДАТЬ АССЕРТОМ, А НЕ ЛОВИТЬ
    // ПАДЕНИЕМ. Мутация, снимающая catch вокруг ESLint, роняла харнесс СТЕКОМ, и драйвер — по
    // своему строгому правилу «убито только на СВОЁМ ассерте» — отказывался считать это
    // убийством и печатал «survived». То есть настоящий дефект выглядел как слабый тест.
    return {
      code: 99,
      out: `THREW: ${e?.message ?? e}`,
      stdout: "",
      stderr: `THREW: ${e?.message ?? e}`,
    };
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
  "путь и конфиг разбираются",
  (() => {
    const a = parseArgs(["lint", "papers", "--config", "o.json", "--json"]);
    return (
      a.cmd === "lint" &&
      a.paths[0] === "papers" &&
      a.config === "o.json" &&
      a.json === true
    );
  })(),
);
check(
  "порог предупреждений по умолчанию ОТРИЦАТЕЛЬНЫЙ — совет не валит прогон",
  parseArgs(["lint"]).maxWarnings === -1,
);
check(
  "и разбирается, когда назван явно",
  parseArgs(["lint", "--max-warnings", "0"]).maxWarnings === 0,
);
check(
  "прежнее написание `--options` продолжает работать — флаг в чужом CI не наш, чтобы его ломать",
  parseArgs(["lint", "--options", "o.json"]).config === "o.json",
);
check(
  "`papers` строкой и списком нормализуются одинаково",
  toPaths("papers")[0] === "papers" &&
    toPaths(["a", "b"]).length === 2 &&
    toPaths(undefined).length === 0 &&
    toPaths("  ").length === 0,
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
    r.code === 0 && /npx rpp lint/.test(r.out),
  );
}
// ── ОДНА ДЕКЛАРАЦИЯ, И ЧИТАЕТ ЕЁ ТОТ ЖЕ, КТО ЕЁ ПИШЕТ ──────────────────────────────────
//
// 🔴 БЕЗ ЭТОГО БЛОКА ПЕРЕПИСАННЫЙ `init` ПРОИЗВОДИЛ БЫ НЕРАБОТАЮЩУЮ УСТАНОВКУ. Он пишет одну
// декларацию — в `package.json`, тот файл, который умеют читать хуки (хук не импортирует код и
// не умеет ходить вверх по дереву; он может прочитать путь, который в состоянии назвать).
// Утилита же читала ТОЛЬКО `rpp.json`, поэтому сразу после `rpp init` её `lint` сказал бы
// «nothing to lint». То есть команда установки и команда проверки смотрели бы в разные файлы —
// ровно тот дефект, который она закрывает, только с другой стороны.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-carrier-")));
  try {
    const paper = join(root, "papers", "p1");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(join(paper, "versions", "s.tex"), "abcd");
    writeFileSync(join(paper, "versions", "2026-07-22-submitted.pdf"), "x".repeat(100));
    writeFileSync(join(paper, "paper.md"), "# Intro\n\nRQ1: does it hold?\n");
    writeFileSync(
      join(paper, "PIPELINE-STATUS.md"),
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: 100\n    source: versions/s.tex\n    sourceBytes: 4\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`,
    );
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify(
        { name: "c", version: "1.0.0", "research-paper-pipeline": { papers: "papers" } },
        null,
        2,
      ),
    );

    const r = await cli(["lint"], root);
    check(
      "🔴 УТИЛИТА ЧИТАЕТ ДЕКЛАРАЦИЮ ИЗ package.json — иначе `rpp init` ставит то, что `rpp lint` не видит",
      r.code === 0 && /no findings/.test(r.out),
    );
    check(
      "и НАЗЫВАЕТ носитель вслух — подмена настроек молчаливой не бывает",
      /config: package\.json/.test(r.out),
    );
    check(
      "у package.json нет пометки про устаревание — устарел не он",
      !/is deprecated/.test(r.out),
    );

    // Ключ есть, `papers` внутри нет: это не «пустой конфиг», а незаконченный, и отказ обязан
    // назвать ИМЕННО ту форму, которую надо дописать.
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "c", version: "1.0.0", "research-paper-pipeline": {} }, null, 2),
    );
    const noPapers = await cli(["lint"], root);
    check(
      "ключ без `papers` — отказ, и показана форма ВНУТРИ package.json",
      noPapers.code === 2 &&
        /must declare `papers`/.test(noPapers.out) &&
        /"research-paper-pipeline": \{ "papers": "papers" \}/.test(noPapers.out),
    );

    // 🔴 package.json БЕЗ ключа не останавливает подъём. Иначе поиск кончался бы на первом же
    // проекте по пути наверх — а package.json есть у каждого, — и не находил бы ничего никогда.
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "c", version: "1.0.0" }));
    writeFileSync(join(root, "rpp.json"), JSON.stringify({ papers: "papers" }));
    const viaRpp = await cli(["lint"], root);
    check(
      "package.json без ключа не перехватывает поиск — rpp.json по-прежнему находится",
      viaRpp.code === 0 && /config: rpp\.json/.test(viaRpp.out),
    );
    check(
      "🔴 но устаревший носитель НАЗВАН, а не просто прочитан молча",
      /rpp\.json is deprecated/.test(viaRpp.out) &&
        /the hooks read only that file/.test(viaRpp.out),
    );

    // Оба носителя рядом: побеждает тот, который читают ВСЕ остальные.
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "c",
        version: "1.0.0",
        "research-paper-pipeline": { papers: "papers" },
      }),
    );
    check(
      "при обоих носителях выбирается package.json — это и значит «одна декларация»",
      findDeclaration(root)?.kind === "package.json" &&
        findDeclaration(root)?.path === join(root, "package.json"),
    );
    check(
      "а findConfig по-прежнему отвечает на вопрос «в каком файле лежат настройки»",
      findConfig(root) === join(root, "package.json"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── `init` — ТРИ ДЕЙСТВИЯ ВМЕСТО ДЕВЯТИ ────────────────────────────────────────────────
//
// 🔴 ДЕФЕКТ, РАДИ КОТОРОГО КОМАНДА ПЕРЕПИСАНА (issue #33, замер 18.09): init писал `rpp.json`
// с УГАДАННЫМ `"papers": "papers"` и не трогал `package.json` — а три хука читают каталог
// статей именно оттуда. Потребитель, сделавший всё по документации, получал
// `paper-edit-guard`, сторожащий несуществующий каталог; снаружи это неотличимо от рабочего
// стража, потому что молчание — его успех.
//
// ⚠️ Вопросы здесь НЕ ЗАДАЮТСЯ вслепую: `interactive` передаётся явно, а не берётся у stdin.
// Харнесс, зависший на приглашении ввода, — это не красный тест, это отсутствие ответа вообще.
{
  const workRoot = realpathSync(mkdtempSync(join(tmpdir(), "rpp-init-")));
  const project = (name, { pkg = { name: "consumer", version: "1.0.0" }, papers = [] } = {}) => {
    const dir = join(workRoot, name);
    mkdirSync(dir, { recursive: true });
    for (const rel of papers) {
      mkdirSync(join(dir, rel, "p1"), { recursive: true });
      writeFileSync(join(dir, rel, "p1", "paper.tex"), "\\documentclass{article}\n");
    }
    if (pkg) writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    return dir;
  };
  const say = () => {
    const lines = [];
    return { lines, log: (...a) => lines.push(a.join(" ")), text: () => lines.join("\n") };
  };
  const declared = (dir) =>
    JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))["research-paper-pipeline"];
  // Ни одна проверка не должна зависеть от того, что установлено НА ЭТОЙ машине: `command -v`
  // подменяется, иначе «внешних программ нет» читалось бы как находка про init.
  const haveAll = () => ({ status: 0 });
  const haveNone = () => ({ status: 1 });

  try {
    // ── 1. КАТАЛОГ СТАТЕЙ ИЗМЕРЯЕТСЯ, А НЕ УГАДЫВАЕТСЯ ────────────────────────────────
    {
      const dir = project("detect", { papers: ["writing/drafts"] });
      const out = say();
      const code = await init(dir, { log: out.log, err: out.log, interactive: false, run: haveAll });
      check(
        "🔴 ДЕКЛАРАЦИЯ ПОЯВЛЯЕТСЯ В package.json — том файле, который читают хуки",
        declared(dir) !== undefined && typeof declared(dir).papers === "string",
      );
      check(
        "🔴 и её значение ИЗМЕРЕНО, а не взято из умолчания `papers`",
        declared(dir).papers === "writing/drafts",
      );
      check(
        "и сказано, ЧЕМ оно измерено — иначе догадка читается как факт",
        /measured: its subdirectories carry/.test(out.text()),
      );
      check(
        "🔴 `rpp.json` БОЛЬШЕ НЕ СОЗДАЁТСЯ — вторая декларация это то, что doctor и ловит",
        !existsSync(join(dir, "rpp.json")),
      );
      check(
        "init заканчивается отчётом doctor: установка САМА говорит о своём состоянии",
        /rpp doctor — what is wired/.test(out.text()),
      );
      check(
        "и на согласованной установке выходит нулём",
        code === 0 && /the same directory/.test(out.text()),
      );
    }

    // ── 2. УГАДАННОЕ НАЗЫВАЕТСЯ УГАДАННЫМ ─────────────────────────────────────────────
    {
      const dir = project("empty");
      const out = say();
      const code = await init(dir, { log: out.log, err: out.log, interactive: false, run: haveAll });
      check(
        "нечего измерять — берётся документированное умолчание",
        declared(dir).papers === "papers",
      );
      check(
        "🔴 и оно ПОМЕЧЕНО как догадка, а не подано как измерение",
        /A GUESS/.test(out.text()) && /Nothing here looks like a papers directory/.test(out.text()),
      );
      check(
        "🔴 каталога нет ⇒ doctor краснеет, и init возвращает ЕГО вердикт, а не свой успех",
        code === 2 && /the install is NOT finished/.test(out.text()),
      );
    }

    // ── 3. ЧУЖОЕ ЗНАЧЕНИЕ НЕ ПЕРЕЗАПИСЫВАЕТСЯ ─────────────────────────────────────────
    {
      const dir = project("mine", {
        pkg: { name: "c", version: "1.0.0", "research-paper-pipeline": { papers: "mine" } },
        papers: ["writing"],
      });
      const before = readFileSync(join(dir, "package.json"), "utf8");
      const out = say();
      await init(dir, { log: out.log, err: out.log, interactive: false, run: haveAll });
      check(
        "🔴 уже объявленное значение ЦЕЛО побайтово — молча заменить настройку хуже, чем не делать ничего",
        readFileSync(join(dir, "package.json"), "utf8") === before,
      );
      check(
        "и об этом сказано вслух, а не пропущено",
        /already declares papers = "mine" — kept, nothing overwritten/.test(out.text()),
      );
    }

    // ── 4. НЕКУДА ПИСАТЬ — ЭТО ОТКАЗ С ЛЕКАРСТВОМ ─────────────────────────────────────
    {
      const dir = project("nopkg", { pkg: null, papers: ["writing"] });
      const out = say();
      const code = await init(dir, { log: out.log, err: out.log, interactive: false, run: haveAll });
      check(
        "без package.json init ОТКАЗЫВАЕТ и несёт лекарство, а не диагноз",
        code === 2 &&
          /npm init -y/.test(out.text()) &&
          /nowhere to put the declaration/.test(out.text()),
      );
      check("и ничего не создаёт взамен", !existsSync(join(dir, "package.json")));
    }

    // ── 5. СПРАШИВАЕТСЯ ТОЛЬКО НЕУГАДЫВАЕМОЕ, И ТОЛЬКО У ЧЕЛОВЕКА ─────────────────────
    {
      const dir = project("ci", { papers: ["writing"] });
      const out = say();
      await init(dir, { log: out.log, err: out.log, interactive: false, run: haveAll });
      check(
        "🔴 не терминал — вопрос НЕ задаётся, и взятое умолчание НАЗВАНО",
        /stdin is not a terminal, so nothing was asked. Default taken: NO file written/.test(
          out.text(),
        ),
      );
      check(
        "и безопасное умолчание — это отсутствие файла",
        !existsSync(join(dir, WORKFLOW_PATH)),
      );
      check(
        "а шаг для CI всё равно напечатан — его просто вставляют руками",
        /uses: zernie\/research-paper-pipeline@/.test(out.text()) &&
          /paths: writing/.test(out.text()),
      );
    }
    {
      const dir = project("ci-yes", { papers: ["writing"] });
      const asked = [];
      const wf = await offerWorkflow(dir, "writing", {
        interactive: true,
        ask: async (q) => {
          asked.push(q);
          return "y";
        },
      });
      check("согласие ПИШЕТ воркфлоу", wf === "written" && existsSync(join(dir, WORKFLOW_PATH)));
      check(
        "и воркфлоу несёт ТОТ каталог, о котором шла речь",
        /paths: writing/.test(readFileSync(join(dir, WORKFLOW_PATH), "utf8")),
      );
      check("вопрос задан ровно один", asked.length === 1);
      const again = await offerWorkflow(dir, "writing", {
        interactive: true,
        ask: async () => "y",
      });
      check("существующий воркфлоу не перезаписывается и не переспрашивается", again === "kept");
    }
    {
      const dir = project("ci-no", { papers: ["writing"] });
      const no = await offerWorkflow(dir, "writing", { interactive: true, ask: async () => "" });
      check(
        "пустой ответ — это НЕТ, и файла не появляется",
        no === "declined" && !existsSync(join(dir, WORKFLOW_PATH)),
      );
      // 🔴 Замер 18.09 на настоящем псевдотерминале: `readline.question()` ОТКЛОНЯЕТСЯ с
      // `AbortError: Aborted with Ctrl+D`, и это исключение улетало наружу ПОСЛЕ того, как
      // декларация уже записана — то есть установка одновременно удалась и выглядела падением.
      // 🔴 `.catch` ЗДЕСЬ НЕСУЩИЙ, А НЕ ОСТОРОЖНОСТЬ. Утечка исключения — это СВОЙСТВО, которое
      // утверждают ассертом; пойманное падением харнесса оно читается драйвером батареи как
      // «мутация выжила», то есть настоящий дефект выглядел бы дырой в тесте.
      const aborted = await offerWorkflow(dir, "writing", {
        interactive: true,
        ask: async () => {
          throw new Error("Aborted with Ctrl+D");
        },
      }).catch((e) => `THREW: ${e?.message ?? e}`);
      check("🔴 прерванный вопрос НЕ роняет команду — он означает умолчание", aborted === "declined");
    }

    // ── 6. НЕСКОЛЬКО КАНДИДАТОВ — ЕДИНСТВЕННЫЙ СЛУЧАЙ, КОГДА СПРАШИВАЮТ ───────────────
    {
      const dir = project("many", { papers: ["alpha", "beta"] });
      const picked = await choosePapers(dir, { interactive: true, ask: async () => "2" });
      check(
        "🔴 ответ человека РЕШАЕТ, а не украшает вывод",
        picked.how === "chosen" && picked.papers === picked.candidates[1],
      );
      const quiet = await choosePapers(dir, { interactive: false });
      check(
        "в не-терминале берётся первый, и это названо, а не выдано за выбор",
        quiet.how === "not-asked" && quiet.papers === quiet.candidates[0],
      );
      const aborted = await choosePapers(dir, {
        interactive: true,
        ask: async () => {
          throw new Error("Aborted with Ctrl+D");
        },
      }).catch((e) => ({ how: `THREW: ${e?.message ?? e}`, papers: null, candidates: [] }));
      check(
        "прерванный выбор — тоже умолчание, а не падение",
        aborted.how === "no-answer" && aborted.papers === aborted.candidates[0],
      );
    }

    // ── 7. ВНЕШНИЙ ИНСТРУМЕНТАРИЙ ДОКЛАДЫВАЕТСЯ, А НЕ СТАВИТСЯ ───────────────────────
    //
    // npm's own rule, цитируемая в разборе husky: «The only valid use of install or preinstall
    // scripts is for compilation». Установка, способная тихо не состояться, хуже явного шага.
    {
      const dir = project("tools", { papers: ["writing"] });
      const out = say();
      await init(dir, { log: out.log, err: out.log, interactive: false, run: haveNone });
      check(
        "каждая пропажа НАЗВАНА вместе с последствием",
        /✗ pdflatex/.test(out.text()) && /no PDF is produced/.test(out.text()),
      );
      check(
        "🔴 и несёт КОМАНДУ УСТАНОВКИ — лекарство, а не диагноз",
        /apt-get install -y texlive-latex-recommended/.test(out.text()),
      );
      check(
        "и сказано прямо, что ничего не ставится за пользователя",
        /nothing is installed for you/.test(out.text()),
      );
      check(
        "а спрошенная система, в которой всё есть, не даёт ни одной пропажи",
        missingPrograms(haveAll).length === 0,
      );
      check(
        "и пустая система даёт их все — счётчик считает то же, что печатает",
        missingPrograms(haveNone).length === PROGRAMS.length,
      );
    }

    // ── 8. `rpp.json` У ТЕХ, У КОГО ОН УЖЕ ЕСТЬ ──────────────────────────────────────
    {
      const dir = project("legacy", { papers: ["writing"] });
      writeFileSync(join(dir, "rpp.json"), JSON.stringify({ minFindings: 5 }, null, 2) + "\n");
      const out = say();
      await init(dir, { log: out.log, err: out.log, interactive: false, run: haveAll });
      check(
        "существующий rpp.json получает ТО ЖЕ значение, а не расходится молча",
        JSON.parse(readFileSync(join(dir, "rpp.json"), "utf8")).papers === "writing",
      );
      check("и назван устаревшим", /rpp\.json was already here/.test(out.text()));

      const own = join(workRoot, "legacy-own");
      mkdirSync(own, { recursive: true });
      writeFileSync(join(own, "package.json"), '{"name":"c","version":"1.0.0"}');
      writeFileSync(join(own, "rpp.json"), '{"papers":"mine"}');
      check(
        "а уже объявленный в нём `papers` остаётся побайтово — это тоже чужое значение",
        syncRppJson(own, "writing") === "kept" &&
          readFileSync(join(own, "rpp.json"), "utf8") === '{"papers":"mine"}',
      );
    }

    // ── 9. КОМАНДА ПОДКЛЮЧЕНА К `run`, А НЕ ТОЛЬКО ЭКСПОРТИРОВАНА ────────────────────
    {
      const dir = project("wired", { papers: ["writing"] });
      const r = await cli(["init", dir]);
      check(
        "`rpp init` доходит до реализации и объявляет измеренный каталог",
        declared(dir).papers === "writing" && /rpp init — each decision/.test(r.out),
      );
    }
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
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
  // Флаг без значения. Дефект найден компилятором при переводе на TypeScript: `rest[++i]` за
  // последним аргументом даёт undefined, и `--config` без значения молча означал «конфига не
  // задано» — то есть автопоиск по чужому файлу вместо названного.
  const r = await cli(["lint", "--config"]);
  check(
    "флаг без значения — ОТКАЗ, а не тихое умолчание",
    r.code === 2 && /--config needs a value/.test(r.out),
  );
}
{
  // Умолчание "." дало бы зелёный прогон по случайному содержимому — тот же контракт, что у
  // экшена, и та же причина. Пустой каталог без конфига — ровно этот случай.
  const bare = realpathSync(mkdtempSync(join(tmpdir(), "rpp-bare-")));
  try {
    const r = await cli(["lint"], bare);
    check(
      "`lint` без пути И без конфига отказывает и называет ОБА выхода",
      r.code === 2 &&
        /nothing to lint/.test(r.out) &&
        /rpp init/.test(r.out) &&
        /rpp lint papers/.test(r.out),
    );
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
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
    const clean = await cli(["lint", "papers"], root);
    check(
      "на чистом корпусе — ноль и внятный отчёт",
      clean.code === 0 && /no findings/.test(clean.out),
    );

    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(999));
    const dirty = await cli(["lint", "papers"], root);
    check("подложенное расхождение байтов — находка и код 1", dirty.code === 1);
    check(
      "и находка называет ОБА числа",
      /999/.test(dirty.out) && /100/.test(dirty.out),
    );

    const json = await cli(["lint", "papers", "--json"], root);
    check(
      "`--json` отдаёт разбираемый JSON",
      (() => {
        try {
          return Array.isArray(JSON.parse(json.stdout));
        } catch {
          return false;
        }
      })(),
    );

    // 🔴 Сторож от зелёного ноля: ESLint бросает на пустом наборе, и до починки здесь вылетал
    // стек вместо объяснения.
    mkdirSync(join(root, "nothing"), { recursive: true });
    const empty = await cli(["lint", "nothing"], root);
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
    const bad = await cli(["lint", "papers", "--config", "bad.json"], root);
    check(
      "битый конфиг НАЗЫВАЕТСЯ, а не роняет стек",
      bad.code === 2 && /not valid JSON/.test(bad.out),
    );

    const noFile = await cli(["lint", "papers", "--config", "nope.json"], root);
    check(
      "отсутствующий конфиг тоже назван",
      noFile.code === 2 && /config file not found/.test(noFile.out),
    );

    // `check` остаётся псевдонимом: чужой воркфлоу не ломаем, но говорим, чем заменено.
    const alias = await cli(["check", "papers"], root);
    check(
      "`check` ещё работает и печатает, чем он заменён",
      alias.code === 1 && /`check` is now `lint`/.test(alias.out),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── КОНФИГ НАХОДИТСЯ САМ, И КАТАЛОГ СТАТЕЙ ОБЪЯВЛЕН В НЁМ ──────────────────────────────
//
// 🔴 ДЕФЕКТ, РАДИ КОТОРОГО ЭТОТ БЛОК СУЩЕСТВУЕТ: `rpp init` писал `rpp.json`, а `rpp check`
// читал его ТОЛЬКО по явному `--options`. То есть файл, который утилита сама же и создала,
// на прогон не влиял — и узнать об этом было неоткуда: нулевой долг типографики выглядит
// ровно как ненайденный конфиг.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-cfg-")));
  try {
    const paper = join(root, "papers", "p1");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(join(paper, "versions", "s.tex"), "abcd");
    writeFileSync(
      join(paper, "versions", "2026-07-22-submitted.pdf"),
      "x".repeat(100),
    );
    writeFileSync(join(paper, "paper.md"), "# Intro\n\nRQ1: does it hold?\n");
    const status = (bytes) =>
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: ${bytes}\n    source: versions/s.tex\n    sourceBytes: 4\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`;
    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(100));

    // findConfig — отдельно от прогона, чтобы отказ был различим
    writeFileSync(join(root, "rpp.json"), JSON.stringify({ papers: "papers" }));
    check(
      "findConfig поднимается вверх из подкаталога и находит файл в корне",
      findConfig(paper) === join(root, "rpp.json"),
    );
    // Тавтологии здесь быть не может: соседнее дерево НЕ должно подхватывать наш файл.
    // Утверждать `=== null` на живой ФС нельзя — выше по цепочке может лежать чужой rpp.json,
    // поэтому утверждается то, что проверяемо: наш конфиг оттуда не виден.
    const sibling = realpathSync(mkdtempSync(join(tmpdir(), "rpp-other-")));
    check(
      "конфиг НЕ утекает в соседнее дерево — поиск идёт вверх, а не вширь",
      findConfig(sibling) !== join(root, "rpp.json"),
    );
    rmSync(sibling, { recursive: true, force: true });

    const found = await cli(["lint"], root);
    check(
      "конфиг НАЙДЕН сам: `lint` без единого аргумента отрабатывает",
      found.code === 0 && /no findings/.test(found.out),
    );
    check(
      "и найденный файл НАЗВАН вслух — молчаливая подмена настроек недопустима",
      /config: rpp\.json/.test(found.out),
    );

    // 🔴 РАЗЛИЧИТЕЛЬ РЕЗОЛВА. Запуск ИЗ каталога статьи: конфиг тот же, а `"papers": "papers"`,
    // разрешённый относительно ТЕКУЩЕГО каталога, указал бы на `papers/p1/papers` — такого нет,
    // и прогон упал бы «nothing was linted» там, где весь корпус на месте.
    const fromSub = await cli(["lint"], paper);
    check(
      "путь из конфига резолвится относительно КАТАЛОГА КОНФИГА, а не текущего",
      fromSub.code === 0 && /no findings/.test(fromSub.out),
    );

    // Данные потребителя из найденного конфига реально доезжают до правил, а не просто читаются.
    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(999));
    const dirty = await cli(["lint"], root);
    check(
      "найденный конфиг не отменяет находок — расхождение по-прежнему ловится",
      dirty.code === 1 && /999/.test(dirty.out),
    );
    writeFileSync(join(paper, "PIPELINE-STATUS.md"), status(100));

    // Аргумент ПЕРЕОПРЕДЕЛЯЕТ конфиг: одна статья вместо корпуса, без правки файла.
    mkdirSync(join(root, "elsewhere"), { recursive: true });
    const override = await cli(["lint", "elsewhere"], root);
    check(
      "аргумент командной строки ПЕРЕОПРЕДЕЛЯЕТ `papers` из конфига",
      override.code === 1 &&
        /nothing was linted under elsewhere/.test(override.out),
    );

    // 🔴 `papers` — ОБЯЗАТЕЛЬНОЕ ПОЛЕ. Конфиг без него не «пустой конфиг», а незаконченный:
    // молча уехать на умолчание "." значит прогнать правила по всему чекауту.
    writeFileSync(join(root, "rpp.json"), JSON.stringify({ minFindings: 3 }));
    const noPapers = await cli(["lint"], root);
    check(
      "конфиг БЕЗ `papers` — отказ, и поле названо поимённо",
      noPapers.code === 2 &&
        /must declare `papers`/.test(noPapers.out) &&
        /cannot guess/.test(noPapers.out),
    );
    check(
      'пустая строка в `papers` считается отсутствующей, а не каталогом ""',
      (
        await (async () => {
          writeFileSync(join(root, "rpp.json"), JSON.stringify({ papers: "" }));
          return await cli(["lint"], root);
        })()
      ).code === 2,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── ПОРОГ ПРЕДУПРЕЖДЕНИЙ ───────────────────────────────────────────────────────────────
//
// Вход `max-warnings` есть у экшена, и когда экшен перестал звать eslint напрямую, порог
// обязан был появиться здесь — иначе он потерялся бы МОЛЧА: прогон остался бы зелёным, а
// настройка потребителя перестала бы что-либо значить.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-warn-")));
  try {
    const paper = join(root, "papers", "p1");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(join(paper, "versions", "s.tex"), "abcd");
    writeFileSync(
      join(paper, "versions", "2026-07-22-submitted.pdf"),
      "x".repeat(100),
    );
    // Три знака § — правило `paper/typography`, уровень warn и только warn.
    writeFileSync(
      join(paper, "paper.md"),
      "# Intro\n\nRQ1: does it hold?\n\nSee \u00a7 5 and \u00a7 6 and \u00a7 7.\n",
    );
    writeFileSync(
      join(paper, "PIPELINE-STATUS.md"),
      `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/2026-07-22-submitted.pdf\n    bytes: 100\n    source: versions/s.tex\n    sourceBytes: 4\n---\n# S\n\n| id | note |\n|---|---|\n| cites | bib-authors run |\n`,
    );
    writeFileSync(join(root, "rpp.json"), JSON.stringify({ papers: "papers" }));

    const lax = await cli(["lint"], root);
    check(
      "предупреждение БЕЗ порога прогон не валит — иначе гейт на советах глушат целиком",
      lax.code === 0,
    );
    const strict = await cli(["lint", "--max-warnings", "0"], root);
    check(
      "а с порогом 0 — валит, и это ровно то же предупреждение",
      strict.code === 1,
    );
    check(
      "и отказ называет ЧИСЛО и ПОРОГ, а не просто «слишком много»",
      /1 warning\(s\) exceed the --max-warnings limit of 0/.test(strict.out),
    );
    const generous = await cli(["lint", "--max-warnings", "5"], root);
    check(
      "порог ВЫШЕ числа находок молчит — проверка про порог, а не про наличие warn",
      generous.code === 0,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── СТРУКТУРА ДОЕЗЖАЕТ ДО КОМАНДЫ ──────────────────────────────────────────────────────
//
// `structure.mjs` проверен отдельно и целиком (`structure.harness.mjs`). Здесь — ровно один
// факт, которого тот харнесс знать не может: что модуль ПОДКЛЮЧЁН. Корректный модуль, забытый
// в `run()`, даёт ноль находок и выглядит как чистый корпус.
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-wired-")));
  try {
    const paper = join(root, "papers", "orphan");
    mkdirSync(paper, { recursive: true });
    // Маркер есть, табеля нет: НИ ОДНО правило пайплайна по этому каталогу не бежит.
    writeFileSync(join(paper, "paper.tex"), "\\documentclass{article}\n");
    writeFileSync(join(root, "rpp.json"), JSON.stringify({ papers: "papers" }));

    const r = await cli(["lint"], root);
    check(
      "каталог без табеля — НЕ зелёный ноль: команда выходит единицей",
      r.code === 1,
    );
    check(
      "и находка напечатана до отчёта ESLint, с последствием",
      /missing `PIPELINE-STATUS\.md`/.test(r.out) && /ZERO rules/.test(r.out),
    );
    check(
      "и НЕ печатает «no findings» поверх найденного",
      !/no findings/.test(r.out),
    );

    const j = await cli(["lint", "--json"], root);
    // 🔴 Дефект, ради которого потоки разведены: строка `config: …` в stdout перед массивом
    // ломает `| jq` у потребителя. Обе половины — stdout чист, и строка при этом НЕ ПОТЕРЯНА.
    check(
      "`--json`: stdout — чистый JSON, ни одной служебной строки перед ним",
      (() => {
        try {
          JSON.parse(j.stdout);
          return true;
        } catch {
          return false;
        }
      })(),
    );
    check(
      "и строка про найденный конфиг не потеряна — она ушла в stderr",
      /config: rpp\.json/.test(j.stderr) && !/config:/.test(j.stdout),
    );
    check(
      "`--json` отдаёт ОДИН массив, в котором находка о пропаже лежит рядом с находками правил",
      (() => {
        try {
          const parsed = JSON.parse(j.stdout);
          return parsed.some((x) =>
            x.messages?.some((m) => m.ruleId === "structure/required-file"),
          );
        } catch {
          return false;
        }
      })(),
    );

    // Парная половина ЗДЕСЬ ЖЕ: дописали табель — проверка замолчала.
    writeFileSync(
      join(paper, "PIPELINE-STATUS.md"),
      "---\nstages: []\n---\n# S\n",
    );
    const after = await cli(["lint"], root);
    check(
      "дописали табель — жалоба на структуру ушла",
      !/missing `PIPELINE-STATUS\.md`/.test(after.out),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ── `rpp hook` — РАНТАЙМ РЕЗОЛВИТСЯ ОТ ПАКЕТА, А НЕ ОТ КОРНЯ ПРОЕКТА ────────────────────
//
// 🔴 Замер, породивший эту команду: один тарбол, два менеджера.
//     npm:  node_modules/vigiles/dist/cli.js  ЕСТЬ
//     pnpm: node_modules/vigiles/dist/cli.js  НЕТ
// Прежняя проводка адресовала рантайм от корня проекта и на pnpm не резолвилась, а `|| exit 2`
// на PreToolUse(Bash) превращал это в блокировку ЛЮБОЙ команды. Сквозная половина (обе
// установки, настоящие процессы) живёт в `scripts/install-e2e.mjs`; здесь — вердикты.
{
  const calls = [];
  const fake = (code) => (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return { status: code };
  };
  let said = "";
  const err = (...a) => {
    said += a.join(" ") + "\n";
  };

  said = "";
  check(
    "без имени — отказ, и подсказан правильный вызов",
    runHook(undefined, { err }) === 2 && /rpp hook paper-edit-guard/.test(said),
  );

  said = "";
  check(
    "неизвестный хук НАЗЫВАЕТСЯ вместе с путём, по которому его искали",
    runHook("no-such-hook", { err }) === 2 &&
      /unknown hook `no-such-hook`/.test(said) &&
      /no-such-hook\.hook\.mjs/.test(said),
  );

  // 🔴 ГЛАВНЫЙ АССЕРТ. Ненайденный рантайм НЕ ИМЕЕТ ПРАВА вернуть 2: на PreToolUse это
  // блокирует любую Bash-команду, включая ту, которой чинят. Он обязан ГРОМКО сказать и
  // пропустить. Молчаливая деградация хуже явной, но блокировка всего хуже обеих.
  said = "";
  calls.length = 0;
  const brokenResolve = () => {
    throw new Error("Cannot find module 'vigiles/dist/cli.js'");
  };
  const code = runHook("paper-edit-guard", {
    err,
    run: fake(0),
    resolve: brokenResolve,
  });
  check(
    "рантайм не резолвится — НЕ блокируем работу (код 0, а не 2)",
    code === 0,
  );
  check(
    "и жалоба ГРОМКАЯ: назван хук, назван эффект, назано лекарство",
    /paper-edit-guard/.test(said) &&
      /is NOT running/.test(said) &&
      /Reinstall this package/.test(said),
  );
  check("и при этом рантайм НЕ запускался", calls.length === 0);

  // Настоящий вердикт хука проходит насквозь — иначе страж перестаёт быть стражем.
  calls.length = 0;
  check(
    "вердикт хука проходит НАСКВОЗЬ: 2 остаётся 2",
    runHook("paper-edit-guard", { err, run: fake(2) }) === 2,
  );
  check(
    "и запускается ИМЕННО рантайм с программой этого хука",
    calls.length === 1 &&
      calls[0].args[1] === "hook-runtime" &&
      calls[0].args[2] === "run-program" &&
      /paper-edit-guard\.hook\.mjs$/.test(calls[0].args[3]),
  );
  check(
    "ноль остаётся нулём",
    runHook("paper-skills-nudge", { err, run: fake(0) }) === 0,
  );
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
    symlinkSync(join(HERE, "..", "bin", "rpp.mjs"), link);
    const paper = join(root, "papers", "p");
    mkdirSync(join(paper, "versions"), { recursive: true });
    writeFileSync(
      join(paper, "PIPELINE-STATUS.md"),
      "---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/a.pdf\n    bytes: 1\n---\n# S\n",
    );
    const r = spawnSync(process.execPath, [link, "lint", "papers"], {
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
  `✓ ${String(n)} assertions passed — rpp lint, одна команда вместо конфига руками`,
);

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 has ONE shape now: two lines typed inside Claude Code.
//
// 🔴 It must never ask for a manual runtime install again. That instruction went through three
// forms — a copy-paste line, a `--with-hooks` flag, a self-contained bundle — and all three were
// wrong for the same reason: the runtime is an ordinary dependency, so there is nothing to do.

{
  const steps = nextSteps("papers");
  check(
    "step 3 gives the two /plugin lines",
    steps.includes("/plugin marketplace add") &&
      steps.includes("/plugin install research-paper-pipeline"),
  );
  check("and asks for NO manual install", !/npm i -D vigiles/.test(steps));
  check(
    "and says the runtime already came along",
    /runtime came with this package/.test(steps),
  );
  check(
    "skipping it is still safe, and says so",
    /everything above still works/.test(steps),
  );
}
