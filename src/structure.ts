/**
 * `rpp lint` — половина, которую ESLint не может сделать ПО ПОСТРОЕНИЮ: проверка, что нужный
 * файл ЕСТЬ.
 *
 * 🔴 ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ ПРАВИЛО. Правило вызывается для файла, который линтеру
 * подали. Файл, которого нет, не подаётся никогда — значит правило не вызывается и, не
 * вызвавшись, физически не может сообщить о пропаже. Каталог статьи без `PIPELINE-STATUS.md`
 * не даёт НИ ОДНОЙ находки: по нему не бежит ни одно правило пайплайна, и прогон зелёный.
 * Это ровно тот зелёный ноль, ради которого в CLI стоит сторож `nothing was linted`, только
 * на уровень ниже — не «ничего не линтовалось», а «здесь линтовалось не всё».
 *
 * ⚠️ ЭТО НЕ РАБОТА ls-lint, И ЭТО НЕ ВЗАИМОЗАМЕНЯЕМО. ls-lint судит ИМЕНА файлов, которые
 * существуют (`versions/2026-07-22-submitted.pdf` названо по схеме). Про файл, которого нет,
 * он не говорит ничего — ему нечего сопоставлять. Две половины структуры:
 *     ls-lint     — «то, что лежит, названо правильно»
 *     этот модуль — «то, что положено, лежит»
 *
 * 🔴 ОБНАРУЖЕНИЕ ЩЕДРОЕ, ТРЕБОВАНИЯ СТРОГИЕ — и это ради ложных срабатываний. Правило уровня
 * error, падающее на корректном дереве, не чинят, его выключают, и вместе с ним уходят
 * настоящие находки. Поэтому каталог считается статьёй, только если в нём УЖЕ лежит хоть один
 * маркер пайплайна; `research/`, `plans/` и прочие соседи по корпусу не трогаются вовсе.
 */
import { readdirSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import type { StructureConfig, StructureFinding } from "./types.ts";

/** Требования после наложения конфига потребителя на умолчания. */
type Rules = Required<StructureConfig>;

/**
 * Умолчания ЗАМЕРЕНЫ по живому корпусу из пяти каталогов статей, а не выбраны по вкусу: при
 * них он проходит целиком — ноль находок. Прогнан и встречный случай: `paper.pdf`, добавленный
 * в `require`, даёт сразу две находки на статьях, с которыми всё в порядке, — две из четырёх
 * держат pdf под другим именем. Поэтому его в умолчаниях нет; объявленные pdf и без того
 * сверяются побайтово правилом `paper/stages`.
 */
export const STRUCTURE_DEFAULTS = {
  markers: ["PIPELINE-STATUS.md", "paper.tex", "paper.md", "venue.json"],
  require: ["PIPELINE-STATUS.md"],
  requireOneOf: [["paper.tex", "paper.md"]],
  ignore: [],
};

/** Конфиг потребителя поверх умолчаний; `structure: false` выключает проверку целиком. */
export function structureRules(
  structure: StructureConfig | false | undefined,
): Rules | null {
  if (structure === false) return null;
  return { ...STRUCTURE_DEFAULTS, ...(structure ?? {}) };
}

const dirsIn = (dir: string): string[] => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    // Несуществующий каталог — не наша забота: об этом громко скажет сторож пустого набора.
    return [];
  }
};

/**
 * @returns {{file: string, message: string}[]} находки, по одной на пропавший файл.
 */
export function checkStructure(
  paths: readonly string[],
  structure: StructureConfig | false | undefined,
  { cwd = process.cwd() }: { cwd?: string } = {},
): StructureFinding[] {
  const rules = structureRules(structure);
  if (!rules) return [];
  const findings: StructureFinding[] = [];
  const say = (p: string): string => relative(cwd, p) || p;

  for (const root of paths) {
    for (const name of dirsIn(root)) {
      if (rules.ignore.includes(name)) continue;
      const dir = join(root, name);

      // Щедрое обнаружение: без единого маркера это просто соседний каталог, а не статья.
      if (!rules.markers.some((m: string) => existsSync(join(dir, m)))) continue;

      for (const required of rules.require)
        if (!existsSync(join(dir, required)))
          findings.push({
            file: say(dir),
            message: `missing \`${required}\` — ${whyMissingMatters(required, basename(dir))}`,
          });

      for (const group of rules.requireOneOf)
        if (!group.some((f: string) => existsSync(join(dir, f))))
          findings.push({
            file: say(dir),
            message: `missing all of ${group.map((f: string) => `\`${f}\``).join(", ")} — a paper directory with no source is not something the rules can check`,
          });
    }
  }
  return findings;
}

/**
 * Сообщение НАЗЫВАЕТ ПОСЛЕДСТВИЕ, а не повторяет условие. «missing PIPELINE-STATUS.md» без
 * второй половины читается как придирка к оформлению; с ней видно, что каталог не проверяется
 * вовсе, а отчёт по нему зелёный.
 */
function whyMissingMatters(file: string, dirName: string): string {
  if (file === "PIPELINE-STATUS.md")
    return `every pipeline rule keys off this file, so \`${dirName}\` currently gets ZERO rules and reports clean`;
  return `declared as required in rpp.json`;
}

export function formatStructure(findings: readonly StructureFinding[]): string {
  const byDir = new Map<string, string[]>();
  for (const f of findings)
    byDir.set(f.file, [...(byDir.get(f.file) ?? []), f.message]);
  return [...byDir]
    .map(([dir, msgs]) =>
      [dir, ...msgs.map((m) => `  error  ${m}`)].join("\n"),
    )
    .join("\n\n");
}

/**
 * 🔴 ОДНА СХЕМА НА ОБЕ ПОЛОВИНЫ. Находки о пропаже отдаются в ТОЙ ЖЕ форме, что и находки
 * ESLint, поэтому `--json` остаётся одним разбираемым массивом. Отдельный канал заставил бы
 * каждого потребителя писать второй парсер — и первый же, кто его не написал бы, читал бы
 * «структурных находок нет» вместо «я их не разбираю».
 */
export function asEslintResults(findings: readonly StructureFinding[]): unknown[] {
  const byDir = new Map<string, string[]>();
  for (const f of findings)
    byDir.set(f.file, [...(byDir.get(f.file) ?? []), f.message]);
  return [...byDir].map(([filePath, msgs]) => ({
    filePath,
    messages: msgs.map((message: string) => ({
      ruleId: "structure/required-file",
      severity: 2,
      message,
      line: 0,
      column: 0,
    })),
    errorCount: msgs.length,
    fatalErrorCount: 0,
    warningCount: 0,
    fixableErrorCount: 0,
    fixableWarningCount: 0,
    suppressedMessages: [],
    usedDeprecatedRules: [],
  }));
}
