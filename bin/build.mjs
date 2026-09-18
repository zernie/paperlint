/**
 * `rpp build <paper>` — собрать статью ЕЁ СОБСТВЕННЫМ скриптом.
 *
 * 🔴 ПОЧЕМУ НЕ УНИВЕРСАЛЬНЫЙ ЦИКЛ. Сборка статьи не сводится к «прогнать pdflatex трижды».
 * У живого примера в преамбуле стоит `\input{}` файла, который лежит НЕ рядом со статьёй, а в
 * данных площадки, и без `TEXINPUTS` сборка падает сразу; у другого — цикл подбора позиции
 * `\balance`, где сборок два десятка. Написать «общий» цикл значит либо не уметь ни того, ни
 * другого, либо втянуть обе особенности в пакет, который про них знать не должен. Скрипт статьи
 * уже умеет своё и САМ находит свой каталог, поэтому CLI его просто запускает.
 *
 * 🔴 ЧТО ЭТА КОМАНДА ЧИНИТ, И ЭТО НЕ УДОБСТВО. В воркфлоу потребителя написано своей рукой:
 *   «The loop above only reaches a paper that ships `repro/build-submission.sh`, and exactly
 *    ONE of five does… So the accepted AgenticDev paper was checked by no paper job at all.»
 *   «A paper with no `.log` is SKIPPED, not failed… That is a real gap, named rather than hidden.»
 * То есть цикл искал ОДНО имя, у принятой статьи было ДРУГОЕ (`build.sh` в корне против
 * `repro/build-submission.sh`), и расхождение имён выглядело как «нечего собирать».
 *
 * ⇒ Два следствия, оба намеренные:
 *   1. кандидатов НЕСКОЛЬКО и они ОБЪЯВЛЕНЫ — совпадение по имени перестаёт быть везением;
 *   2. НЕ НАЙДЕН — это ОТКАЗ, а не пропуск. Пропуск и есть тот режим, из-за которого статья
 *      уехала на площадку, не пройдя ни одного пейперного джоба.
 */
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative, extname } from "node:path";

/**
 * Порядок ЗНАЧИМ: первый найденный и побеждает. `build.sh` в корне статьи стоит первым, потому
 * что это то, что автор видит, открыв каталог; `repro/…` — конвенция артефакта воспроизведения.
 */
export const BUILD_SCRIPTS = ["build.sh", "repro/build-submission.sh"];

/** Каталог считается статьёй по тем же маркерам, что и в `structure.mjs` — один словарь на двоих. */
export const PAPER_MARKERS = [
  "PIPELINE-STATUS.md",
  "paper.tex",
  "paper.md",
  "venue.json",
];

export function findBuildScript(paperDir, candidates = BUILD_SCRIPTS) {
  for (const rel of candidates) {
    const p = join(paperDir, rel);
    if (existsSync(p)) return { rel, path: p };
  }
  return null;
}

/**
 * Интерпретатор выбирается по РАСШИРЕНИЮ, а не по биту исполнения: у файла в свежем клоне
 * `+x` может не быть вовсе (git хранит его, а распаковка тарбола — не всегда), и тогда прямой
 * запуск падает «Permission denied» по причине, не имеющей отношения к статье.
 */
export function interpreterFor(scriptPath) {
  const ext = extname(scriptPath);
  if (ext === ".mjs" || ext === ".js") return [process.execPath, []];
  if (ext === ".py") return ["python3", []];
  return ["bash", []];
}

/** @returns {{dir: string, status: "built"|"failed"|"no-script", script?: string, code?: number}} */
export function buildPaper(
  paperDir,
  {
    candidates = BUILD_SCRIPTS,
    run = spawnSync,
    cwd = process.cwd(),
    // 🔴 `--dry-run` — НЕ удобство. «У какой статьи нет скрипта сборки» это ровно тот вопрос,
    // на который корпус до сих пор отвечал тишиной, и спросить его должно быть можно за
    // секунду, не запуская два десятка проходов pdflatex и не трогая PDF в рабочем дереве.
    //
    // ⚠️ Этот параметр появился со второго захода, и первый заход — сам по себе урок: флаг был
    // разобран в CLI и передан сюда, а ЗДЕСЬ его не существовало. Деструктуризация опций
    // проглатывает неизвестный ключ МОЛЧА, поэтому `--dry-run` отработал как полная сборка и
    // переписал `paper.pdf` в рабочем дереве. Отказ выглядел как успех: вывод сборки на экране
    // легко принять за подробный dry-run.
    dryRun = false,
  } = {},
) {
  const found = findBuildScript(paperDir, candidates);
  const dir = relative(cwd, paperDir) || paperDir;
  if (!found) return { dir, status: "no-script" };
  if (dryRun)
    return { dir, status: "built", script: found.rel, code: 0, dry: true };
  const [bin, pre] = interpreterFor(found.path);
  const r = run(bin, [...pre, found.path], { stdio: "inherit" });
  const code = r.status ?? 1;
  return {
    dir,
    status: code === 0 ? "built" : "failed",
    script: found.rel,
    code,
  };
}

/** Непосредственные подкаталоги, похожие на статью. Скрытые — не статьи. */
export function papersIn(root, markers = PAPER_MARKERS) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => join(root, e.name))
      .filter((d) => markers.some((m) => existsSync(join(d, m))));
  } catch {
    return [];
  }
}

export function formatResults(results) {
  const line = (r) =>
    r.status === "built"
      ? `  ✓ ${r.dir} — ${r.script}${r.dry ? "  (не запускался: --dry-run)" : ""}`
      : r.status === "failed"
        ? `  ✗ ${r.dir} — ${r.script} вышел с кодом ${r.code}`
        : `  ✗ ${r.dir} — НЕТ скрипта сборки`;
  return results.map(line).join("\n");
}

/**
 * 🔴 «Нет скрипта» СЧИТАЕТСЯ ОТКАЗОМ наравне с упавшей сборкой. Именно различение этих двух
 * случаев и порождало тихий пропуск: «нечего собирать» и «собралось» давали один и тот же
 * зелёный прогон.
 */
export const anyFailed = (results) => results.some((r) => r.status !== "built");

export function remedyFor(results, candidates = BUILD_SCRIPTS) {
  const missing = results.filter((r) => r.status === "no-script");
  if (missing.length === 0) return "";
  return (
    `\nНи одного скрипта сборки не нашлось у: ${missing.map((r) => r.dir).join(", ")}.\n` +
    `Искали (в этом порядке): ${candidates.join(", ")}.\n` +
    `Это НЕ «нечего собирать» — это статья, которую не соберёт ни CI, ни человек одной командой.\n` +
    `Положите скрипт по одному из этих путей либо назовите свой в rpp.json: { "buildScripts": [...] }`
  );
}
