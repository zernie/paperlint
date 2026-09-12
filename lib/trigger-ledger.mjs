/**
 * trigger-ledger.mjs — «этот description измерен, вот когда и с каким результатом».
 *
 * ЗАЧЕМ. Триггер-эвалы платные и потому не в CI («Не CI. Гонять осознанно» — так написано
 * в каждом `*.eval.mjs`). Следствие, замеренное 2026-08-28: recall — величина, полученная
 * ОДНАЖДЫ, а не поддерживаемая. Переформулируй кто-нибудь `description` завтра — регрессию
 * срабатывания не поймает никто и никогда, потому что ловить её нечем и некому.
 *
 * 🔴 ПОЧЕМУ НЕ ВЗЯЛИ ГОТОВЫЙ `skillHash()`. Он хеширует ВЕСЬ каталог скилла (`.md`, `.mjs`,
 * `.sh`, `.py`, `.ts`). На выбор скилла моделью влияет РОВНО ОДНО ПОЛЕ — `description`:
 * кит эвала ставит `stubSkillBodies: true` с комментарием «selection is decided by
 * frontmatter; don't run the body». Возьми мы каталог целиком — гейт краснел бы от опечатки
 * в теле и от каждого нового харнесса, то есть почти всегда. Красная-без-причины проверка
 * живёт один день, её глушат, и дыра возвращается уже незаметной. Поэтому хешируется поле.
 *
 * ⚠️ ЧЕГО ЭТОТ ЛЕДЖЕР НЕ ЗНАЕТ. Он не знает, что описание стало ЛУЧШЕ или ХУЖЕ — только
 * что оно ДРУГОЕ. Вердикт по-прежнему даёт платный прогон; здесь лишь фиксируется, что
 * прогон относится к этому тексту, а не к какому-то прежнему.
 *
 * vigiles:local-by-design — родовая версия («coverage должен покрывать эвал-ярус, а не
 * только харнесс») принадлежит продукту: `.vigiles/coverage.json` пишет CLI из завершённого
 * прогона, а `*.eval.mjs` запускаются как `node <файл>` мимо CLI, поэтому эвалов там НОЛЬ
 * при 50 записях харнессов (замер 28.08). Здесь остаётся наше: какие ИМЕННО наши описания
 * измерены и с каким числом.
 */
import { createHash } from "node:crypto";
import * as fsMod from "node:fs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { consumerRoot } from "../skills/paper-pipeline/scripts/consumer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// The CONSUMER's root, not this file's grandparent — see the same note in `skill-corpus.mjs`.
// The ledger itself (`.claude/skill-trigger-runs.json`) is the consumer's DATA and stays there;
// only the code that reads and writes it lives here.
export const ROOT = consumerRoot();
export const LEDGER = join(ROOT, ".claude", "skill-trigger-runs.json");
const SKILLS = join(ROOT, ".claude", "skills");

// База долга УДАЛЕНА 2026-08-28. Здесь стоял храповик с 24 именами «не мерен ни разу» —
// и это был способ не делать работу. The corpus owner: «опять храповик блять… давай нормально править».
// Все 24 прогнаны (~40 мин машинного времени, $0 метрируемых — подписка), долг погашен,
// проверка стала обычным гейтом. Смысл её от этого поменялся: было «долг не растёт»,
// стало «замер обязан относиться к нынешнему описанию». Тот же переход, что у долга по
// markdown-регуляркам, и по той же причине — гасить дешевле, чем обслуживать.

/** Точный текст `description:` из frontmatter. Пустая строка, если поля нет. */
export function descriptionOf(skill) {
  const p = join(SKILLS, skill, "SKILL.md");
  if (!existsSync(p)) return "";
  const src = readFileSync(p, "utf8");
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return "";
  // description может быть многострочным до следующего ключа верхнего уровня
  const m = fm[1].match(/^description:[ \t]*([\s\S]*?)(?=\r?\n[a-zA-Z_-]+:|$)/m);
  return m ? m[1].trim() : "";
}

export const hashOf = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * Хеш ВСЕГО набора описаний — «против кого мерили».
 *
 * 🔴 Зачем вторая метка (вопрос владельца корпуса, 2026-08-28). Триггер-эвал меряет ВЫБОР модели из
 * всех установленных описаний — кит так и пишет: «whole-harness by construction… изолированный
 * замер завышает recall и занижает ложные срабатывания». Значит мой recall может протухнуть
 * от правки ОПИСАНИЯ СОСЕДА: он начнёт выигрывать мои промпты, а моё описание не изменится
 * ни на символ. Хеша своего поля для этого мало.
 *
 * ⚠️ Но и хешировать корпус ЖЁСТКО нельзя: одна правка любого описания обнулила бы все
 * записи разом, и проверка снова стала бы красной-всегда. Поэтому громкость разная:
 * своё описание изменилось → ЗАМЕР НЕДЕЙСТВИТЕЛЕН (ошибка);
 * изменился набор конкурентов → замер ОСЛАБ (пометка в леджере, без крика).
 */
export function corpusHash() {
  const { readdirSync } = require$fs();
  const names = readdirSync(SKILLS)
    .filter((d) => existsSync(join(SKILLS, d, "SKILL.md"))).sort();
  return hashOf(names.map((n) => n + "\u0000" + descriptionOf(n)).join("\u0001"));
}
function require$fs() { return fsMod; }

export const readLedger = () =>
  existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { v: 1, runs: {} };

/** Записать состоявшийся замер. Вызывается китом ПОСЛЕ прогона, не до. */
export function recordRun(skill, { recall, precision, model, trials }) {
  const l = readLedger();
  l.runs[skill] = {
    description_sha: hashOf(descriptionOf(skill)),
    corpus_sha: corpusHash(),
    measured_at: new Date().toISOString().slice(0, 10),
    recall, precision, model, trials,
  };
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");
  return l.runs[skill];
}

/**
 * Скиллы, у которых ЕСТЬ `*.eval.mjs`, но замер не относится к нынешнему описанию.
 * Возвращает [{skill, reason}]. `reason` — 'never' либо 'changed'.
 */
export function staleSkills(skillsWithEval) {
  const l = readLedger();
  const out = [];
  for (const s of skillsWithEval) {
    const rec = l.runs[s];
    if (!rec) { out.push({ skill: s, reason: "never" }); continue; }
    if (rec.description_sha !== hashOf(descriptionOf(s))) {
      out.push({ skill: s, reason: "changed", measured_at: rec.measured_at });
      continue;
    }
    // Своё описание то же, но конкуренты другие — замер ослаб, а не умер.
    if (rec.corpus_sha && rec.corpus_sha !== corpusHash())
      out.push({ skill: s, reason: "corpus", measured_at: rec.measured_at, soft: true });
  }
  return out;
}

// ── CLI: `node .claude/lib/trigger-ledger.mjs --check` ────────────────────────────
// Дёшево: ни модели, ни сети — только чтение frontmatter и сравнение хешей.
// Ровно поэтому это можно держать в CI, в отличие от самих эвалов.
if (process.argv[1] && process.argv[1].endsWith("trigger-ledger.mjs")) {
  const { readdirSync } = await import("node:fs");
  const withEval = readdirSync(SKILLS).filter((d) =>
    existsSync(join(SKILLS, d, `${d}.eval.mjs`)));
  // ХРАПОВИК, а не гейт. Замер 2026-08-28 на чистом дереве: 24 находки «не мерен ни разу»
  // — у paper-скиллов срабатывание мерили раньше, просто не в этот леджер, которому пять
  // минут. Проверка с 24 красными строками в первый день не читается, а глушится: ровно так
  // в этой репе уже умирал долг по markdown-регуляркам, и там из этого сделали храповик.
  //
  // Поэтому: «изменился description после замера» — ГРОМКО ВСЕГДА, это и есть регрессия,
  // ради которой всё затевалось. «Не мерен ни разу» — громко только для скиллов, которых
  // нет в базе долга, то есть для НОВЫХ. Долг не растёт молча, но и не орёт каждый прогон.
  const all = staleSkills(withEval);
  const soft = all.filter((x) => x.soft);
  const stale = all.filter((x) => !x.soft);
  // ОДНОЙ строкой, а не по строке на скилл. Замер 2026-08-28: правка ОДНОГО описания меняет
  // общий хеш корпуса, и по-строчный вывод дал 27 пометок разом. Двадцать семь информационных
  // строк на каждую правку — это шум, который глушат; тогда и жёсткая половина перестанет
  // читаться вместе с ним.
  // Три имени + счётчик, а не только счётчик и не 27 строк. Голый счётчик нельзя проверить
  // и не с чего начать перемер; по строке на скилл — 27 строк шума на каждую правку (замер
  // 28.08). Ассерт «пометка адресная» в харнессе требует именно имён — и он был КРАСНЫМ с
  // 28.08 по 31.08, потому что код печатал только счётчик: харнесс написали, объявили
  // работающим и не прогнали.
  if (soft.length) {
    const names = soft.slice(0, 3).map((x) => x.skill).join(", ");
    console.log(`ℹ️ набор конкурирующих описаний изменился после последнего замера — ` +
      `у ${soft.length} скилл(ов) recall мог сдвинуться, не тронув их собственное описание ` +
      `(${names}${soft.length > 3 ? ` и ещё ${soft.length - 3}` : ""}). ` +
      `Не ошибка: перемерить при случае.`);
  }
  // 🔴 ЗНАМЕНАТЕЛЬ ОБЯЗАТЕЛЕН. Строка «✓ актуальны для 27» читается как «27 скиллов в
  // порядке», хотя истинное утверждение — «27 из 50 вообще попадают под проверку»: скилл
  // без своего .eval.mjs невыразим для этого гейта, перемерять у него нечего. Замер
  // 2026-08-31: 50 скиллов на диске, 27 с эвалом, 23 без. В тот день я изменил description
  // у telegram-channel-audit (эвала нет), гейт напечатал зелёное, и это выглядело как
  // «изменение проверено». Счётчик, не называющий, что он игнорирует, врёт — правило
  // CLAUDE.md §«Счётчик, который считает то, что ИГНОРИРУЕТ».
  const total = readdirSync(SKILLS).filter((d) => existsSync(join(SKILLS, d, "SKILL.md"))).length;
  const noEval = total - withEval.length;
  if (!stale.length) {
    console.log(`✓ триггер-замеры актуальны для ${withEval.length} скилл(ов) из ${total}` +
      (noEval ? ` — у остальных ${noEval} НЕТ своего .eval.mjs, они вне этой проверки ` +
        `по построению (мерять нечего, а не «в порядке»)` : ""));
    process.exit(0);
  }
  for (const s of stale) {
    console.error(s.reason === "never"
      ? `✗ ${s.skill}: есть ${s.skill}.eval.mjs, но замера срабатывания НЕ БЫЛО ни разу`
      : `✗ ${s.skill}: description изменён после замера ${s.measured_at} — recall относится к прежнему тексту`);
  }
  console.error(`\nПрогнать: node .claude/skills/<skill>/<skill>.eval.mjs` +
    `\nЭто платный ярус (реальная модель), поэтому CI его не запускает — он только требует, ` +
    `чтобы прогон был и относился к нынешнему описанию.`);
  process.exit(1);
}
