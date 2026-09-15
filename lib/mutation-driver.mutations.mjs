/**
 * Батарея на движок мутаций — та, которой у него не было.
 *
 * Оба случая бьют в ОДНО свойство, добавленное 2026-09-15: пропуск харнесса это
 * третий исход, и батарея, чей харнесс пропускается, обязана ОТКАЗАТЬСЯ судить.
 * Первый снимает сам отказ, второй — способность распознать пропуск. Разные
 * причины, одно наблюдаемое следствие, и это следствие в CI уже стоило ложного
 * диагноза «две мутации выжили» (прогон 34966606186).
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "./mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DRIVER = join(HERE, "mutation-driver.mjs");
const HARNESS = join(HERE, "mutation-driver.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "отказ от пропускающего харнесса снят",
        harness: HARNESS,
        expect: "пропуск обязан ОТКАЗЫВАТЬ",
        disables: "сам отказ — драйвер снова судит по харнессу, который не выполнялся",
        edits: [[DRIVER, "  if (skipped.length) {", "  if (false) {"]],
      },
      {
        name: "код пропуска перестаёт узнаваться",
        harness: HARNESS,
        expect: "пропуск обязан ОТКАЗЫВАТЬ",
        disables: "распознавание протокольного кода — пропуск начинает читаться как «красный»",
        edits: [[DRIVER, "const VIGILES_SKIP_EXIT = 77;", "const VIGILES_SKIP_EXIT = 76;"]],
      },
    ],
  }),
);
