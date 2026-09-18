/**
 * Батарея на `structure.ts` — единственную проверку пакета, предмет которой ОТСУТСТВИЕ файла.
 *
 * Такая проверка особенно уязвима к тихому отказу: она сообщает о том, чего нет, поэтому
 * сломанная выглядит ровно как чистый корпус. Батарея заведена по требованию `test:sabotage`,
 * который отказался принимать харнесс, который ничто не умеет убить.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "structure.ts");
const HARNESS = join(HERE, "structure.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "щедрое обнаружение отменено — статьёй считается любой каталог",
        harness: HARNESS,
        expect: "каталог БЕЗ единого маркера пайплайна не трогается вовсе",
        disables:
          "условие, по которому проверка вообще решает, что перед ней статья. Без него " +
          "находки посыпались бы на `data/`, `figures/` и любой соседний каталог — а правило, " +
          "ругающееся на невиновных, выключают целиком, вместе с настоящими находками",
        edits: [
          [
            SRC,
            "      if (!rules.markers.some((m: string) => existsSync(join(dir, m)))) continue;",
            "      if (false) continue;",
          ],
        ],
      },
      {
        name: "`ignore` перестал сниматься",
        harness: HARNESS,
        expect: "`ignore` снимает каталог поимённо",
        disables:
          "единственный способ потребителя сказать «этот каталог — не статья». Без него " +
          "исключение приходится выражать переименованием каталога",
        edits: [
          [SRC, "      if (rules.ignore.includes(name)) continue;\n", ""],
        ],
      },
      {
        name: "вторая принимаемая форма исходника выпала из умолчаний",
        harness: HARNESS,
        expect: "`paper.md` засчитывается наравне с `paper.tex`",
        disables:
          "вторую форму исходника, которую держит живой корпус. Статья на `paper.md` стала " +
          "бы находкой «нет исходника» при исходнике на месте — то есть проверка ругалась бы " +
          "на невиновных, а такие правила выключают целиком, вместе с настоящими находками",
        edits: [
          [SRC, 'requireOneOf: [["paper.tex", "paper.md"]]', 'requireOneOf: [["paper.tex"]]'],
        ],
      },
      {
        name: "путь в находке снова абсолютный",
        harness: HARNESS,
        expect: "и путь ОТНОСИТЕЛЬНЫЙ",
        disables:
          "читаемость находки. Абсолютный путь временного каталога прогона читателю не " +
          "говорит ничего и вдобавок делает вывод непригодным для сравнения между машинами",
        edits: [
          [
            SRC,
            "  const say = (p: string): string => relative(cwd, p) || p;",
            "  const say = (p: string): string => p;",
          ],
        ],
      },
    ],
  }),
);
