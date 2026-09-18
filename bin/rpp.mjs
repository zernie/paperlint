#!/usr/bin/env node
/**
 * `research-paper-pipeline lint [paths…]` — прогнать все правила по корпусу статей.
 *
 * 🔴 ЗАЧЕМ ЭТА УТИЛИТА СУЩЕСТВУЕТ. До неё «установка» означала: поставь пакет И НАПИШИ РУКАМИ
 * шестьдесят строк flat-конфига ESLint, перечислив десять правил, три языка и четыре блока
 * `files`. То есть инструмент вываливал свою реализацию на пользователя: чтобы посчитать байты
 * pdf, надо было сперва узнать, что такое `language: "tex/latex"`. Под ESLint правила по-прежнему
 * бегут — но это ВНУТРЕННЕЕ устройство, и знать его для запуска больше не нужно.
 *
 * Два входа в инструмент, и оба теперь целые:
 *     npx research-paper-pipeline lint              ← здесь
 *     uses: zernie/research-paper-pipeline@<sha>    ← action.yml
 *
 * ⚠️ ГРАНИЦА, КОТОРУЮ УТИЛИТА НЕ ИМЕЕТ ПРАВА СТЕРЕТЬ: данные потребителя остаются у потребителя.
 * Долг типографики, маркер прогона сверки авторов, словарь полей — всё это про ОДИН корпус, и
 * зашивать их в пакет значило бы повторить дефект, из-за которого в сообщении правила стоял путь
 * `.claude/skills/verify-citations/...`. Поэтому они живут в `rpp.json` у потребителя.
 *
 * 🔴 ПОЧЕМУ КОМАНДА НАЗЫВАЕТСЯ `lint`, А НЕ `check`. Она делает ровно то, что этим словом
 * называют все остальные: читает файлы, ничего не меняет, печатает находки, выходит ненулём.
 * `check` в экосистеме занято другим смыслом — `cargo check`, `tsc --noEmit`, `npm run check` —
 * это «собери, но не выводи артефакт», то есть половина СБОРКИ. Пакет, у которого сборка статьи
 * впереди, не имеет права занимать это слово линтером. `check` остаётся псевдонимом и печатает,
 * чем его заменили: молча сломать чужой воркфлоу хуже, чем попросить поправить строку.
 */
import { ESLint } from "eslint";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname, resolve, relative } from "node:path";
import markdown from "@eslint/markdown";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";
import {
  checkStructure,
  formatStructure,
  asEslintResults,
} from "./structure.mjs";

import paperStages from "../eslint-rules/paper-stages.mjs";
import researchQuestion from "../eslint-rules/paper-research-question.mjs";
import typography from "../eslint-rules/paper-typography.mjs";
import texBuild from "../eslint-rules/tex-build.mjs";
import docFields from "../eslint-rules/doc-fields.mjs";
import findingsCause from "../eslint-rules/review-findings-cause.mjs";
import coldReadCause from "../eslint-rules/cold-read-cause.mjs";

const USAGE = `research-paper-pipeline — machine-checkable gates for a paper kept in git

  npx rpp init [dir]                  set the project up: writes rpp.json, prints what to paste
  npx rpp lint [paths…]               run every rule over your papers
  npx rpp hook <name>                 run an editor hook (the plugin wiring calls this)
  npx rpp --help

lint:
  npx rpp lint [paths…] [--config <file.json>] [--json]

  <paths…>            where your papers live, e.g. papers. Optional ONLY because rpp.json
                      declares it — one of the two must name the scope. There is no default
                      of ".": linting whatever happens to be in the checkout is how a green
                      report over a scope nobody chose gets produced.
  --config <file>     use this rpp.json instead of the discovered one
  --json              machine-readable findings on stdout, nothing else on it
  --max-warnings <n>  fail when warnings exceed n. Default -1: warnings never fail, because
                      most findings here are advisory and a gate that fails on advice gets muted

rpp.json — found by walking up from the current directory, the way every other tool in the
stack finds its config. \`papers\` is required; every other key is optional:

  {
    "papers":            "papers",
    "authorListCommand": "node scripts/bib-authors.mjs",
    "typographyDebt":    { "papers/my-paper": { "sectionSign": 12 } },
    "docFields":         { "read": { "values": ["full", "abstract", "none"] } },
    "reviewSince":       "2026-08-23",
    "minFindings":       3,
    "causeMarker":       "Cause:"
  }
`;

/** Конфиг, который иначе писал бы пользователь. Данные — из `opts`, механизм — здесь. */
export function buildConfig(opts = {}, texLanguage) {
  const paperRules = { ...researchQuestion.rules, ...typography.rules };
  const typographyOpt = ["warn", { debt: opts.typographyDebt ?? {} }];
  const md = {
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
  };

  const cfg = [
    {
      files: ["**/PIPELINE-STATUS.md"],
      plugins: { markdown, paper: paperStages },
      ...md,
      rules: {
        "paper/stages": "error",
        "paper/source": "error",
        "paper/author-list": [
          "warn",
          opts.authorListCommand ? { command: opts.authorListCommand } : {},
        ],
      },
    },
    {
      files: ["**/paper.md", "**/draft.md"],
      plugins: { markdown, paper: { rules: paperRules } },
      ...md,
      rules: {
        "paper/research-question": "warn",
        "paper/typography": typographyOpt,
      },
    },
    {
      files: ["**/reviews/*.md"],
      plugins: {
        markdown,
        review: { rules: { ...findingsCause.rules, ...coldReadCause.rules } },
        doc: docFields,
      },
      ...md,
      rules: {
        /*
         * 🔴 УМОЛЧАНИЕ АНГЛИЙСКОЕ С 2026-09-17. Стояло «Причина:» — русское слово в пакете,
         * интерфейс которого английский. Правило уровня `error` требовало от человека
         * дописать в свой файл кириллицу, а поменять пометку было нечем: `causeMarker`
         * не пробрасывался через CLI вовсе. Единственным выходом было бросить команду и
         * собирать конфиг ESLint руками — то есть дефект выталкивал ровно на тот путь,
         * от которого утилита избавляет.
         * Русская пометка осталась ВЫРАЗИМОЙ, но теперь как значение, а не как умолчание.
         */
        "review/findings-cause": [
          "error",
          {
            minFindings: opts.minFindings ?? 3,
            ...(opts.causeMarker ? { causeMarker: opts.causeMarker } : {}),
            ...(opts.reviewSince ? { sinceCreated: opts.reviewSince } : {}),
          },
        ],
        "review/cold-read-cause": [
          "warn",
          { ...(opts.causeMarker ? { causeMarker: opts.causeMarker } : {}) },
        ],
        ...(opts.docFields
          ? { "doc/fields": ["warn", { fields: opts.docFields }] }
          : {}),
      },
    },
  ];

  // `.tex` только если язык загрузился: он тянет парсер LaTeX, и падать из-за него на корпусе
  // без единого `.tex` было бы отказом в работе там, где работа возможна.
  if (texLanguage)
    cfg.push({
      files: ["**/paper.tex"],
      plugins: {
        tex: { languages: { latex: texLanguage }, rules: texBuild },
        paper: { rules: paperRules },
      },
      language: "tex/latex",
      rules: {
        "paper/research-question": "warn",
        "paper/typography": typographyOpt,
        "tex/future-promise": "warn",
        "tex/acm-frontmatter-override": "error",
      },
    });
  return cfg;
}

export function parseArgs(argv) {
  // `--help` разбирается ДО того, как argv[0] станет командой: иначе `rpp --help` отвечает
  // «unknown command `--help`» — поймано первым же прогоном утилиты.
  const out = {
    cmd: null,
    paths: [],
    config: null,
    json: false,
    // -1 = предупреждения НИКОГДА не валят прогон. В этом наборе большинство находок
    // советательные по замыслу, а гейт, падающий на совете, глушат целиком.
    maxWarnings: -1,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("-")) out.cmd = rest.shift();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--json") out.json = true;
    // `--options` was the first spelling and is kept working. It named the wrong thing — every
    // other tool in the stack calls this file its config — but a flag in someone's CI is not
    // ours to break.
    else if (a === "--config" || a === "--options") out.config = rest[++i];
    else if (a === "--max-warnings") out.maxWarnings = Number(rest[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
    else out.paths.push(a);
  }
  return out;
}

export const CONFIG_NAME = "rpp.json";

/**
 * 🔴 `rpp init` ПИСАЛ КОНФИГ, КОТОРЫЙ `rpp check` НЕ ЧИТАЛ НИКОГДА. Файл появлялся, команда
 * молчала, прогон шёл на умолчаниях — то есть настройка пользователя не действовала, и узнать
 * об этом было неоткуда: отсутствие долга типографики выглядит ровно как ноль долга.
 *
 * Поиск — вверх от текущего каталога до корня ФС, как это делают eslint, prettier, tsc и
 * остальные. Запуск из подкаталога статьи тогда видит тот же конфиг, что запуск из корня репо.
 */
export function findConfig(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * `rpp init` — единственный ответ на «а как это вообще запустить».
 *
 * 🔴 ЗАЧЕМ. До неё установка была РАССЫПАНА по README пятью кусками: поставь пакет · поставь
 * vigiles · набери две команды /plugin · вставь шаг в воркфлоу · сочини rpp.json по образцу.
 * Пять мест — это пять возможностей бросить, и ни одно из них не проверяемо.
 *
 * ⚠️ Чужие файлы НЕ ПЕРЕЗАПИСЫВАЕТ. Существующий rpp.json остаётся как есть, и команда об этом
 * говорит: молча затереть настройку пользователя хуже, чем не сделать ничего.
 */
export const RPP_JSON = `{
  "papers": "papers",
  "authorListCommand": "node scripts/bib-authors.mjs",
  "typographyDebt": {},
  "docFields": {},
  "minFindings": 3,
  "causeMarker": "Cause:"
}
`;

/**
 * Step 3 is now two lines, and both are typed inside Claude Code rather than in a terminal.
 *
 * The hook runtime (`vigiles`) arrives with this package as an ordinary dependency, so there is
 * nothing to install by hand. That replaced, in order: a copy-paste line, then a `--with-hooks`
 * flag, then a self-contained bundle — none of which were needed once the weight was measured
 * (127 MB for the whole install) and judged acceptable. The simplest thing that works was one
 * line in `dependencies`.
 */
export function nextSteps(papersDir = "papers") {
  const hooks = [
    `  3. optional — the three editor hooks, typed INSIDE Claude Code`,
    `       /plugin marketplace add zernie/research-paper-pipeline`,
    `       /plugin install research-paper-pipeline@research-paper-pipeline`,
    ``,
    `     Their runtime came with this package; there is nothing else to install.`,
    `     Skip this and everything above still works — the hooks are an in-editor guard.`,
  ];
  return [
    ``,
    `Next, in order:`,
    ``,
    `  1. lint your papers`,
    `       npx rpp lint`,
    ``,
    `  2. same check in CI — add this step to a workflow`,
    `       - uses: zernie/research-paper-pipeline@<commit-sha>`,
    `         with:`,
    `           paths: ${papersDir}`,
    ``,
    ...hooks,
    ``,
  ].join("\n");
}

export function init(dir, { log = console.log } = {}) {
  const target = join(dir, "rpp.json");
  if (existsSync(target))
    log(`rpp.json already there — kept as is, nothing overwritten`);
  else {
    writeFileSync(target, RPP_JSON, "utf8");
    log(
      `wrote ${target} — the three things only you can supply; every key is optional`,
    );
  }
  log(nextSteps("papers"));
  return 0;
}

/** `papers` may be one directory or several; both spellings normalise to a list. */
export function toPaths(papers) {
  if (typeof papers === "string") return papers.trim() ? [papers.trim()] : [];
  if (Array.isArray(papers))
    return papers.filter((x) => typeof x === "string" && x.trim());
  return [];
}

const hasPapers = (opts) => toPaths(opts.papers).length > 0;

/**
 * `rpp hook <name>` — запустить редакторский хук. Существует ради ОДНОЙ вещи: чтобы проводка
 * не адресовала рантайм от корня проекта.
 *
 * 🔴 ЧТО БЫЛО И ПОЧЕМУ ЭТО ЛОМАЛОСЬ. `hooks.json` звал
 *     node "${CLAUDE_PROJECT_DIR}/node_modules/vigiles/dist/cli.js" hook-runtime run-program …
 * Пока `vigiles` был PEER-зависимостью, этот путь ГАРАНТИРОВАЛСЯ: peer ставит сам потребитель,
 * в свой корень. После перевода в обычные зависимости гарантии не стало, и замер это показал —
 * один тарбол, два менеджера:
 *     npm:  node_modules/vigiles/dist/cli.js   ЕСТЬ
 *     pnpm: node_modules/vigiles/dist/cli.js   НЕТ (в корне только research-paper-pipeline)
 * Цена отказа несимметрична: `|| exit 2` стоял на PreToolUse(Bash), то есть денаилась ЛЮБАЯ
 * команда, включая ту, которой чинят.
 *
 * ЧТО ТЕПЕРЬ. Проводка зовёт СВОЙ бин — `research-paper-pipeline` прямая зависимость, поэтому
 * лежит в корне у любого менеджера, — а рантайм резолвится ОТ ПОЛОЖЕНИЯ ЭТОГО ФАЙЛА через
 * `createRequire`. Где бы менеджер ни разложил дерево, резолвер найдёт то же, что нашёл бы
 * `import` изнутри пакета.
 *
 * 🔴 И `|| exit 2` УБРАН ИЗ ОБОЛОЧКИ. Решение об остановке — это решение, и оно принимается
 * здесь, кодом. В shell оно означало «любая незадача = блокировать всё»: не нашёлся рантайм —
 * встала работа. Теперь ненайденный рантайм ГРОМКО жалуется и возвращает 0, а настоящий вердикт
 * хука (включая 2) проходит насквозь. Молчаливая деградация хуже явной, но блокировка всего
 * хуже обеих.
 */
export function runHook(
  name,
  {
    err = console.error,
    run = spawnSync,
    // Резолвер инъектируется, чтобы «рантайм не нашёлся» проверялось ассертом, а не сносом
    // node_modules: отказ обязан быть воспроизводим, а не обставляем.
    // 🔴 РЕЗОЛВИМ ПАКЕТ, А НЕ ФАЙЛ В НЁМ. `require.resolve("vigiles/dist/cli.js")` НЕ РАБОТАЕТ:
    // карта `exports` пакета отдаёт только «.» и девять именованных подпутей, а `./dist/cli.js`
    // и даже `./package.json` среди них нет —
    //     Package subpath './dist/cli.js' is not defined by "exports"
    // Это не наша оплошность и не их баг: закрытая карта экспортов — нормальная практика.
    // Поэтому резолвим корневой вход («.» → dist/test.js), берём его каталог и кладём рядом
    // `cli.js` — тот самый файл, который сам пакет объявляет своим `bin`.
    resolve = (spec) => createRequire(import.meta.url).resolve(spec),
  } = {},
) {
  if (!name) {
    err(`\`hook\` needs a name, e.g. \`rpp hook paper-edit-guard\``);
    return 2;
  }
  const program = fileURLToPath(
    new URL(`../hooks/${name}.hook.mjs`, import.meta.url),
  );
  if (!existsSync(program)) {
    err(`unknown hook \`${name}\` — no such program at ${program}`);
    return 2;
  }
  let runtime;
  try {
    runtime = join(dirname(resolve("vigiles")), "cli.js");
    if (!existsSync(runtime))
      throw new Error(`resolved vigiles, but no cli.js beside it: ${runtime}`);
  } catch {
    err(
      `rpp: the hook runtime (vigiles) is not resolvable from ${fileURLToPath(new URL(".", import.meta.url))}.\n` +
        `The \`${name}\` hook is NOT running. Everything else — \`rpp lint\`, CI — is unaffected.\n` +
        `Reinstall this package so its dependencies are present.`,
    );
    return 0;
  }
  const r = run(
    process.execPath,
    [runtime, "hook-runtime", "run-program", program],
    {
      stdio: "inherit",
    },
  );
  return r.status ?? 0;
}

export async function run(
  argv,
  { log = console.log, err = console.error, cwd = process.cwd() } = {},
) {
  const a = parseArgs(argv);
  if (a.help || !a.cmd) {
    log(USAGE);
    return a.help ? 0 : 2;
  }
  if (a.cmd === "init") return init(a.paths[0] ?? ".", { log });
  if (a.cmd === "hook") return runHook(a.paths[0], { err });
  if (a.cmd === "check")
    err(
      `\`check\` is now \`lint\` — running it anyway. Update the call to \`rpp lint\`.`,
    );
  if (a.cmd !== "lint" && a.cmd !== "check") {
    err(`unknown command \`${a.cmd}\`\n\n${USAGE}`);
    return 2;
  }

  // 🔴 КОНФИГ ИЩЕТСЯ САМ. Явный `--config` побеждает найденный — он назван вслух, и подмена
  // молчаливой не бывает.
  const configPath = a.config ?? findConfig(cwd);
  if (a.config && !existsSync(a.config)) {
    err(`config file not found: ${a.config}`);
    return 2;
  }

  let opts = {};
  if (configPath) {
    try {
      opts = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (e) {
      err(`${configPath} is not valid JSON: ${e.message}`);
      return 2;
    }
    // Найденный конфиг НАЗЫВАЕТСЯ вслух. Иначе прогон из чужого каталога подхватывает чужой
    // файл и об этом не говорит — а расхождение долга типографики выглядит как находка.
    //
    // 🔴 В РЕЖИМЕ `--json` — В stderr. Машинный вывод обязан быть ОДНИМ разбираемым документом:
    // строка перед массивом ломает любой `| jq`, а сломает она его у потребителя, не у нас.
    // Поймано не тестом, а попыткой подключить к этому выводу собственный экшен; в харнессе
    // я эту строку сначала ОБХОДИЛ (срезал первую строку перед JSON.parse) — то есть обход
    // прятал дефект ровно там, где он должен был кричать.
    (a.json ? err : log)(`config: ${relative(cwd, configPath) || CONFIG_NAME}`);
  }

  // 🔴 `papers` — ОБЯЗАТЕЛЬНОЕ ПОЛЕ. Каталог статей — единственное, без чего инструмент не
  // знает, над чем он работает, и единственное, чего нельзя угадать: умолчание "." прогоняет
  // правила по всему чекауту и выходит зелёным по охвату, который никто не выбирал.
  if (configPath && !hasPapers(opts)) {
    err(
      `${configPath} must declare \`papers\` — the directory your papers live in, e.g.\n` +
        `  { "papers": "papers" }\n` +
        `It is the one thing this tool cannot guess.`,
    );
    return 2;
  }

  // Аргумент командной строки ПЕРЕОПРЕДЕЛЯЕТ конфиг: одна статья из корпуса линтуется без
  // правки файла.
  //
  // 🔴 Путь ИЗ КОНФИГА резолвится относительно КАТАЛОГА КОНФИГА, а не текущего. Иначе подъём
  // вверх бессмыслен: из `papers/aisec-2026` файл нашёлся бы, а `"papers": "papers"` указал бы
  // на `papers/aisec-2026/papers`, которого нет, — и прогон упал бы «ничего не найдено» там,
  // где всё на месте. Аргумент командной строки остаётся относительно текущего каталога: его
  // набрали здесь и сейчас.
  const paths =
    a.paths.length > 0
      ? a.paths
      : toPaths(opts.papers).map((rel) => resolve(dirname(configPath), rel));
  if (paths.length === 0) {
    err(
      `nothing to lint: no path was given and no ${CONFIG_NAME} was found.\n` +
        `Run \`npx rpp init\` here, or pass the directory: \`rpp lint papers\`.`,
    );
    return 2;
  }

  // 🔴 СТРУКТУРА ПРОВЕРЯЕТСЯ ДО ESLint И ОТДЕЛЬНО ОТ НЕГО. Правило вызывается для поданного
  // файла; пропавший файл не подаётся, поэтому о пропаже не может сообщить никакое правило —
  // каталог без `PIPELINE-STATUS.md` просто не получает ни одного правила и отчитывается
  // чисто. Разбор, почему это не лечится плагином структуры для ESLint, — в `structure.mjs`.
  const structure = checkStructure(paths, opts.structure, { cwd });

  let texLanguage = null;
  try {
    ({ texLanguage } = await import("../eslint-rules/latex-language.mjs"));
  } catch {
    /* без парсера LaTeX работаем по markdown */
  }

  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: buildConfig(opts, texLanguage),
  });

  // 🔴 ESLint БРОСАЕТ на пустом наборе (`NoFilesFoundError`) — сторож ниже до этого просто не
  // доживал, что и показал первый же прогон по пустому каталогу: вместо внятного сообщения
  // вылетал стек из недр eslint-helpers.js. Отказ остаётся отказом, но объяснимым.
  let results;
  try {
    results = await eslint.lintFiles(paths);
  } catch (e) {
    if (
      e?.messageTemplate === "file-not-found" ||
      /No files matching/i.test(e?.message ?? "")
    )
      results = [];
    else throw e;
  }

  // 🔴 СТРАЖ ОТ ЗЕЛЁНОГО НОЛЯ, тот же, что в action.yml, и по той же причине: ESLint выходит с
  // нулём, когда находок нет, а «находок нет» побайтово неотличимо от «ни одному правилу не
  // досталось ни одного файла». Правило, чей глоб не совпал, не вызывается — и, не вызвавшись,
  // физически не может об этом сообщить.
  if (results.length === 0) {
    err(
      `nothing was linted under ${paths.map((x) => relative(cwd, x) || x).join(", ")} — no PIPELINE-STATUS.md, paper.md/tex or reviews/ found there. A clean report over zero files is not a clean report.`,
    );
    return 1;
  }

  if (a.json)
    log(JSON.stringify([...asEslintResults(structure), ...results], null, 1));
  else {
    // Пропажи печатаются ПЕРВЫМИ: они объясняют, почему отчёт ниже может быть подозрительно
    // коротким. Обратный порядок читался бы как «всё чисто, а, и ещё вот».
    if (structure.length > 0) log(formatStructure(structure));
    const out = await (await eslint.loadFormatter("stylish")).format(results);
    log(
      out.trim() ||
        (structure.length > 0
          ? ""
          : `✓ ${results.length} file(s) checked, no findings`),
    );
  }
  if (structure.length > 0 || results.some((r) => r.errorCount > 0)) return 1;
  // Предупреждения валят прогон только когда порог назван ЯВНО. Отрицательный порог —
  // «не считать вовсе», и это умолчание.
  if (a.maxWarnings >= 0) {
    const warnings = results.reduce((n, r) => n + r.warningCount, 0);
    if (warnings > a.maxWarnings) {
      err(
        `${warnings} warning(s) exceed the --max-warnings limit of ${a.maxWarnings}`,
      );
      return 1;
    }
  }
  return 0;
}

// 🔴 `isMain`, А НЕ СРАВНЕНИЕ СТРОК. Первая редакция писала
//     if (import.meta.url === `file://${process.argv[1]}`)
// и утилита, запущенная через `node_modules/.bin/rpp`, МОЛЧА ВЫХОДИЛА С НУЛЁМ: npm ставит туда
// СИМЛИНК, `process.argv[1]` остаётся путём симлинка, а `import.meta.url` — реальным путём, и
// условие ложно. То есть единственный способ, которым утилиту запускает настоящий потребитель,
// не работал вовсе — а выглядел как чистый прогон.
// Хелпер в пакете УЖЕ БЫЛ, и его докстринг описывает ровно этот отказ дословно: «turns a CLI
// into a no-op that exits 0». Написал руками то, что лежало готовым.
if (isMain(import.meta.url)) process.exit(await run(process.argv.slice(2)));
