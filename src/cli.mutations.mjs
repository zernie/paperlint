/**
 * Батарея на утилиту. Три из пяти мутаций возвращают дефекты, которые она УЖЕ имела и которые
 * нашлись первым прогоном, а не чтением — значит без этих ассертов регрессия была бы тихой.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = join(HERE, "cli.ts");
const HARNESS = join(HERE, "cli.harness.mjs");
// Шим `bin/rpp.mjs` — ИСПОЛНЯЕМЫЙ файл пакета, и с переездом на TypeScript проверка «меня
// запустили или меня импортировали» живёт именно в нём: `dist/cli.js` теперь всегда
// импортируется, поэтому мутация в нём про симлинк ничего не доказывает. Первый прогон после
// переезда показал это буквально — мутация ВЫЖИЛА, и выглядело это как дыра в харнессе,
// хотя дыра была в том, куда мутация целилась.
const SHIM = join(HERE, "..", "bin", "rpp.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "проверка главного модуля снова сравнивает СТРОКИ",
        harness: HARNESS,
        expect: "через СИМЛИНК утилита работает, а не выходит молча нулём",
        disables:
          "единственный способ, которым утилиту зовёт потребитель. npm кладёт в .bin СИМЛИНК, " +
          "у которого process.argv[1] и import.meta.url — разные пути; при сравнении строк " +
          "условие ложно и утилита МОЛЧА выходит с нулём. Прямой `node bin/rpp.mjs` при этом " +
          "работает, поэтому дефект невидим тем способом, которым его обычно проверяют",
        edits: [[SHIM, "if (isMain(import.meta.url))", "if (import.meta.url === `file://${process.argv[1]}`)"]],
      },
      {
        name: "argv[0] снова становится командой безусловно",
        harness: HARNESS,
        expect: "`--help` первым аргументом — это ФЛАГ, а не команда",
        disables:
          "разбор флага в позиции команды. Настоящий дефект: `rpp --help` отвечало " +
          "«unknown command `--help`» — то есть первая команда, которую набирает новый " +
          "пользователь, сообщала, что её не существует",
        edits: [[CLI, 'if (rest[0] && !rest[0].startsWith("-")) out.cmd = rest.shift() ?? null;', "out.cmd = rest.shift() ?? null;"]],
      },
      {
        name: "охват снова получает умолчание",
        harness: HARNESS,
        expect: "`lint` без пути И без конфига отказывает и называет ОБА выхода",
        disables:
          "контракт «охват называет вызывающий». С умолчанием пользователь, не подумавший про " +
          "охват, получает зелёный прогон по тому, что случайно лежит в каталоге",
        edits: [[CLI, "if (paths.length === 0) {", "if (false) {"]],
      },
      {
        name: "СТРАЖ ОТ ЗЕЛЁНОГО НОЛЯ снимается",
        harness: HARNESS,
        expect: "пустой набор — ОТКАЗ, а не зелёный ноль",
        disables:
          "различение «находок нет» и «ни одному правилу не досталось ни одного файла». Эти два " +
          "состояния побайтово одинаковы на выходе, и второе читается как успех",
        edits: [[CLI, "if (results.length === 0) {", "if (false) {"]],
      },
      {
        name: "исключение ESLint снова не ловится",
        harness: HARNESS,
        expect: "утилита НЕ выпускает исключение наружу — отказ объявляется кодом возврата",
        disables:
          "объяснимость отказа. Настоящий дефект: на пустом наборе ESLint БРОСАЕТ " +
          "NoFilesFoundError, сторож до своей проверки не доживал, и вместо сообщения вылетал " +
          "стек из недр eslint-helpers.js",
        edits: [[CLI, '    if (\n      fail?.messageTemplate === "file-not-found" ||\n      /No files matching/i.test(fail?.message ?? "")\n    )\n      results = [];\n    else throw e;', "    throw e;"]],
      },
      {
        name: "данные потребителя перестают доезжать до правила",
        harness: HARNESS,
        expect: "команда из опций доезжает до правила",
        disables:
          "границу «механизм в пакете, данные у потребителя»: опция `authorListCommand` " +
          "игнорируется, и находка снова не говорит, ЧЕМ прогнать сверку",
        edits: [[CLI, "opts.authorListCommand ? { command: opts.authorListCommand } : {},", "{},"]],
      },
    ],
  }),
);
