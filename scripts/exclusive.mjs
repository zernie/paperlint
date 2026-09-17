#!/usr/bin/env node
/**
 * ВЗАИМНОЕ ИСКЛЮЧЕНИЕ ДЛЯ ПРОГОНОВ, КОТОРЫЕ ТРОГАЮТ ОДНИ И ТЕ ЖЕ ФАЙЛЫ.
 *
 * ── ЗАЧЕМ ────────────────────────────────────────────────────────────────────────────────────
 * `test:sabotage` правит исходники НА МЕСТЕ — это осознанная стратегия, объяснённая в шапке
 * `lib/mutation-driver.mjs`: девять случаев переписывают настоящий файл, а копировать под
 * каждую мутацию весь репозиторий значит минуты вместо секунд.
 *
 * Цена у стратегии одна: пока батарея идёт, ЛЮБОЙ параллельный `npm test` читает файл в
 * изувеченном состоянии и падает — с сообщением про ассерт, не про мутацию. Отказ ЛОЖНЫЙ,
 * НЕДЕТЕРМИНИРОВАННЫЙ (зависит от того, какую секунду поймали) и читается как «тесты флейкают»,
 * то есть уводит ровно в ту сторону, где чинить нечего. Это уже стоило разбора: два прогона
 * подряд дали РАЗНЫЕ сообщения об ошибке, и вывод «я сломал round-diff» был неверен.
 *
 * ── ПОЧЕМУ ЗАМОК, А НЕ ИНСТРУКЦИЯ «НЕ ЗАПУСКАЙ ОДНОВРЕМЕННО» ──────────────────────────────────
 * Инструкция уже была — прозой, в CLAUDE.md потребителя. Она не исполняется, поэтому не
 * проверяется и не действует на того, кто её не прочитал: человека в соседнем терминале, агента,
 * редактор с автотестами. Замок отказывает ГРОМКО и называет причину в тот момент, когда она
 * важна.
 *
 * ── КАК ─────────────────────────────────────────────────────────────────────────────────────
 * `mkdirSync` атомарен: каталог либо создан нами, либо уже существует — гонки нет, в отличие от
 * «проверить existsSync, потом записать». Внутри лежит pid и команда держателя; если процесс с
 * этим pid мёртв, замок перехватывается с явным сообщением, иначе прерванный прогон блокировал бы
 * репозиторий навсегда, и первым же лечением стало бы «удалить замок руками», то есть отключение
 * механизма.
 *
 * Снимается замок в `finally` И на сигналах — ровно по той же причине, по которой драйвер мутаций
 * восстанавливает исходники на SIGINT/SIGTERM.
 */
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOCK = join(ROOT, ".vigiles", "exclusive.lock");
const INFO = join(LOCK, "holder.json");

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: node scripts/exclusive.mjs <command> [args…]");
  process.exit(2);
}

/** Жив ли процесс. `kill(pid, 0)` ничего не посылает — только проверяет существование и права. */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // существует, но чужой — считаем живым
  }
}

function readHolder() {
  try {
    return JSON.parse(readFileSync(INFO, "utf8"));
  } catch {
    return null; // замок есть, описание нечитаемо — ниже это решается как «мёртвый»
  }
}

function acquire() {
  try {
    mkdirSync(LOCK, { recursive: false });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const holder = readHolder();
    if (holder && alive(holder.pid)) {
      console.error(
        `🔴 отказ: этот репозиторий сейчас занят прогоном, который ПРАВИТ ФАЙЛЫ НА МЕСТЕ.\n` +
          `   держит: pid ${holder.pid}, «${holder.cmd}», с ${holder.at}\n` +
          `   Параллельный запуск дал бы ЛОЖНЫЕ падения — тест прочитал бы исходник в изувеченном\n` +
          `   состоянии и пожаловался бы на ассерт, а не на мутацию. Дождись окончания.`,
      );
      process.exit(3);
    }
    console.error(
      `⚠️  замок остался от прогона, которого больше нет` +
        (holder ? ` (pid ${holder.pid}, «${holder.cmd}»)` : " (описание нечитаемо)") +
        ` — перехватываю.`,
    );
    rmSync(LOCK, { recursive: true, force: true });
    mkdirSync(LOCK, { recursive: false });
  }
  writeFileSync(INFO, JSON.stringify({ pid: process.pid, cmd: argv.join(" "), at: new Date().toISOString() }, null, 2));
}

const release = () => {
  if (existsSync(LOCK)) rmSync(LOCK, { recursive: true, force: true });
};

acquire();
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    release();
    process.exit(sig === "SIGINT" ? 130 : 143);
  });
}

// 🔴 `process.on("exit")`, А НЕ `finally`, И ЭТО НЕ СТИЛЬ. Первая редакция снимала замок в
// `finally` — и он ОСТАВАЛСЯ НА ДИСКЕ: `process.exit()` завершает процесс немедленно, стек не
// разматывается, `finally` не исполняется. Поймано прогоном (замок пережил успешный запуск), а
// не чтением. Цена дефекта была бы ровно обратной замыслу: каждый прогон оставлял бы репозиторий
// «занятым», и первым лечением стало бы «удалить замок руками», то есть отключение механизма.
process.on("exit", release);

const r = spawnSync(argv[0], argv.slice(1), { stdio: "inherit", shell: false });
if (r.error) {
  console.error(`🔴 не удалось запустить «${argv.join(" ")}»: ${r.error.message}`);
  process.exit(127);
}
process.exit(r.status ?? 1);
