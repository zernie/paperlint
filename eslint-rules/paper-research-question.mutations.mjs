/**
 * Батарея на `paper/research-question` — пять мутаций, каждая снимает СВОЁ несущее свойство.
 *
 * 🔴 Зачем батарея именно здесь. Состояние успеха у правила — ТИШИНА, а на живом корпусе оно
 * даёт всего две находки из четырёх статей. «Прошло» и «не может сработать» снаружи выглядят
 * одинаково, и различает их только это.
 *
 * Две мутации целятся не в находку, а в ОБЛАСТЬ и в ЯЗЫК — половины, которые тест забывает.
 * Без гейта по стадии правило ругает каждый черновик; без markdown оно теряет `compile-rules`,
 * то есть половину настоящих находок, оставаясь при этом зелёным.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "../lib/mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const RULE = join(HERE, "paper-research-question.mjs");
const HARNESS = join(HERE, "paper-research-question.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "правило перестаёт замечать отсутствие вопроса",
        harness: HARNESS,
        expect: "отгружена и вопроса нет — находка",
        disables:
          "сам предмет: правило молчит на всём корпусе, а тишина у него и есть состояние " +
          "успеха — снаружи выключённое правило неотличимо от чистой статьи",
        edits: [[RULE, "if (RQ_RE.test(raw)) return;", "return;"]],
      },
      {
        name: "ГЕЙТ ПО СТАДИИ снимается — ругаем и черновики",
        harness: HARNESS,
        expect: "черновик (стадий нет) — молчит, хотя вопроса в нём тоже нет",
        disables:
          "область. Правило спрашивает не «есть ли вопрос», а «есть ли вопрос У ОТГРУЖЕННОГО». " +
          "Без гейта находку получает каждый черновик — а правило, ругающее черновики, " +
          "выключают за неделю, и тогда пропадают обе настоящие находки тоже",
        edits: [
          [RULE, "if (stages.length === 0) return; // не отгружена — ничего не должна", ""],
        ],
      },
      {
        name: "ЯЗЫК сужается до LaTeX — markdown-статья становится невидимой",
        harness: HARNESS,
        expect: "статья в markdown проверяется так же",
        disables:
          "вторую половину языка. У языка `tex/latex` текст лежит в `raw`, у markdown — в " +
          "`text`. Мутация оставляет только первое, и `compile-rules-2026` (статья написана " +
          "markdown, вопроса нет) перестаёт находиться — ПОЛОВИНА находок живого корпуса " +
          "пропадает молча, прогон остаётся зелёным",
        edits: [
          [
            RULE,
            "const raw = context.sourceCode.raw ?? context.sourceCode.text;",
            "const raw = context.sourceCode.raw;",
          ],
        ],
      },
      {
        name: "список стадий снова берётся НЕ из поля",
        harness: HARNESS,
        expect: "список стадий в сообщении взят из поля и несёт ОБЕ",
        disables:
          "то, ради чего делался перенос. Предшественница выводила стадию регуляркой по прозе " +
          "табеля и на agenticdev печатала `submitted` там, где объявлено `submitted, " +
          "camera-ready`. Набор находок мутация не меняет — врёт только ТЕКСТ, и без своего " +
          "ассерта регрессия прошла бы молча",
        edits: [[RULE, 'data: { stages: stages.join("/") }', 'data: { stages: "submitted" }']],
      },
      {
        name: "имя табеля перестаёт приходить опцией",
        harness: HARNESS,
        expect: "а с несуществующим табелем молчит и отгруженная — гейт по стадии несущий",
        disables:
          "границу «механизм в пакете, данные у потребителя». `PIPELINE-STATUS.md` — конвенция " +
          "ОДНОГО репозитория, и захардкоженная она делает правило непригодным всем остальным",
        edits: [
          [
            RULE,
            'const statusName = context.options?.[0]?.statusFile ?? "PIPELINE-STATUS.md";',
            'const statusName = "PIPELINE-STATUS.md";',
          ],
        ],
      },
    ],
  }),
);
