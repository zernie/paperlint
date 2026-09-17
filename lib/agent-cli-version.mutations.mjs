/**
 * Батарея на `observeAgentCli`. Пять мутаций, пять разных ассертов.
 *
 * 🔴 Первая — сам дефект issue #7, восстановленный дословно: вернуть `stdio: "ignore"`. Она и
 * есть смысл батареи. До выноса наблюдения в модуль эту мутацию НЕГДЕ было поставить: спавн был
 * вшит в харнесс, который поднимает настоящий CLI, а «попросить бинарь ничего не печатать»
 * нельзя. Зелёная батарея при вшитом спавне была бы находкой о тесте, а не о защите.
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { runMutations } from "./mutation-driver.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MOD = join(HERE, "agent-cli-version.mjs");
const HARNESS = join(HERE, "agent-cli-version.harness.mjs");

process.exit(
  runMutations({
    root: ROOT,
    runner: "node",
    cases: [
      {
        name: "🔴 возврат к `stdio: \"ignore\"` — дефект issue #7 дословно",
        harness: HARNESS,
        // ⚠️ Ассерт НЕ тот, на который я целился, и это поправлено ПО ПРОГОНУ, а не по памяти.
        // Двойник отдаёт stdout независимо от опций, поэтому наблюдение проходит, и первым
        // краснеет ассерт про `encoding`. Ассерта про `stdio` касается следующий случай.
        expect: "without an encoding the output is a Buffer nobody reads",
        disables: "само наблюдение — версия снова печатается в никуда, а тир характеризует неизвестно что",
        edits: [[MOD, 'spawnSync(program, ["--version"], { encoding: "utf8" })', 'spawnSync(program, ["--version"], { stdio: "ignore" })']],
      },
      {
        name: "`stdio: \"ignore\"` дописан РЯДОМ с encoding — вывод всё равно в никуда",
        harness: HARNESS,
        expect: "is the discarded-output defect itself",
        disables: "второй ассерт формы вызова: `encoding` на месте, но поток всё равно погашен",
        edits: [[MOD, 'spawnSync(program, ["--version"], { encoding: "utf8" })', 'spawnSync(program, ["--version"], { encoding: "utf8", stdio: "ignore" })']],
      },
      {
        name: "пустой stdout при коде 0 перестаёт быть отказом",
        harness: HARNESS,
        expect: "must fail loudly, not be reported as a version",
        disables: "правило 4 — `exit 0` с пустым выводом снова читается как чистый замер",
        edits: [[MOD, 'if (version === "")', "if (false)"]],
      },
      {
        name: "дрейф вычисляется константой, а не сравнением",
        harness: HARNESS,
        expect: "must be computed, not eyeballed",
        disables: "сравнение наблюдённого с характеризованным — расхождение снова невидимо",
        edits: [[MOD, "const drifted = version !== characterized;", "const drifted = false;"]],
      },
      {
        name: "в сообщении остаётся только одно из двух чисел",
        harness: HARNESS,
        expect: "must name BOTH numbers",
        disables: "предъявление расхождения — читатель снова обязан помнить второе число",
        edits: [[MOD, "`observed \\`${program}\\` ${version} — the assertions here were characterized against ` +\n        `${characterized}.", "`observed \\`${program}\\` ${version} — characterized elsewhere."]],
      },
      {
        name: "версия не парсится из строки, а берётся целиком",
        harness: HARNESS,
        expect: "must be PARSED out of the line, not left raw",
        disables: "разбор строки версии — `2.1.273 (Claude Code)` перестаёт сравниваться с `2.1.227`",
        edits: [[MOD, "const version = VERSION_IN.exec(raw)?.[1] ?? \"\";", "const version = raw;"]],
      },
    ],
  }),
);
