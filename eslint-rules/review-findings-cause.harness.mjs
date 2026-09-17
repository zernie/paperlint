/**
 * `review/findings-cause` — обе половины на настоящем ESLint, плюс случай, на котором
 * старая реализация ВРАЛА.
 *
 * Правило приехало из потребителя (`checkReviewFindingsCause` в `paper-lint.mjs`), где
 * находки считались регулярками по тексту. Третья фикстура здесь — не украшение: таблица
 * внутри ```-ограды это ПРИМЕР формата, а не отчёт, и текстовый счётчик записывал её в
 * находки. У AST она — узел `code`, и `tableRow` внутри неё не существует. То есть
 * переезд снял класс, а фикстура это фиксирует.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import markdown from "@eslint/markdown";
import { recordCheck } from "vigiles";
import reviewRules from "./review-findings-cause.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures", "review-findings-cause");

/** Тот же язык, что у потребителя: правило судит о markdown, а не о строках. */
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.md"],
      plugins: { markdown, review: reviewRules },
      language: "markdown/gfm",
      languageOptions: { frontmatter: "yaml" },
      rules: { "review/findings-cause": "error" },
    },
  ],
});

const on = async (file) => (await eslint.lintFiles([join(FIX, file)]))[0].messages;
const cases = [];

// ── 1. СРАБАТЫВАЕТ: три находки, разбора причин нет.
{
  const m = await on("defect.md");
  assert.equal(m.length, 1, `ожидалась одна находка, пришло ${m.length}: ${JSON.stringify(m)}`);
  assert.equal(m[0].ruleId, "review/findings-cause");
  assert.match(m[0].message, /3 findings/, "сообщение обязано называть ЧИСЛО находок");
  assert.match(m[0].message, /PIPELINE/, "и говорить, что чинить надо инструмент, а не абзац");
  assert.equal(m[0].line, 1, "находка про ФАЙЛ, поэтому позиция — начало документа");
  cases.push("отчёт с находками и без разбора причин → находка, число названо");
}

// ── 2. МОЛЧИТ на отчёте с разбором. Без этой половины правило неотличимо от того,
//      которое кричит всегда.
{
  const m = await on("clean.md");
  assert.deepEqual(m, [], `на отчёте с «Причина:» правило обязано молчать, пришло: ${JSON.stringify(m)}`);
  cases.push("тот же отчёт с разбором причин → тишина");
}

// ── 3. 🔴 МОЛЧИТ на ТАБЛИЦЕ ВНУТРИ ОГРАДЫ — случай, который старая текстовая версия
//      считала находками. Это и есть выигрыш переезда, предъявленный как тест.
{
  const m = await on("quiet-in-fence.md");
  assert.deepEqual(
    m, [],
    `таблица внутри \`\`\`-ограды — ПРИМЕР формата, а не отчёт; текстовый счётчик её считал, ` +
      `AST не должен. Пришло: ${JSON.stringify(m)}`,
  );
  cases.push("таблица внутри ограды → тишина (текстовая версия здесь ошибалась)");
}

// ── 4. ПОРОГ — опция потребителя, а не константа механизма.
{
  const strict = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.md"],
        plugins: { markdown, review: reviewRules },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { "review/findings-cause": ["error", { minFindings: 99 }] },
      },
    ],
  });
  const m = (await strict.lintFiles([join(FIX, "defect.md")]))[0].messages;
  assert.deepEqual(m, [], "при пороге выше числа находок правило обязано молчать — порог это данные");
  cases.push("порог передаётся опцией → при minFindings: 99 тишина на том же файле");
}

// ── 5. 🔴 «ПРАВИЛО ОТ ДАТЫ»: старый отчёт — известный долг, а не находка. Без этой
//      опции правило открылось бы у первого потребителя СОРОКА ДЕВЯТЬЮ находками
//      (замер: 84 отчёта, новых 0, старых 49), а проверку, открывшуюся стеной, глушат.
{
  const dated = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.md"],
        plugins: { markdown, review: reviewRules },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
        rules: { "review/findings-cause": ["error", { sinceCreated: "2026-08-23" }] },
      },
    ],
  });
  const old = (await dated.lintFiles([join(FIX, "old-debt.md")]))[0].messages;
  assert.deepEqual(old, [], `отчёт старше даты правила — долг, а не находка; пришло: ${JSON.stringify(old)}`);

  // И ВТОРАЯ ПОЛОВИНА ОПЦИИ: на свежем отчёте она НЕ должна ничего освобождать, иначе
  // «правило от даты» превращается в выключатель.
  const fresh = (await dated.lintFiles([join(FIX, "defect.md")]))[0].messages;
  assert.equal(fresh.length, 1, `отчёт ПОСЛЕ даты правила обязан ловиться; пришло: ${JSON.stringify(fresh)}`);
  cases.push("отчёт старше даты правила → тишина; свежий той же формы → находка");
}

recordCheck(cases.length);
console.log(`review/findings-cause: ${cases.length} случая:`);
for (const c of cases) console.log(`  ok  ${c}`);
