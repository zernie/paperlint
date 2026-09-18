/**
 * Батарея на `build.ts` — модуль, решающий, ЧЕМ собирается статья.
 *
 * Заведена вместе с самим модулем и по требованию гейта `test:sabotage`, который отказался
 * принимать харнесс, который ничто не умеет убить: зелёный харнесс сам по себе не отличает
 * «проверка прошла» от «проверка не может упасть». Случай про `--dry-run` возвращает дефект,
 * который модуль РЕАЛЬНО имел в первой редакции и который переписал `paper.pdf` в рабочем
 * дереве, — то есть без этого ассерта регрессия была бы тихой и разрушительной.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "build.ts");
const HARNESS = join(HERE, "build.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "`--dry-run` снова проглатывается молча",
        harness: HARNESS,
        expect: "сухой прогон НЕ ЗАПУСКАЕТ скрипт — на диске нет следа",
        disables:
          "единственную половину, которую нельзя проверить по возвращённому объекту. " +
          "Настоящий дефект: флаг был разобран в CLI и передан сюда, а здесь его не " +
          "существовало — деструктуризация опций проглатывает неизвестный ключ МОЛЧА. " +
          "Сухой прогон отработал как полная сборка и переписал paper.pdf в рабочем дереве, " +
          "причём вывод pdflatex на экране легко принять за подробный dry-run",
        edits: [
          [
            SRC,
            '  if (dryRun)\n    return { dir, status: "built", script: found.rel, code: 0, dry: true };\n',
            "",
          ],
        ],
      },
      {
        name: "порядок кандидатов переставлен",
        harness: HARNESS,
        expect: "при обоих скриптах побеждает build.sh в корне статьи",
        disables:
          "решение о приоритете. `build.sh` стоит первым не по алфавиту, а потому что это " +
          "то, что автор видит, открыв каталог; молчаливый уход на repro/ собрал бы не тот " +
          "артефакт и не сказал бы об этом",
        edits: [
          [
            SRC,
            'export const BUILD_SCRIPTS = ["build.sh", "repro/build-submission.sh"];',
            'export const BUILD_SCRIPTS = ["repro/build-submission.sh", "build.sh"];',
          ],
        ],
      },
      {
        name: "интерпретатор для .py больше не выбирается",
        harness: HARNESS,
        expect: "скрипт на python запускается python3, а не bash",
        disables:
          "выбор интерпретатора по расширению. Он сделан по расширению, а не по биту " +
          "исполнения, именно чтобы свежий клон без +x не падал «Permission denied» по " +
          "причине, не имеющей отношения к статье",
        edits: [[SRC, '  if (ext === ".py") return ["python3", []];\n', ""]],
      },
      {
        name: "отсутствие скрипта перестало быть отдельным статусом",
        harness: HARNESS,
        expect: "статья без скрипта сборки — статус no-script, и это ОТКАЗ",
        disables:
          "ровно тот вопрос, ради которого команда и писалась: у какой статьи вообще нет " +
          "скрипта сборки. Корпус отвечал на него тишиной — две статьи из четырёх оказались " +
          "без скрипта, и узналось это первым же сухим прогоном",
        edits: [
          [
            SRC,
            'if (!found) return { dir, status: "no-script" };',
            'if (!found) return { dir, status: "built" };',
          ],
        ],
      },
      {
        name: "ненулевой код возврата больше не читается как падение",
        harness: HARNESS,
        expect: "упавшая сборка — статус failed, и код НАЗВАН",
        disables:
          "различие между собранным и упавшим. Сборка, отчитавшаяся успехом при красном " +
          "pdflatex, — это статья, которую отправят несобранной",
        edits: [[SRC, 'status: code === 0 ? "built" : "failed",', 'status: "built",']],
      },
    ],
  }),
);
