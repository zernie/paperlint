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
// `init` перестал быть двадцатью строками внутри `cli.ts` и стал своим модулем: у него четыре
// решения, и каждое обязано уметь сломаться так, чтобы это заметил ИМЕННО свой ассерт.
const INIT = join(HERE, "init.ts");

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
        name: "флаг без значения снова молча превращается в умолчание",
        harness: HARNESS,
        expect: "флаг без значения — ОТКАЗ, а не тихое умолчание",
        disables:
          "различие между «конфиг не задан» и «конфиг задан, но значение потерялось». Второе " +
          "случается от опечатки и от подстановки в CI, схлопнувшейся в пустоту, и без отказа " +
          "прогон уходит в автопоиск и линтует ЧУЖОЙ файл, ничего об этом не сказав",
        edits: [[CLI, "  if (a.missingValue) {", "  if (false) {"]],
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
        name: "декларация снова не доезжает до package.json",
        harness: HARNESS,
        expect: "🔴 ДЕКЛАРАЦИЯ ПОЯВЛЯЕТСЯ В package.json — том файле, который читают хуки",
        disables:
          "то, ради чего команда переписана (#33). Хук не импортирует код и не ходит вверх по " +
          "дереву — он читает путь, который в состоянии назвать, и это package.json. Без записи " +
          "туда установка выглядит удавшейся, а `paper-edit-guard` сторожит умолчание",
        edits: [[INIT, '  writeFileSync(path, JSON.stringify(pkg, null, 2) + (raw.endsWith("\\n") ? "\\n" : ""), "utf8");', "  void pkg;"]],
      },
      {
        name: "каталог статей снова УГАДЫВАЕТСЯ, а не измеряется",
        harness: HARNESS,
        expect: "🔴 и её значение ИЗМЕРЕНО, а не взято из умолчания `papers`",
        disables:
          "замер вместо догадки. Декларация при этом ПИШЕТСЯ — то есть отказ односторонний и в " +
          "сторону уверенного неверного ответа: в файле стоит `papers`, статьи лежат в другом " +
          "месте, и обе команды об этом молчат",
        edits: [[INIT, "  const candidates = detectPapers(root);", "  const candidates = [];"]],
      },
      {
        name: "чужое значение в декларации снова перезаписывается",
        harness: HARNESS,
        expect:
          "🔴 уже объявленное значение ЦЕЛО побайтово — молча заменить настройку хуже, чем не делать ничего",
        disables:
          "запрет на тихую замену настройки потребителя. Он продолжает верить прежнему значению, " +
          "потому что об изменении ему не сказали",
        edits: [[INIT, "  if (existing !== undefined) return { status: \"kept\", path, papers: existing };", "  if (false) return { status: \"kept\", path, papers: existing };"]],
      },
      {
        name: "init снова СОЗДАЁТ второй носитель rpp.json",
        harness: HARNESS,
        expect: "🔴 `rpp.json` БОЛЬШЕ НЕ СОЗДАЁТСЯ — вторая декларация это то, что doctor и ловит",
        disables:
          "«одна декларация». Два носителя расходятся молча — это дефект #33, заведённый заново " +
          "собственной командой установки",
        edits: [[INIT, '  if (!existsSync(path)) return "absent";', '  if (!existsSync(path)) writeFileSync(path, "{}\\n", "utf8");']],
      },
      {
        name: "взятое умолчание перестаёт называться",
        harness: HARNESS,
        expect: "🔴 не терминал — вопрос НЕ задаётся, и взятое умолчание НАЗВАНО",
        disables:
          "половину правила «в CI не спрашивать»: не спрашивать мало, надо сказать, КАКОЕ " +
          "умолчание взято. Молчаливый пропуск читается как «вопроса и не было»",
        edits: [[INIT, '  else log(`  · stdin is not a terminal, so nothing was asked. Default taken: NO file written.`);', "  else log(`  · skipped`);"]],
      },
      {
        name: "ответ на вопрос игнорируется",
        harness: HARNESS,
        expect: "🔴 ответ человека РЕШАЕТ, а не украшает вывод",
        disables:
          "смысл единственного заданного вопроса. Приглашение печатается, ответ читается и " +
          "выбрасывается — то есть интерфейс есть, а решения за ним нет",
        edits: [[INIT, '  const picked = candidates[Number((answer ?? "").trim()) - 1];', "  const picked = candidates[0];"]],
      },
      {
        name: "прерванный вопрос снова роняет команду",
        harness: HARNESS,
        expect: "🔴 прерванный вопрос НЕ роняет команду — он означает умолчание",
        disables:
          "обработку Ctrl+D. ЗАМЕР 18.09 на настоящем псевдотерминале: readline `question()` " +
          "ОТКЛОНЯЕТСЯ с `AbortError: Aborted with Ctrl+D`, и исключение улетало наружу ПОСЛЕ " +
          "записи декларации — установка одновременно удавалась и выглядела падением",
        edits: [[INIT, "  try {\n    return await ask(question);\n  } catch {\n    return null;\n  }", "  return await ask(question);"]],
      },
      {
        name: "init перестаёт заканчиваться doctor'ом",
        harness: HARNESS,
        expect: "init заканчивается отчётом doctor: установка САМА говорит о своём состоянии",
        disables:
          "единственное, что отличает «установлено» от «защищает»: `paper-edit-guard` молчит и " +
          "когда работает, и когда сторожит пустоту. Без финального doctor init отчитывается " +
          "бодро о состоянии, которого не измерял",
        edits: [[INIT, "  const code = doctor({ log, cwd: root, projectDir: root, run, cliPapers });", "  const code = 0;"]],
      },
      {
        name: "отсутствие package.json перестаёт быть отказом",
        harness: HARNESS,
        expect: "без package.json init ОТКАЗЫВАЕТ и несёт лекарство, а не диагноз",
        disables:
          "громкость отказа там, где писать НЕКУДА. Тихий ноль здесь — это установка, которая " +
          "не произошла и отчиталась успехом",
        edits: [[INIT, "    err(`      package.json. Run \\`npm init -y\\` here, then \\`npx rpp init\\` again.`);\n    return 2;", "    return 0;"]],
      },
      {
        name: "пропавшая программа называется без лекарства",
        harness: HARNESS,
        expect: "🔴 и несёт КОМАНДУ УСТАНОВКИ — лекарство, а не диагноз",
        disables:
          "вторую половину правила «ничего не ставим за пользователя». Диагноз без лекарства " +
          "оставляет человека ровно там же, где он стоял: программы нет, а что набрать — неизвестно",
        edits: [[INIT, "    for (const cmd of [...new Set(missing.map((p) => p.install))]) log(`        ${cmd}`);", "    void missing;"]],
      },
      {
        name: "утилита снова читает только rpp.json",
        harness: HARNESS,
        expect:
          "🔴 УТИЛИТА ЧИТАЕТ ДЕКЛАРАЦИЮ ИЗ package.json — иначе `rpp init` ставит то, что `rpp lint` не видит",
        disables:
          "смычку между командой установки и командой проверки. `init` пишет одну декларацию в " +
          "package.json, а `lint` ищет её в rpp.json — сразу после установки прогон отвечает " +
          "«nothing to lint» по корпусу, который на месте",
        edits: [[CLI, '    const pkg = join(dir, PKG_NAME);\n    if (existsSync(pkg) && declaresSettings(pkg))\n      return { path: pkg, kind: "package.json" };', "    const pkg = join(dir, PKG_NAME);"]],
      },
      {
        name: "устаревший носитель читается молча",
        harness: HARNESS,
        expect: "🔴 но устаревший носитель НАЗВАН, а не просто прочитан молча",
        disables:
          "предупреждение о том, что настройки лежат там, куда хуки не смотрят. Прогон зелёный, " +
          "линтуется один каталог, сторожится другой — и оба состояния выглядят одинаково",
        edits: [[CLI, '    if (decl.kind === "rpp.json")', "    if (false)"]],
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
