/**
 * `local/temp-root-realpath` — обе половины на настоящем ESLint, плюс сам корпус.
 *
 * 🔴 ПОЧЕМУ ЭТОТ ХАРНЕСС ВООБЩЕ СУЩЕСТВУЕТ, а не ограничились двадцатью четырьмя правками.
 * Дефект (issue #9) ВОСПРОИЗВОДИТСЯ ТОЛЬКО НА macOS: там `/var` — симлинк на `/private/var`,
 * и один каталог получает два написания. На Linux `realpathSync` — тождество, поэтому ни
 * один поведенческий тест не может отличить починенный корень от непочиненного: снятая
 * обёртка оставляет прогон ЗЕЛЁНЫМ. Единственная проверка, которая на Linux вообще способна
 * покраснеть, — структурная: спросить у AST, разрешается ли корень в месте его создания.
 * Ровно поэтому она и написана правилом линтера, а не ассертом внутри чьего-то харнесса.
 *
 * ⚠️ И граница, чтобы харнесс не приняли за большее: он утверждает, что ИДИОМА на месте,
 * а не что на macOS теперь зелено. Второе проверяется только на macOS, и в CI здесь один
 * `ubuntu-latest` — это записано как известный предел, а не замазано.
 *
 * Фикстуры — строками через `lintText`, а не файлами на диске: файл-дефект под
 * `fixtures/` попал бы под блок `**\/*.mjs` самого конфига и сделал бы `npx eslint .`
 * красным на здоровом чекауте. Это тот же довод, по которому .tex-фикстуры стоят на `warn`.
 */
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import { recordCheck } from "vigiles";
import localRules from "./temp-root-realpath.mjs";

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.mjs"],
      languageOptions: { ecmaVersion: 2024, sourceType: "module" },
      plugins: { local: localRules },
      rules: { "local/temp-root-realpath": "error" },
    },
  ],
});

/** @returns {Promise<import("eslint").Linter.LintMessage[]>} */
const on = async (code) =>
  (await eslint.lintText(code, { filePath: "probe.mjs" }))[0].messages;

const HEAD = 'import { mkdtempSync, realpathSync } from "node:fs";\n' +
  'import { tmpdir } from "node:os";\nimport { join } from "node:path";\n';

const cases = [];

// ── 1. СРАБАТЫВАЕТ: корень из `tmpdir()` без резолва — ровно форма из issue #9.
{
  const m = await on(`${HEAD}const TMP = mkdtempSync(join(tmpdir(), "probe-"));\n`);
  assert.equal(m.length, 1, `ожидалась одна находка, пришло ${m.length}: ${JSON.stringify(m)}`);
  assert.equal(m[0].ruleId, "local/temp-root-realpath");
  assert.match(m[0].message, /realpathSync\(mkdtempSync/, "сообщение обязано нести ЛЕКАРСТВО, а не только диагноз");
  assert.match(m[0].message, /private\/var/, "и называть причину — почему один каталог получает два имени");
  cases.push("mkdtempSync(join(tmpdir(), …)) без резолва → находка, в сообщении лекарство");
}

// ── 2. МОЛЧИТ на исправленной форме. Без этой половины правило неотличимо от того,
//      которое кричит на каждый `mkdtempSync`.
{
  const m = await on(`${HEAD}const TMP = realpathSync(mkdtempSync(join(tmpdir(), "probe-")));\n`);
  assert.deepEqual(m, [], `на разрешённом корне правило обязано молчать, пришло: ${JSON.stringify(m)}`);
  cases.push("realpathSync(mkdtempSync(join(tmpdir(), …))) → тишина");
}

// ── 3. 🔴 МОЛЧИТ НА ВЛОЖЕННОМ КОРНЕ, и это несущий случай, а не послабление. В корпусе
//      таких пять (`mkdtempSync(join(TMP, "repo-"))`); они наследуют написание от `TMP`,
//      который ловится на СВОЁМ месте. Правило, кричащее и здесь, потребовало бы двойного
//      резолва — а для `error`-правила ложное срабатывание хуже пропуска: его выключают.
{
  const m = await on(
    `${HEAD}const TMP = realpathSync(mkdtempSync(join(tmpdir(), "probe-")));\n` +
      `const sub = mkdtempSync(join(TMP, "repo-"));\nvoid sub;\n`,
  );
  assert.deepEqual(m, [], `вложенный корень наследует написание от родителя; пришло: ${JSON.stringify(m)}`);
  cases.push("вложенный mkdtempSync(join(TMP, …)) → тишина (родитель уже разрешён)");
}

// ── 4. КОММЕНТАРИЙ И СТРОКА — НЕ ВЫЗОВ. Ради этого правило и разбирает AST: текстовый
//      страж, ищущий «mkdtempSync(join(tmpdir()», нашёл бы сам этот файл и был бы вынужден
//      исключать себя — класс, из-за которого проверки строкой здесь запрещены.
{
  const m = await on(
    `${HEAD}// mkdtempSync(join(tmpdir(), "in-a-comment-"))\n` +
      `const doc = 'mkdtempSync(join(tmpdir(), "in-a-string-"))';\nvoid doc;\n`,
  );
  assert.deepEqual(m, [], `текст О вызове вызовом не является; пришло: ${JSON.stringify(m)}`);
  cases.push("та же последовательность в комментарии и в строке → тишина");
}

// ── 5. `fs.mkdtempSync` / `os.tmpdir()` через namespace — та же вещь под другим написанием.
{
  const ns = 'import * as fs from "node:fs";\nimport * as os from "node:os";\nimport { join } from "node:path";\n';
  const bad = await on(`${ns}const TMP = fs.mkdtempSync(join(os.tmpdir(), "probe-"));\n`);
  assert.equal(bad.length, 1, `namespace-написание обязано ловиться; пришло: ${JSON.stringify(bad)}`);
  const good = await on(`${ns}const TMP = fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(), "probe-")));\n`);
  assert.deepEqual(good, [], `и разрешаться тоже; пришло: ${JSON.stringify(good)}`);
  cases.push("fs.mkdtempSync(join(os.tmpdir(), …)) ловится, fs.realpathSync(…) освобождает");
}

// ── 6. 🔴 САМ КОРПУС ЧИСТ. Половина «молчит» на выдуманной строке ничего не говорит про
//      репозиторий: правило может молчать и потому, что ни одного файла ему не подали
//      (записанный класс — `scripts/rules-see-files.mjs`). Поэтому проверка гоняет ПРАВИЛО
//      ПО НАСТОЯЩЕМУ ДЕРЕВУ и требует, чтобы файлов было много, а находок ноль.
{
  const corpus = new ESLint({ cwd: new URL("..", import.meta.url).pathname });
  const results = await corpus.lintFiles(["."]);
  const hits = results.flatMap((r) =>
    r.messages
      .filter((msg) => msg.ruleId === "local/temp-root-realpath")
      .map((msg) => `${r.filePath}:${msg.line}`),
  );
  assert.deepEqual(hits, [], `корпус обязан быть чист от неразрешённых корней:\n${hits.join("\n")}`);
  const linted = results.filter((r) => r.filePath.endsWith(".mjs")).length;
  assert.ok(
    linted > 50,
    `правилу подали всего ${linted} файлов .mjs — ноль находок при пустом входе это НЕ чистота`,
  );
  cases.push(`корпус: ${linted} файлов .mjs, ноль неразрешённых корней`);
}

recordCheck(cases.length);
console.log(`local/temp-root-realpath: ${cases.length} случаев:`);
for (const c of cases) console.log(`  ok  ${c}`);
