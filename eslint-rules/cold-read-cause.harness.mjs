/**
 * `review/cold-read-cause` — обе половины, плюс два случая, на которых старая
 * реализация была уязвима и лечилась комментариями вместо конструкции.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import { recordCheck } from "vigiles";
import coldRules from "./cold-read-cause.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures", "cold-read-cause");

const lint = (opts = {}) =>
  new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.md"],
        plugins: { markdown, review: coldRules },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { "review/cold-read-cause": ["error", opts] },
      },
    ],
  });

const on = async (file, opts) => (await lint(opts).lintFiles([join(FIX, file)]))[0].messages;
const cases = [];

// 🔴 ПОРЯДОК СЛУЧАЕВ ЗДЕСЬ — НЕСУЩИЙ, а не вкусовой. `assert` обрывает файл на первом
// же провале, поэтому мутация убивается тем ассертом, который стоит РАНЬШЕ, а не тем,
// чьё свойство она снимает. Первая редакция шла «счёт → чистый → Закрыто», и две мутации
// из четырёх пришли как «RED, но ДРУГОЙ случай»: обе спотыкались о счёт находок и до
// своего ассерта не доходили. Это находка о ТЕСТЕ, а не о правиле.
// Порядок исправлен на «от частного к общему»: сначала граница секции, потом тишина на
// чистом, и только затем счёт — теперь каждая мутация падает на своём.

// ── 1. 🔴 СЕКЦИЯ «ЗАКРЫТО» НЕ ТРОГАЕТСЯ. Требование про причину — к ОТКРЫТЫМ находкам;
//      закрытая уже стала работой. В defect.md закрытая строка тоже без разбора, и её
//      среди находок быть не должно — иначе правило требует разбора у того, что сделано.
{
  const m = await on("defect.md");
  assert.ok(
    m.every((x) => x.line < 14),
    `строки секции «Закрыто» не должны попадать в находки, пришло: ${JSON.stringify(m.map((x) => x.line))}`,
  );
  cases.push("секция «Закрыто» не проверяется — требование только к открытым");
}

// ── 2. МОЛЧИТ, когда разбор есть у каждой строки.
{
  const m = await on("clean.md");
  assert.deepEqual(m, [], `все строки с «Причина:» → тишина, пришло: ${JSON.stringify(m)}`);
  cases.push("у каждой открытой находки есть разбор → тишина");
}

// ── 3. СРАБАТЫВАЕТ ПОСТРОЧНО. Главный выигрыш переезда: предшественница печатала одну
//      строку на файл («3 из 7 не называют причину»), и три находки искали глазами.
{
  const m = await on("defect.md");
  assert.equal(m.length, 2, `две строки без разбора, пришло ${m.length}: ${JSON.stringify(m)}`);
  assert.ok(m.every((x) => x.ruleId === "review/cold-read-cause"));
  const lines = m.map((x) => x.line).sort((a, b) => a - b);
  assert.deepEqual(lines, [11, 12], `находки обязаны стоять НА СВОИХ строках, пришли ${lines}`);
  cases.push("две открытые находки без разбора → две находки, каждая на своей строке");
}

// ── 4. 🔴 ЗАГОЛОВОК ВНУТРИ ОГРАДЫ. Предшественница резала секцию регуляркой по строкам,
//      похожим на заголовок, и `## Открыто` внутри ```-ограды обрывал секцию досрочно —
//      хвост переставал проверяться. У AST заголовка внутри ограды не существует.
{
  const m = await on("heading-in-fence.md");
  assert.equal(
    m.length, 1,
    `таблица ПОСЛЕ ограды обязана проверяться — секцию рвал только текстовый разрез. Пришло: ${JSON.stringify(m)}`,
  );
  assert.equal(m[0].line, 20, "и находка стоит на настоящей строке, а не на примере из ограды");
  cases.push("заголовок внутри ограды не обрывает секцию (текстовый разрез здесь терял хвост)");
}

// ── 5. «Правило от даты» и имя секции — данные потребителя.
{
  const old = await on("defect.md", { sinceCreated: "2026-12-01" });
  assert.deepEqual(old, [], "перечит старше даты правила — известный долг, а не находка");
  const other = await on("defect.md", { openSection: "^Закрыто" });
  assert.equal(other.length, 1, "имя секции — опция: с «Закрыто» проверяется другая таблица");
  cases.push("дата и имя секции приходят опциями, а не зашиты в механизм");
}

recordCheck(cases.length);
console.log(`review/cold-read-cause: ${cases.length} случая:`);
for (const c of cases) console.log(`  ok  ${c}`);
