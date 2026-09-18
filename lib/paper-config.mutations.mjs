/**
 * Батарея на `lib/paper-config.mjs` и сверку его носителей.
 *
 * Предмет — согласие нескольких файлов об одном значении. Отказ здесь тихий по построению:
 * разъехавшийся ключ не ломает ни сборку, ни запуск, он лишь заставляет один носитель читать
 * настройки, которых потребитель не писал. Каждый случай ниже возвращает такое расхождение.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "./mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const HARNESS = join(HERE, "paper-config.harness.mjs");
const SOURCE = join(HERE, "paper-config.mjs");
const HOOK = join(ROOT, "hooks", "paper-skills-nudge.hook.mjs");
const RULE = join(ROOT, "eslint-rules", "papers.mjs");
const DOCTOR = join(ROOT, "src", "doctor.ts");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "ключ в одном из хуков разъезжается",
        harness: HARNESS,
        expect: "все носители согласны о CONFIG_KEY",
        disables:
          "смысл вынужденного дублирования. Хук с чужим ключом читает настройки, которых " +
          "потребитель не писал, берёт умолчание и сторожит не тот каталог — молча, потому " +
          "что молчание и есть его успех",
        edits: [
          [
            HOOK,
            'export const CONFIG_KEY = "research-paper-pipeline";',
            'export const CONFIG_KEY = "research-paper-pipelines";',
          ],
        ],
      },
      {
        name: "правило ESLint снова заводит СВОЮ копию умолчания",
        harness: HARNESS,
        expect: "все носители согласны о DEFAULT_PAPERS_ROOT",
        disables:
          "ре-экспорт, ради которого консолидация и делалась. Собственная копия в не-хуке не " +
          "нужна ничему: ограничение на импорты его не касается — и ровно такая копия два дня " +
          "лежала ВНЕ сверки, потому что сверка сравнивала хуки между собой",
        edits: [
          [
            RULE,
            'export { DEFAULT_PAPERS_ROOT } from "../lib/paper-config.mjs";',
            'export const DEFAULT_PAPERS_ROOT = "drafts";',
          ],
        ],
      },
      {
        name: "ключ конфига перестаёт быть именем пакета",
        harness: HARNESS,
        expect: "ключ конфига равен имени пакета",
        disables:
          "связь между тем, как пакет называется, и тем, под каким именем потребитель объявляет " +
          "его настройки. Разойдутся при переименовании пакета: документация скажет одно, " +
          "читаться будет другое, и ошибки не будет ни одной",
        edits: [
          [
            SOURCE,
            'export const CONFIG_KEY = "research-paper-pipeline";',
            'export const CONFIG_KEY = "rpp";',
          ],
        ],
      },
      {
        name: "хук протаскивает способность мимо словаря",
        harness: HARNESS,
        expect: "не тянет ничего вне словаря хуков",
        disables:
          "единственную гарантию, ради которой хуки и терпят дублирование: способности хука " +
          "равны его API-поверхности. Хук, дотянувшийся до `node:fs`, запускается и проходит " +
          "сверку значений — нарушение видно только этой проверкой",
        edits: [
          [
            HOOK,
            'import { experimental_defineReact',
            'import { readFileSync } from "node:fs";\nimport { experimental_defineReact',
          ],
        ],
      },
      {
        name: "константа вписывается в шестой файл вместо импорта",
        harness: HARNESS,
        expect: "ни одного объявления вне списка носителей",
        disables:
          "проверку ПОЛНОТЫ. Список носителей явный, поэтому новая копия, заведённая где угодно " +
          "ещё, сравнивалась бы не с чем — и именно так дублирование расползлось в прошлый раз",
        edits: [
          [
            DOCTOR,
            'import { papersRoot, CONFIG_KEY, DEFAULT_PAPERS_ROOT } from "../hooks/paper-edit-guard.hook.mjs";',
            'import { papersRoot, DEFAULT_PAPERS_ROOT } from "../hooks/paper-edit-guard.hook.mjs";\nconst CONFIG_KEY = "research-paper-pipeline";',
          ],
        ],
      },
      {
        name: "обход полноты перестаёт заглядывать к хукам",
        harness: HARNESS,
        expect: "сам поиск не пуст",
        disables:
          "сторож от ЛОЖНОГО НУЛЯ. Поиск, не нашедший ничего, выглядит как чистый корпус; без " +
          "этого ассерта проверка полноты, начав искать не там, отчитывалась бы порядком",
        edits: [
          [
            HARNESS,
            'const skip = new Set(["node_modules", ".git", "dist", "_build", "fixtures", "repro"]);',
            'const skip = new Set(["node_modules", ".git", "dist", "_build", "fixtures", "repro", "hooks", "lib"]);',
          ],
        ],
      },
    ],
  }),
);
