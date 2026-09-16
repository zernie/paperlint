/**
 * Батарея на `paper/stages` и `paper/source` — четыре мутации, и выбраны они так, чтобы каждая
 * снимала СВОЁ несущее свойство, а не просто ломала файл.
 *
 * 🔴 Зачем батарея именно здесь. У обоих правил состояние успеха — ТИШИНА, а харнесс ловит их
 * на фикстурах, которые сам же и раскладывает. «Прошло» и «не может упасть» снаружи выглядят
 * одинаково; батарея — единственное, что их различает.
 *
 * Две первые мутации бьют по ДВУМ НАПРАВЛЕНИЯМ `paper/stages`, и это не симметрия ради красоты:
 * без второго направления правило выключается удалением фронтматтера — объявлений нет, значит и
 * расхождений нет, значит зелено. Мутация `объявлено-без-байтов` и мутация `байты-без-объявления`
 * обязаны умереть на РАЗНЫХ ассертах, иначе доказана лишь одна половина.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "paper-stages.mjs");
const HARNESS = join(HERE, "paper-stages.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "направление ОБЪЯВЛЕНО→БАЙТЫ перестаёт сверять",
        harness: HARNESS,
        expect: "wrong byte count is reported",
        disables:
          "сверку объявленного `bytes` с файлом на диске — стадия может объявить любое число, " +
          "и pdf под ней окажется каким угодно",
        edits: [[RULE, "if (got !== Number(rec.bytes)) {", "if (false) {"]],
      },
      {
        name: "направление БАЙТЫ→ОБЪЯВЛЕНО перестаёт сверять",
        harness: HARNESS,
        expect: "a frozen version nobody declared is reported",
        disables:
          "вторую половину — ту, без которой правило глушится удалением фронтматтера: " +
          "объявлений нет ⇒ расхождений нет ⇒ зелено",
        edits: [
          [
            RULE,
            "if (records.some((r) => r.stage === f.stage && r.date === f.date)) continue;",
            "if (true) continue;",
          ],
        ],
      },
      {
        name: "`paper/source` перестаёт сверять размер исходника",
        harness: HARNESS,
        expect: "a byte mismatch on the source is reported",
        disables:
          "проверку ТОЖДЕСТВА замороженного исходника: `existsSync` отвечает «файл есть», " +
          "и только размер отвечает «это тот самый файл»",
        edits: [[RULE, "if (Number.isFinite(want) && got !== want)", "if (false)"]],
      },
      {
        name: "признание утраты начинает ОСВОБОЖДАТЬ, а не записывать",
        harness: HARNESS,
        expect: "an acknowledged loss is still reported, not silenced",
        disables:
          "решение, что `sourceLost` — это ЗАПИСЬ, а не индульгенция: правило обязано продолжать " +
          "говорить, потому что состояние остаётся дефектным, просто неисправимым сегодня",
        edits: [[RULE, "if (rec?.sourceLost === true) {", "if (rec?.sourceLost === true && false) {"]],
      },
    ],
  }),
);
