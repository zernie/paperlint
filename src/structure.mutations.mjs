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
        expect: "каталог без единого маркера пайплайна не трогается вовсе",
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
        expect: "названный в `ignore` каталог не даёт находок",
        disables:
          "единственный способ потребителя сказать «этот каталог — не статья». Без него " +
          "исключение приходится выражать переименованием каталога",
        edits: [
          [SRC, "      if (rules.ignore.includes(name)) continue;\n", ""],
        ],
      },
      {
        name: "`requireOneOf` требует ВСЕ формы разом, а не одну из",
        harness: HARNESS,
        expect: "`paper.md` засчитывается наравне с `paper.tex`",
        disables:
          "смысл группы «одно из». Живой корпус держит обе формы исходника, поэтому " +
          "требование обеих сразу дало бы находку на каждой статье — то есть проверка " +
          "кричала бы всегда и перестала бы что-либо значить",
        edits: [
          [
            SRC,
            "        if (!group.some((f: string) => existsSync(join(dir, f))))",
            "        if (!group.every((f: string) => existsSync(join(dir, f))))",
          ],
        ],
      },
      {
        name: "путь в находке снова абсолютный",
        harness: HARNESS,
        expect: "находка называет каталог ОТНОСИТЕЛЬНЫМ путём",
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
