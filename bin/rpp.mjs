#!/usr/bin/env node
/**
 * `research-paper-pipeline check <paths…>` — прогнать все правила по корпусу статей.
 *
 * 🔴 ЗАЧЕМ ЭТА УТИЛИТА СУЩЕСТВУЕТ. До неё «установка» означала: поставь пакет И НАПИШИ РУКАМИ
 * шестьдесят строк flat-конфига ESLint, перечислив десять правил, три языка и четыре блока
 * `files`. То есть инструмент вываливал свою реализацию на пользователя: чтобы посчитать байты
 * pdf, надо было сперва узнать, что такое `language: "tex/latex"`. Под ESLint правила по-прежнему
 * бегут — но это ВНУТРЕННЕЕ устройство, и знать его для запуска больше не нужно.
 *
 * Два входа в инструмент, и оба теперь целые:
 *     npx research-paper-pipeline check papers      ← здесь
 *     uses: zernie/research-paper-pipeline@<sha>    ← action.yml
 *
 * ⚠️ ГРАНИЦА, КОТОРУЮ УТИЛИТА НЕ ИМЕЕТ ПРАВА СТЕРЕТЬ: данные потребителя остаются у потребителя.
 * Долг типографики, маркер прогона сверки авторов, словарь полей — всё это про ОДИН корпус, и
 * зашивать их в пакет значило бы повторить дефект, из-за которого в сообщении правила стоял путь
 * `.claude/skills/verify-citations/...`. Поэтому они приходят файлом `--options`.
 */
import { ESLint } from "eslint";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import markdown from "@eslint/markdown";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";

import paperStages from "../eslint-rules/paper-stages.mjs";
import researchQuestion from "../eslint-rules/paper-research-question.mjs";
import typography from "../eslint-rules/paper-typography.mjs";
import texBuild from "../eslint-rules/tex-build.mjs";
import docFields from "../eslint-rules/doc-fields.mjs";
import findingsCause from "../eslint-rules/review-findings-cause.mjs";
import coldReadCause from "../eslint-rules/cold-read-cause.mjs";

const USAGE = `research-paper-pipeline — machine-checkable gates for a paper kept in git

  npx rpp init [dir]                  set the project up: writes rpp.json, prints what to paste
  npx rpp check <paths…>              run every rule over your papers
  npx rpp --help

check:
  npx research-paper-pipeline check <paths…> [--options <file.json>] [--json]

  <paths…>            where your papers live, e.g. papers  (REQUIRED, no default:
                      a default of "." lints whatever happens to be in the checkout)
  --options <file>    JSON with the data only you can supply — see "options" below
  --json              machine-readable findings instead of the human report

options file (every key optional):
  {
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
    options: null,
    json: false,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("-")) out.cmd = rest.shift();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--json") out.json = true;
    else if (a === "--options") out.options = rest[++i];
    else if (a === "--help" || a === "-h") out.help = true;
    else out.paths.push(a);
  }
  return out;
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
  "authorListCommand": "node scripts/bib-authors.mjs",
  "typographyDebt": {},
  "docFields": {},
  "minFindings": 3,
  "causeMarker": "Cause:"
}
`;

/**
 * Step 3 must not send anyone to `/plugin install` before the runtime is there.
 *
 * 🔴 A plugin whose hooks cannot load is worse than no plugin. Claude Code's own contract says
 * «a failed or skipped install never blocks the plugin», so the hooks would die on
 * `Cannot find module` and nothing would say so — the exact shape this project spent a day
 * fixing upstream. So the `/plugin` lines appear only once vigiles is on disk.
 *
 * ⚠️ The manual `npm i -D vigiles` above is still wrong and is still here: 93 MB measured in a
 * clean project, charged to people who only ever lint. A `--with-hooks` flag was written and
 * WITHDRAWN — a flag is one more action, not one fewer. Replacing the runtime dependency
 * outright is the open work.
 */
export function nextSteps(papersDir = "papers", { hooksReady = false } = {}) {
  const hooks = hooksReady
    ? [
        `  3. the three editor hooks — vigiles is installed, so only the wiring is left`,
        `       /plugin marketplace add zernie/research-paper-pipeline`,
        `       /plugin install research-paper-pipeline@research-paper-pipeline`,
      ]
    : [
        `  3. optional — the three editor hooks for Claude Code need a runtime first`,
        `       npm i -D vigiles      (~93 MB; nothing above uses it)`,
        ``,
        `     Skip it and everything above still works: the hooks are an in-editor guard,`,
        `     the rules and the CLI do not use vigiles at all.`,
      ];
  return [
    ``,
    `Next, in order:`,
    ``,
    `  1. check your papers`,
    `       npx rpp check ${papersDir}`,
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
  // Already present counts as ready: re-installing what is there would spend the 93 MB twice.
  let hooksReady = existsSync(join(dir, "node_modules", "vigiles"));
  log(nextSteps("papers", { hooksReady }));
  return 0;
}

export async function run(
  argv,
  { log = console.log, err = console.error } = {},
) {
  const a = parseArgs(argv);
  if (a.help || !a.cmd) {
    log(USAGE);
    return a.help ? 0 : 2;
  }
  if (a.cmd === "init") return init(a.paths[0] ?? ".", { log });
  if (a.cmd !== "check") {
    err(`unknown command \`${a.cmd}\`\n\n${USAGE}`);
    return 2;
  }
  // Тот же контракт, что у экшена: охват называет вызывающий. Умолчание "." дало бы зелёный
  // прогон по тому, что случайно лежит рядом.
  if (a.paths.length === 0) {
    err(`\`check\` needs at least one path, e.g. \`check papers\`\n\n${USAGE}`);
    return 2;
  }

  let opts = {};
  if (a.options) {
    if (!existsSync(a.options)) {
      err(`options file not found: ${a.options}`);
      return 2;
    }
    try {
      opts = JSON.parse(readFileSync(a.options, "utf8"));
    } catch (e) {
      err(`options file is not valid JSON: ${e.message}`);
      return 2;
    }
  }

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
    results = await eslint.lintFiles(a.paths);
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
      `nothing was linted under ${a.paths.join(", ")} — no PIPELINE-STATUS.md, paper.md/tex or reviews/ found there. A clean report over zero files is not a clean report.`,
    );
    return 1;
  }

  if (a.json) log(JSON.stringify(results, null, 1));
  else {
    const out = await (await eslint.loadFormatter("stylish")).format(results);
    log(out.trim() || `✓ ${results.length} file(s) checked, no findings`);
  }
  return results.some((r) => r.errorCount > 0) ? 1 : 0;
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
