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
import { readFileSync, existsSync } from "node:fs";
import markdown from "@eslint/markdown";

import paperStages from "../eslint-rules/paper-stages.mjs";
import researchQuestion from "../eslint-rules/paper-research-question.mjs";
import typography from "../eslint-rules/paper-typography.mjs";
import texBuild from "../eslint-rules/tex-build.mjs";
import docFields from "../eslint-rules/doc-fields.mjs";
import findingsCause from "../eslint-rules/review-findings-cause.mjs";
import coldReadCause from "../eslint-rules/cold-read-cause.mjs";

const USAGE = `research-paper-pipeline — machine-checkable gates for a paper kept in git

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
    "minFindings":       3
  }
`;

/** Конфиг, который иначе писал бы пользователь. Данные — из `opts`, механизм — здесь. */
export function buildConfig(opts = {}, texLanguage) {
  const paperRules = { ...researchQuestion.rules, ...typography.rules };
  const typographyOpt = ["warn", { debt: opts.typographyDebt ?? {} }];
  const md = { language: "markdown/gfm", languageOptions: { frontmatter: "yaml" } };

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
      rules: { "paper/research-question": "warn", "paper/typography": typographyOpt },
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
        "review/findings-cause": [
          "error",
          { minFindings: opts.minFindings ?? 3, ...(opts.reviewSince ? { sinceCreated: opts.reviewSince } : {}) },
        ],
        "review/cold-read-cause": "warn",
        ...(opts.docFields ? { "doc/fields": ["warn", { fields: opts.docFields }] } : {}),
      },
    },
  ];

  // `.tex` только если язык загрузился: он тянет парсер LaTeX, и падать из-за него на корпусе
  // без единого `.tex` было бы отказом в работе там, где работа возможна.
  if (texLanguage)
    cfg.push({
      files: ["**/paper.tex"],
      plugins: { tex: { languages: { latex: texLanguage }, rules: texBuild }, paper: { rules: paperRules } },
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
  const out = { cmd: null, paths: [], options: null, json: false };
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

export async function run(argv, { log = console.log, err = console.error } = {}) {
  const a = parseArgs(argv);
  if (a.help || !a.cmd) { log(USAGE); return a.help ? 0 : 2; }
  if (a.cmd !== "check") { err(`unknown command \`${a.cmd}\`\n\n${USAGE}`); return 2; }
  // Тот же контракт, что у экшена: охват называет вызывающий. Умолчание "." дало бы зелёный
  // прогон по тому, что случайно лежит рядом.
  if (a.paths.length === 0) { err(`\`check\` needs at least one path, e.g. \`check papers\`\n\n${USAGE}`); return 2; }

  let opts = {};
  if (a.options) {
    if (!existsSync(a.options)) { err(`options file not found: ${a.options}`); return 2; }
    try { opts = JSON.parse(readFileSync(a.options, "utf8")); }
    catch (e) { err(`options file is not valid JSON: ${e.message}`); return 2; }
  }

  let texLanguage = null;
  try { ({ texLanguage } = await import("../eslint-rules/latex-language.mjs")); }
  catch { /* без парсера LaTeX работаем по markdown */ }

  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: buildConfig(opts, texLanguage) });

  // 🔴 ESLint БРОСАЕТ на пустом наборе (`NoFilesFoundError`) — сторож ниже до этого просто не
  // доживал, что и показал первый же прогон по пустому каталогу: вместо внятного сообщения
  // вылетал стек из недр eslint-helpers.js. Отказ остаётся отказом, но объяснимым.
  let results;
  try {
    results = await eslint.lintFiles(a.paths);
  } catch (e) {
    if (e?.messageTemplate === "file-not-found" || /No files matching/i.test(e?.message ?? "")) results = [];
    else throw e;
  }

  // 🔴 СТРАЖ ОТ ЗЕЛЁНОГО НОЛЯ, тот же, что в action.yml, и по той же причине: ESLint выходит с
  // нулём, когда находок нет, а «находок нет» побайтово неотличимо от «ни одному правилу не
  // досталось ни одного файла». Правило, чей глоб не совпал, не вызывается — и, не вызвавшись,
  // физически не может об этом сообщить.
  if (results.length === 0) {
    err(`nothing was linted under ${a.paths.join(", ")} — no PIPELINE-STATUS.md, paper.md/tex or reviews/ found there. A clean report over zero files is not a clean report.`);
    return 1;
  }

  if (a.json) log(JSON.stringify(results, null, 1));
  else {
    const out = await (await eslint.loadFormatter("stylish")).format(results);
    log(out.trim() || `✓ ${results.length} file(s) checked, no findings`);
  }
  return results.some((r) => r.errorCount > 0) ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await run(process.argv.slice(2)));
