#!/usr/bin/env node
/**
 * ШИМ. Настоящий CLI живёт в `src/*.ts` и собирается в `dist/`; этот файл остаётся на месте и
 * остаётся JavaScript намеренно.
 *
 * 🔴 ПОЧЕМУ НЕ ПЕРЕНЕСТИ `bin` НА `dist/cli.js`. Этот путь — ПУБЛИЧНЫЙ КОНТРАКТ, и у него уже
 * два потребителя вне пакета:
 *   1. `plugin/hooks/hooks.json` зовёт
 *        node "${CLAUDE_PROJECT_DIR}/node_modules/research-paper-pipeline/bin/rpp.mjs" hook <name>
 *      — проводку хуков чинили ровно от того, что она адресовала файл, которого у потребителя
 *      не оказалось; менять её на следующий день было бы тем же классом ошибки;
 *   2. README документирует `import { buildConfig } from "research-paper-pipeline/bin/rpp.mjs"`.
 * Переезд стоил бы обоим, а выигрыш — ноль: имя файла ничего не говорит о том, на чём он написан.
 *
 * 🔴 И ПОЧЕМУ ОТКАЗ ЗДЕСЬ ГРОМКИЙ. У потребителя, поставившего пакет из реестра, `dist/` лежит
 * в тарболе готовым — это ЗАМЕРЕНО (`npm pack --dry-run`: 16 файлов `dist/*`), и держится оно
 * белым списком `files` в манифесте. Список там не для красоты: поля `files` не было, npm брал
 * за список исключений `.gitignore`, и строка `dist/` в нём выкидывала сборку из пакета —
 * 376 файлов превращались в 360, а потребитель получал именно этот отказ. Проверка остаётся
 * для двух случаев, где `dist/` действительно может не оказаться: клон репозитория до
 * `npm run build` и установка пакета как git-зависимости с `--ignore-scripts` (тогда `prepare`
 * не запускается). Без неё в обоих был бы `ERR_MODULE_NOT_FOUND` из недр загрузчика: сообщение
 * про файл, которого потребитель не писал, и ни слова о том, что делать.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/cli.js", import.meta.url);
if (!existsSync(fileURLToPath(dist))) {
  process.stderr.write(
    `research-paper-pipeline: не собрано — ${fileURLToPath(dist)} отсутствует.\n` +
      `Пакет пишется на TypeScript; в тарболе из реестра \`dist/\` уже лежит собранным, поэтому\n` +
      `сюда приходят из клона репозитория либо из git-зависимости, поставленной с\n` +
      `\`--ignore-scripts\` (тогда шаг \`prepare\` пропускается).\n` +
      `В клоне: \`npm run build\`. Для git-зависимости: переустановить без \`--ignore-scripts\`.\n`,
  );
  process.exit(2);
}
export * from "../dist/cli.js";
const { run, isMain } = await import("../dist/cli.js");
// Вопрос задаётся про ЭТОТ файл, а не про `dist/cli.js`: в `bin` смотрит симлинк из
// `node_modules/.bin`, и `isMain` умеет сравнивать его с реальным путём. Для самого `cli.js`
// ответ теперь всегда «нет» — его импортируют, а не запускают.
if (isMain(import.meta.url)) process.exit(await run(process.argv.slice(2)));
