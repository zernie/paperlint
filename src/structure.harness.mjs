/**
 * Обе половины для `structure.mjs` — единственной проверки в пакете, предмет которой ОТСУТСТВИЕ
 * файла.
 *
 * 🔴 ГЛАВНОЕ, ЧТО ЗДЕСЬ ЗАКРЕПЛЕНО, — НЕ СРАБАТЫВАНИЕ, А МОЛЧАНИЕ. Проверка уровня error,
 * которая падает на корректном дереве, не чинится, а выключается, и вместе с ней уходят
 * настоящие находки. Поэтому у каждого «нашлось» здесь стоит парное «на соседнем каталоге не
 * нашлось», а умолчания отдельно проверены на форме живого корпуса.
 */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { checkStructure, formatStructure, asEslintResults, STRUCTURE_DEFAULTS } =
  await import(join(HERE, "structure.ts"));

let n = 0;
const check = (label, cond) => {
  assert.ok(cond, label);
  n++;
};

const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-struct-")));
const papers = join(root, "papers");
const paper = (name, files) => {
  const dir = join(papers, name);
  mkdirSync(dir, { recursive: true });
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), "x");
  }
  return dir;
};

try {
  paper("complete", ["PIPELINE-STATUS.md", "paper.tex", "refs.bib"]);
  paper("complete-md", ["PIPELINE-STATUS.md", "paper.md"]);
  // маркер есть (paper.tex), табеля нет — каталог линтуется НУЛЁМ правил и отчитывается чисто
  paper("no-scorecard", ["paper.tex", "refs.bib"]);
  // табель есть, исходника нет
  paper("no-source", ["PIPELINE-STATUS.md"]);
  // ни одного маркера — это сосед по корпусу, а не статья
  paper("research", ["NOTES.md", "plan/ideas.md"]);
  mkdirSync(join(papers, ".hidden"), { recursive: true });
  writeFileSync(join(papers, ".hidden", "paper.tex"), "x");

  const f = checkStructure([papers], undefined, { cwd: root });
  const at = (name) => f.filter((x) => x.file.endsWith(name));

  check(
    "полный каталог статьи — НИ ОДНОЙ находки",
    at("complete").length === 0,
  );
  check(
    "и `paper.md` засчитывается наравне с `paper.tex` — корпус держит обе формы",
    at("complete-md").length === 0,
  );
  check(
    "пропавший табель — находка",
    at("no-scorecard").length === 1 &&
      /missing `PIPELINE-STATUS\.md`/.test(at("no-scorecard")[0].message),
  );
  check(
    "и сообщение называет ПОСЛЕДСТВИЕ, а не повторяет условие",
    /ZERO rules/.test(at("no-scorecard")[0].message) &&
      /reports clean/.test(at("no-scorecard")[0].message),
  );
  check(
    "и последствие названо ДЛЯ ЭТОГО каталога поимённо",
    /no-scorecard/.test(at("no-scorecard")[0].message),
  );
  check(
    "каталог без исходника — находка, и перечислены ОБЕ принимаемые формы",
    at("no-source").length === 1 &&
      /`paper\.tex`/.test(at("no-source")[0].message) &&
      /`paper\.md`/.test(at("no-source")[0].message),
  );

  // 🔴 ПАРНАЯ ПОЛОВИНА: обнаружение ЩЕДРОЕ. Без этого проверка кричала бы на каждый соседний
  // каталог корпуса, её бы выключили, и вместе с ней ушли бы три находки выше.
  check(
    "каталог БЕЗ единого маркера пайплайна не трогается вовсе",
    at("research").length === 0,
  );
  check("и скрытые каталоги тоже", at(".hidden").length === 0);
  check("всего находок ровно две — лишнего не нашлось", f.length === 2);

  // ── конфиг потребителя ────────────────────────────────────────────────────────────────
  check(
    "`ignore` снимает каталог поимённо",
    checkStructure(
      [papers],
      { ignore: ["no-scorecard", "no-source"] },
      {
        cwd: root,
      },
    ).length === 0,
  );
  check(
    "`structure: false` выключает проверку целиком",
    checkStructure([papers], false, { cwd: root }).length === 0,
  );
  check(
    "требование СВЕРХ умолчаний срабатывает — конфиг действительно доезжает",
    checkStructure(
      [papers],
      { require: ["PIPELINE-STATUS.md", "refs.bib"] },
      {
        cwd: root,
      },
    ).some(
      (x) => x.file.endsWith("complete-md") && /refs\.bib/.test(x.message),
    ),
  );
  check(
    "несуществующий корень не роняет — об этом говорит сторож пустого набора",
    checkStructure([join(root, "nope")], undefined, { cwd: root }).length === 0,
  );

  // ── умолчания: замер, а не вкус ───────────────────────────────────────────────────────
  check(
    "`paper.pdf` в умолчаниях НЕТ — две статьи живого корпуса держат pdf под другим именем",
    !STRUCTURE_DEFAULTS.require.includes("paper.pdf"),
  );
  check(
    "а `venue.json` считается маркером, но не требованием",
    STRUCTURE_DEFAULTS.markers.includes("venue.json") &&
      !STRUCTURE_DEFAULTS.require.includes("venue.json"),
  );

  // ── одна схема на обе половины ────────────────────────────────────────────────────────
  const asResults = asEslintResults(f);
  check(
    "находки отдаются в форме результата ESLint — `--json` остаётся одним массивом",
    asResults.length === 2 &&
      asResults.every(
        (r) =>
          r.errorCount === 1 &&
          r.warningCount === 0 &&
          r.messages[0].ruleId === "structure/required-file" &&
          r.messages[0].severity === 2,
      ),
  );
  check(
    "две находки в ОДНОМ каталоге схлопываются в один результат с errorCount 2",
    (() => {
      const two = checkStructure(
        [papers],
        { require: ["PIPELINE-STATUS.md", "refs.bib"] },
        { cwd: root },
      ).filter((x) => x.file.endsWith("no-source"));
      return asEslintResults(two)[0].errorCount === 2;
    })(),
  );
  check(
    "человеческий формат называет каталог и находку",
    /no-scorecard/.test(formatStructure(f)) &&
      /error {2}missing/.test(formatStructure(f)),
  );
  check(
    "и путь ОТНОСИТЕЛЬНЫЙ — абсолютный путь временного каталога читателю ничего не говорит",
    f.every((x) => !x.file.startsWith("/")),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log(
  `✓ ${String(n)} assertions passed — structure: пропавший файл не может пожаловаться сам`,
);
