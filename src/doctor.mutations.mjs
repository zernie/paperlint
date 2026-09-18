/**
 * Батарея на `rpp doctor`.
 *
 * Предмет здесь необычный и потому уязвимый: doctor — проверка ПРО ПРОВЕРКУ. Сломанная, она
 * печатает столбик галочек и выходит нулём, то есть отказывает ровно тем способом, ради поимки
 * которого написана. Каждый случай ниже возвращает один из этих тихих отказов.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = join(HERE, "doctor.ts");
const HARNESS = join(HERE, "doctor.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "сверка двух корней перестаёт что-либо значить",
        harness: HARNESS,
        expect: "passes the guard unseen",
        disables:
          "единственную причину, по которой команда существует. Расхождение между тем, что " +
          "линтует CLI, и тем, что сторожит хук, — это тихая дыра: обе стороны выглядят " +
          "установленными и зелёными, а записи в настоящие статьи идут мимо гейта",
        edits: [
          [
            SRC,
            "    const same = resolve(root, cliPapers) === resolve(root, hookSays);",
            "    const same = true;",
          ],
        ],
      },
      {
        name: "корень хука пересказывается вместо того, чтобы спрашиваться",
        harness: HARNESS,
        expect: "doctor печатает РОВНО то, что вернул хук",
        disables:
          "защиту от ВТОРОЙ КОПИИ ЛОГИКИ — ровно того дефекта, о котором команда и сообщает. " +
          "Пересказ расходится с оригиналом молча и печатает уверенный неверный ответ: здесь " +
          "он теряет срезание хвостового слеша, которое хук делает намеренно",
        edits: [
          [
            SRC,
            "  const hookRoot = rawPkg ? papersRoot(rawPkg) : null;",
            '  const hookRoot = rawPkg ? (JSON.parse(rawPkg)?.["research-paper-pipeline"]?.papers ?? "papers") : null;',
          ],
        ],
      },
      {
        name: "отсутствующая внешняя программа начинает валить прогон",
        harness: HARNESS,
        expect: "отсутствующий tex НЕ валит прогон",
        disables:
          "различие между фактом и вердиктом. Какие программы нужны — зависит от того, какими " +
          "скиллами пользуешься; команда, падающая на совете, попадает в `|| true` или в " +
          "/dev/null целиком, вместе с бинарными находками, ради которых написана",
        edits: [
          [
            SRC,
            "      out.push(`      ${p.install}`);",
            "      out.push(`      ${p.install}`);\n      bad++;",
          ],
        ],
      },
      {
        name: "обнаружением каталога статей становится сама статья",
        harness: HARNESS,
        expect: "это КОРЕНЬ, а не сама статья",
        disables:
          "смысл подсказки. Конфиг, указывающий на ОДИН документ вместо каталога, проходит " +
          "все проверки и линтует одну статью из десяти — причём отчитывается чисто",
        edits: [
          [
            SRC,
            "      if (isPapersRoot) hits.push(relative(cwd, here));",
            "      if (isPapersRoot) hits.push(...children.filter((c) => c.isDirectory()).map((c) => relative(cwd, join(here, c.name))));",
          ],
        ],
      },
      {
        name: "обход перестаёт пропускать node_modules",
        harness: HARNESS,
        expect: "node_modules не обыскивается",
        disables:
          "границу между своими статьями и чужими. Любая установленная зависимость с примерами " +
          "статей выдаётся за каталог потребителя, и подсказка уводит конфиг в node_modules",
        edits: [
          [
            SRC,
            'const skip = new Set(["node_modules", ".git", "dist", "_build", ".claude"]);',
            "const skip = new Set();",
          ],
        ],
      },
      {
        name: "пропавшая декларация снова становится умолчанием",
        harness: HARNESS,
        expect: "нет ключа в package.json — ОТКАЗ",
        disables:
          "ровно тот замер, ради которого заведён issue #33: `rpp init` пишет один файл, хук " +
          "читает другой, и отсутствие ключа сегодня не отказ, а тихая подстановка `papers`",
        edits: [
          [
            SRC,
            "    if (declared === undefined) bad++;",
            "    if (declared === undefined) void 0;",
          ],
        ],
      },
    ],
  }),
);
