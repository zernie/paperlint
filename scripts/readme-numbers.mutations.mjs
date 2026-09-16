/**
 * Батарея на `check:readme` — четыре мутации, и три из них возвращают ДЕФЕКТЫ, которые этот
 * скрипт уже совершал. Батарея здесь не формальность: проверка чисел, которая сама считает
 * неверно, печатает зелёную галочку под неправильным числом — то есть ровно то, что она
 * существует предотвращать.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "readme-numbers.mjs");
const HARNESS = join(HERE, "readme-numbers.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        // 🔴 ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ МУТАЦИИ ВЫЖИЛА, и это была находка о ХАРНЕССЕ. Она снимала
        // страж `isSymbolicLink()` и ждала, что удвоится счёт по ссылке на КАТАЛОГ — а он не
        // удваивается и без стража: `lstat` не считает ссылку каталогом, так что обход в неё
        // не заходит. Несущее там — `lstatSync` вместо `statSync`, и мутация теперь бьёт
        // именно туда, двумя правками сразу (импорт и вызов).
        name: "обход снова идёт ПО СИМЛИНКАМ (statSync вместо lstatSync)",
        harness: HARNESS,
        expect: "СИМЛИНК на каталог не удваивает счёт — это не новый каталог",
        disables:
          "различение «каталог» и «ссылка на каталог». Настоящий дефект: 24 ссылки " +
          "`.claude/skills/*` → `skills/*` давали 83 харнесса вместо 49, и число выглядело " +
          "просто большим, а не неверным",
        edits: [
          [SRC, 'import { readdirSync, readFileSync, lstatSync } from "node:fs";',
                'import { readdirSync, readFileSync, lstatSync, statSync } from "node:fs";'],
          [SRC, "const st = lstatSync(p);", "const st = statSync(p);"],
        ],
      },
      {
        name: "страж ссылки на ФАЙЛ снимается",
        harness: HARNESS,
        expect: "СИМЛИНК на файл-харнесс тоже не удваивает счёт",
        disables:
          "вторую половину, которую первая редакция батареи пропустила: ссылка на файл с " +
          "подходящим суффиксом проходит `endsWith` и считается вторым файлом. Пара с " +
          "предыдущей мутацией доказывает, что оба стража живые, а не один из них — мёртвый код",
        edits: [[SRC, "if (st.isSymbolicLink()) continue;", ""]],
      },
      {
        name: "неизвестная форма модуля снова ПРОПУСКАЕТСЯ молча",
        harness: HARNESS,
        expect: "модуль неизвестной формы — ОШИБКА, а не тихий пропуск",
        disables:
          "решение, что непонятый модуль — ошибка. Настоящий дефект: `tex-build.mjs` " +
          "экспортирует правила прямо в `default`, попал в «не плагин» и унёс два правила — " +
          "счётчик уверенно напечатал 8 вместо 10",
        edits: [[SRC, "if (unknown.length) {", "if (false) {"]],
      },
      {
        name: "суффикс батареи перестаёт требовать точку",
        harness: HARNESS,
        expect: "`run-mutations.mjs` не батарея — суффикс требует точку",
        disables:
          "различение батареи и ДРАЙВЕРА батарей. `scripts/run-mutations.mjs` кончается на " +
          "`mutations.mjs`, и без точки он считается батареей — так `git grep` давал 27 вместо 26",
        edits: [[SRC, 'else if (e.endsWith(suffix)) n++;', 'else if (e.includes(suffix.slice(1))) n++;']],
      },
      {
        name: "число СЛОВОМ снова считается объявлением",
        harness: HARNESS,
        expect: "число словом объявлением не считается",
        disables:
          "то, ради чего пометки вообще введены. README нёс «Forty-five of those» — форму, " +
          "которую нечем сравнить, поэтому расхождение 45 против 49 прожило незамеченным. " +
          "Мутация принимает любое слово за объявление, и проверка снова перестаёт что-либо " +
          "утверждать",
        edits: [
          [
            SRC,
            "/<!--\\s*count:([a-z]+)\\s*-->\\s*(\\d+)/g",
            "/(?:<!--\\s*count:([a-z]+)\\s*-->\\s*(\\d+)|(Forty)-(five))/g",
          ],
        ],
      },
    ],
  }),
);
