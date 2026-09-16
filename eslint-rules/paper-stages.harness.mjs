/**
 * Both halves for `paper/stages`, and the halves are not symmetric — which is the point.
 *
 * The rule has TWO directions and each has its own way of being silently useless:
 *   declared -> bytes   passes trivially if nobody declares anything
 *   bytes -> declared   passes trivially if the versions folder is never read
 * So every fixture below exists to kill one specific way of being green and wrong, and the
 * two that matter most are `noheader` (no frontmatter at all, bytes on disk — the rule must
 * NOT be switchable off by deleting a line) and `nothing` (no frontmatter, no bytes — it must
 * stay silent, because a draft owes nothing).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import markdown from "@eslint/markdown";
import stages from "./paper-stages.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "paper-stages");
const linter = new Linter();

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

// 🔴 Счётчик `n` СКВОЗНОЙ, поэтому печатать его под заголовком одного правила — значит
// приписывать этому правилу чужие ассерты. Так и было: строка про `paper/source` сообщала
// семнадцать, из которых десять проверяли `paper/stages`. `since()` отдаёт дельту своего
// блока, и число снова описывает то, что названо рядом.
let mark = 0;
const since = () => {
  const d = n - mark;
  mark = n;
  return d;
};

assert.deepEqual(Object.keys(stages.rules).sort(), ["author-list", "source", "stages"], "rule set changed");

/** Findings for one fixture paper, as plain message strings. */
function lint(name) {
  const file = join(FIX, name, "PIPELINE-STATUS.md");
  const msgs = linter.verify(readFileSync(file, "utf-8"), [{
    // `files` is required here rather than cosmetic: without it flat config falls back to the
    // JS extensions and every fixture comes back as "No matching configuration found" — a
    // message that reads exactly like a clean run.
    files: ["**/*.md"],
    plugins: { markdown, paper: stages },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: { "paper/stages": "error" },
  }], file);
  assert.deepEqual(msgs.filter((m) => m.fatal), [], `${name}: the rule threw`);
  return msgs.map((m) => m.message);
}

// ── silent where it must be silent ──────────────────────────────────────────────────────
check("declared and frozen correctly — silent", lint("ok").length === 0);
check("nothing shipped, nothing declared — silent, a draft owes nothing",
      lint("nothing").length === 0);
// A withdrawn version is a deliberate RECORD of a mistake; demanding a declaration for it
// would turn that record into a finding.
check("a STALE version needs no declaration", lint("stale").length === 0);

// ── direction one: a claim owes its bytes ───────────────────────────────────────────────
const wrong = lint("wrongsize");
check("wrong byte count is reported", wrong.length === 1);
check("and it names BOTH numbers, not just 'mismatch'",
      /352357/.test(wrong[0]) && /100/.test(wrong[0]));

const missing = lint("nofile");
check("a declared stage with no file on disk is reported",
      missing.length === 1 && /not on disk/.test(missing[0]));

// ── direction two: bytes owe their declaration ──────────────────────────────────────────
// 🔴 The live case this rule was written for: a camera-ready pdf sat frozen for 16 days while
// the predecessor's pattern for that stage matched zero times anywhere in the file.
const undeclared = lint("undeclared");
check("a frozen version nobody declared is reported", undeclared.length === 1);
check("and it names the file and the stage",
      /2026-08-29-camera-ready\.pdf/.test(undeclared[0]) && /camera-ready/.test(undeclared[0]));

// 🔴 THE ESCAPE HATCH. Without this half the whole rule is switched off by deleting the
// frontmatter — which is the cheapest edit in the file.
const noheader = lint("noheader");
check("deleting the frontmatter does NOT silence the rule when bytes exist",
      noheader.length === 1 && /ran ahead of the declaration/.test(noheader[0]));

// ── a LIST, not a map: the same stage twice ─────────────────────────────────────────────
// One paper in the source corpus was submitted to one venue, rejected, and resubmitted to
// another. A map keyed by stage name holds one of those; the filenames already hold both.
check("the same stage declared twice with different dates is accepted",
      lint("twice").length === 0);

console.log(`✓ ${String(since())} assertions passed — paper/stages, both directions`);

// ── `paper/source`: the SOURCE is frozen on disk, and the bytes are compared ────────────
// 🔴 This block replaced a git-based one on 2026-09-16, and the reason is a measurement, not
// a preference. The old rule checked that a recorded `commit <sha>` RESOLVED. Two such shas
// stopped resolving inside ninety minutes of one session — squash-merge destroyed the branch
// commits, `gc` collected them — and three of the four declared stages in the live corpus had
// lost their source entirely. A sha is a pointer to a pointer; the outer one evaporates.
{
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs");
  const root = mkdtempSync(join(FIX, "..", ".tmp-stages-src-"));
  // 🔴 try/finally, а НЕ уборка в конце блока. Наблюдено 16.09: под каждой мутацией ассерт
  // бросает — то есть ровно тогда, когда харнесс делает свою работу, — и уборка на счастливом
  // пути не выполняется. За один прогон батареи в репозитории осталось ВОСЕМЬ каталогов
  // `.tmp-stages-src-*`, по числу намеренно убитых мутаций. Мусор здесь не косметика: драйвер
  // мутаций отказывается работать на грязном дереве, то есть харнесс ломал бы следующий прогон.
  try {
  const paper = join(root, "one");
  mkdirSync(join(paper, "versions"), { recursive: true });
  writeFileSync(join(paper, "versions", "2026-07-22-submitted.tex"), "x".repeat(120));

  const lintIn = (body) => {
    const file = join(paper, "PIPELINE-STATUS.md");
    writeFileSync(file, body);
    const msgs = linter.verify(body, [{
      files: ["**/*.md"],
      plugins: { markdown, paper: stages },
      language: "markdown/gfm",
      languageOptions: { frontmatter: "yaml" },
      rules: { "paper/source": "error" },
    }], file);
    assert.deepEqual(msgs.filter((m) => m.fatal), [], "the rule threw");
    return msgs.map((m) => m.message);
  };
  const rec = (extra) =>
    `---\nstages:\n  - stage: submitted\n    date: 2026-07-22\n    pdf: versions/x.pdf\n    bytes: 1\n${extra}---\n# S\n`;

  check("a frozen source with matching bytes is accepted",
        lintIn(rec("    source: versions/2026-07-22-submitted.tex\n    sourceBytes: 120\n")).length === 0);

  const wrong = lintIn(rec("    source: versions/2026-07-22-submitted.tex\n    sourceBytes: 999\n"));
  check("a byte mismatch on the source is reported", wrong.length === 1);
  check("and it names both numbers", /999/.test(wrong[0]) && /120/.test(wrong[0]));

  const gone = lintIn(rec("    source: versions/nope.tex\n    sourceBytes: 1\n"));
  check("a declared source that is not on disk is reported",
        gone.length === 1 && /not on disk/.test(gone[0]));

  const none = lintIn(rec(""));
  check("a stage with no frozen source at all is reported", none.length === 1);
  // 🔴 The message must say WHY a commit reference is not an acceptable substitute — otherwise
  // the next author reaches for the thing that already failed here.
  check("and it says a commit reference will not do", /squash and gc/.test(none[0]));

  // Acknowledging the loss is a RECORD, not an exemption: the rule keeps speaking, because the
  // state is still defective — merely unfixable today.
  const lost = lintIn(rec("    sourceLost: true\n"));
  check("an acknowledged loss is still reported, not silenced",
        lost.length === 1 && /declared LOST/.test(lost[0]));

  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(`✓ ${String(since())} assertions passed — paper/source, frozen bytes instead of a sha`);

// ── `paper/author-list`: отгруженная статья должна себе прогон сверки списков авторов ────
//
// Предмет у этого правила ДРУГОЙ, чем у двух соседей выше: те сверяют объявление с байтами,
// это — объявление с записью о прогоне. Общий у них ровно один вход, поле `stages`, и ради
// него правило и живёт в этом модуле.
{
  const lintAuthors = (name, opts = {}) => {
    const file = join(FIX, name, "PIPELINE-STATUS.md");
    const msgs = linter.verify(readFileSync(file, "utf-8"), [{
      files: ["**/*.md"],
      plugins: { markdown, paper: stages },
      language: "markdown/gfm",
      languageOptions: { frontmatter: "yaml" },
      rules: { "paper/author-list": ["error", opts] },
    }], file);
    assert.deepEqual(msgs.filter((m) => m.fatal), [], `${name}: the rule threw`);
    return msgs.map((m) => m.message);
  };

  // ── молчит там, где обязано ──
  check("прогон записан в табеле — молчит",
        lintAuthors("authors-ran").length === 0);
  // Черновик никого не просил себя читать, поэтому ничего и не должен. Это не послабление:
  // предмет правила — ДОЛГ отгруженной статьи, а у неотгруженной долга нет.
  check("стадия не объявлена вовсе — молчит, черновик ничего не должен",
        lintAuthors("nothing").length === 0);
  // Пустой список — это не «стадия есть»: запись `stages: []` встречается у статьи, которую
  // завели, но никуда не подали.
  check("пустой список стадий — молчит",
        linter.verify("---\nstages: []\n---\n# S\n", [{
          files: ["**/*.md"], plugins: { markdown, paper: stages },
          language: "markdown/gfm", languageOptions: { frontmatter: "yaml" },
          rules: { "paper/author-list": "error" },
        }], join(FIX, "x", "PIPELINE-STATUS.md")).length === 0);

  // ── срабатывает на подложенном дефекте ──
  const owed = lintAuthors("ok");
  check("стадия объявлена, прогона нет — находка", owed.length === 1);
  // 🔴 Сообщение обязано назвать КЛАСС, а не только факт пропуска: иначе читатель принимает
  // его за дубль проверки существования ссылок и закрывает как шум. Класс — авторы препринта
  // при объявленной конференции, и он невидим для проверки, что ссылка резолвится.
  check("и оно называет класс, который ловит сверка, а не только пропуск",
        /PREPRINT/.test(owed[0]));

  // ── то, ради чего перенос и делался ──
  // Предшественница выводила стадию РЕГУЛЯРКОЙ ПО ПРОЗЕ табеля. Перезамер 17.09: у
  // `agenticdev-2026` проза видит `submitted`, а фронтматтер — `submitted, camera-ready`.
  // Здесь список берётся из поля, поэтому обе стадии попадают в текст находки.
  const two = lintAuthors("twice");
  check("список стадий в сообщении взят из ПОЛЯ и несёт их все",
        two.length === 1 && /submitted\/submitted/.test(two[0]));

  // ── данные потребителя остаются у потребителя ──
  // Предшественница зашивала в текст сообщения путь `.claude/skills/verify-citations/...` —
  // адрес ОДНОГО репозитория внутри публичного пакета.
  const withCmd = lintAuthors("ok", { command: "node scripts/bib-authors.mjs <статья>" });
  check("команда прогона приходит опцией и попадает в сообщение",
        /scripts\/bib-authors\.mjs/.test(withCmd[0]));
  check("а без опции сообщение не выдумывает путь",
        !/bib-authors\.mjs/.test(owed[0]));
  // Маркер тоже данные: пакет не может знать, как ИМЕННО потребитель записывает прогон.
  check("маркер настраивается — с другим маркером та же статья становится должником",
        lintAuthors("authors-ran", { marker: "no-such-marker" }).length === 1);

  // ── разбор против грепа: единственный случай, где они расходятся ──
  // 🔴 Этот ассерт и есть доказательство перехода на парсер. Все фикстуры выше проходят
  // ОДИНАКОВО при обоих способах, потому что маркер в них лежит в ячейке. Здесь он лежит в
  // ПРОЗЕ — «надо будет прогнать bib-authors», намерение, а не запись, — и греп прочитал бы
  // его как свидетельство прогона. Свидетельство обязано стоять в скоркарде.
  check("маркер в прозе ВНЕ таблицы записью о прогоне не является",
        lintAuthors("marker-in-prose").length === 1);
}
console.log(`✓ ${String(since())} assertions passed — paper/author-list, долг отгруженной статьи`);

console.log(`✓ ${String(n)} assertions passed in total`);
