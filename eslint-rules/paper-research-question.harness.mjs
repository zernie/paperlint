/**
 * Обе половины для `paper/research-question`, плюс две, про которые тест забывает чаще всего:
 * ОБЛАСТЬ и ЯЗЫК.
 *
 * Область здесь несущая. Правило спрашивает не «есть ли вопрос», а «есть ли вопрос У ТОГО, КТО
 * УЖЕ ОТГРУЖЕН». Уберите гейт по стадии — и правило начнёт ругать каждый черновик в корпусе,
 * после чего его выключат за неделю. Поэтому «молчит на черновике» проверяется отдельным
 * ассертом, а не считается частным случаем «молчит».
 *
 * Язык — вторая забытая половина: статья в этом корпусе бывает и LaTeX, и markdown. Правило,
 * закреплённое только на `.tex`, ПОТЕРЯЛО БЫ `compile-rules-2026`, где статья написана markdown
 * и вопрос не формулируется — одну из двух настоящих находок на живом корпусе.
 */
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import markdown from "@eslint/markdown";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "..", "fixtures", "paper-research-question");

const { texLanguage } = await import(join(HERE, "latex-language.mjs"));
const rq = (await import(join(HERE, "paper-research-question.mjs"))).default;

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

const linter = new Linter();

/** Прогон одной фикстуры. Язык выбирается по расширению — ровно как в конфиге потребителя. */
function lint(dir, file, opts = {}) {
  const path = join(FIX, dir, file);
  const tex = file.endsWith(".tex");
  const cfg = tex
    ? {
        files: ["**/*.tex"],
        plugins: { tex: { languages: { latex: texLanguage } }, paper: rq },
        language: "tex/latex",
      }
    : {
        // `files` обязателен, а не косметика: без него плоский конфиг откатывается к
        // JS-расширениям, и фикстура возвращается как «No matching configuration found» —
        // сообщение, которое читается ровно как чистый прогон.
        files: ["**/*.md"],
        plugins: { markdown, paper: rq },
        language: "markdown/gfm",
        languageOptions: { frontmatter: "yaml" },
      };
  const msgs = linter.verify(readFileSync(path, "utf-8"), [
    { ...cfg, rules: { "paper/research-question": ["error", opts] } },
  ], path);
  assert.deepEqual(msgs.filter((m) => m.fatal), [], `${dir}/${file}: the rule threw`);
  return msgs.map((m) => m.message);
}

// ── срабатывает на подложенном дефекте ──────────────────────────────────────────────────
const fires = lint("shipped-no-rq", "paper.tex");
check("отгружена и вопроса нет — находка", fires.length === 1);
// 🔴 Сообщение обязано назвать, ОТКУДА требование. Без этого оно читается как вкус
// линтера, а требование пришло от живого рецензента площадки.
check("и оно ссылается на рецензента, а не выдаёт это за вкус линтера",
      /reviewer/i.test(fires[0]));
// Стадии в тексте — из ПОЛЯ. Предшественница выводила их регуляркой по прозе табеля и на
// agenticdev печатала `submitted` там, где объявлено `submitted, camera-ready`.
check("список стадий в сообщении взят из поля и несёт ОБЕ",
      /submitted\/camera-ready/.test(fires[0]));

// markdown — вторая половина ЯЗЫКА, без неё теряется одна из двух настоящих находок
check("статья в markdown проверяется так же", lint("markdown-no-rq", "paper.md").length === 1);

// ── молчит там, где обязано ─────────────────────────────────────────────────────────────
check("вопрос сформулирован — молчит", lint("shipped-with-rq", "paper.tex").length === 0);
// Гейт по стадии: черновик ничего не должен, потому что никого не просил себя читать.
check("черновик (стадий нет) — молчит, хотя вопроса в нём тоже нет",
      lint("draft", "paper.tex").length === 0);
// И различитель к предыдущему: тот же черновик с ПОДМЕНЁННЫМ именем табеля тоже молчит —
// то есть тишина там не от того, что файл не нашёлся, а от пустого списка стадий.
check("а с несуществующим табелем молчит и отгруженная — гейт по стадии несущий",
      lint("shipped-no-rq", "paper.tex", { statusFile: "НЕТ-ТАКОГО.md" }).length === 0);

// ── названная дыра, закреплённая ассертом ───────────────────────────────────────────────
// Правило читает СЫРОЙ текст, поэтому упоминание в комментарии LaTeX его усыпляет. Замер
// 2026-09-17 по всем четырём статьям корпуса: таких случаев ноль, дыра ЛАТЕНТНАЯ. Ассерт
// стоит здесь, чтобы её закрытие было осознанным решением, а не случайной находкой.
check("упоминание ТОЛЬКО в комментарии LaTeX усыпляет правило — дыра названа, не забыта",
      lint("comment-only", "paper.tex").length === 0);

// ── имя табеля — данные потребителя ─────────────────────────────────────────────────────
check("имя табеля приходит опцией",
      lint("shipped-no-rq", "paper.tex", { statusFile: "PIPELINE-STATUS.md" }).length === 1);

console.log(`✓ ${String(n)} assertions passed — paper/research-question, долг отгруженной статьи`);
