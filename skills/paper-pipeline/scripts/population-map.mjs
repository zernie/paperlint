#!/usr/bin/env node
/**
 * population-map.mjs — держит ли реестр популяций связь с телом статьи?
 *
 * (До 2026-08-26 файл отвечал на вопрос «может ли читатель понять, КАКОЕ МНОЖЕСТВО считает
 *  каждое число» целиком; половина ответа теперь в правилах ESLint — см. ниже.)
 *
 *   node population-map.mjs <paper-dir>              report
 *   node population-map.mjs <paper-dir> --flags-only for hooks and pre-commit
 *
 * 🔴 WHY THIS EXISTS. `papers/CLAUDE.md` has carried this as writing rule #3 since 2026-08-05:
 *
 *     «Число приходит с тем, что оно считает, и из чего. […] Если два числа из разных
 *      экспериментов — сказать это В ТОМ ЖЕ ПРЕДЛОЖЕНИИ.»
 *
 * It was written after a cold reader gave up tracking the abstract's populations halfway through.
 * It is prose. Nothing enforced it. On 2026-08-06 the author read the finished paper and said he
 * could not follow his own §4 — and the cause was not the count of measurements, it was that §4
 * moves between TWO SAMPLES THAT BARELY OVERLAP (a targeted census of 134 repositories and a broad
 * corpus of 1,921; seven repositories are in both) and never says so. §4.1's rate and §4.3's rate
 * read as if one replicated the other. They cannot: they are different populations.
 *
 * That is this repository's own thesis turned on its own manuscript — a rule written in a rules
 * file, with no mechanism behind it, that therefore did nothing for a year of edits. So the rule
 * gets a leg.
 *
 * 🔴 ДВЕ ИЗ ЧЕТЫРЁХ НАХОДОК УЕХАЛИ В ПРАВИЛА ESLint 2026-08-26. Здесь остались только те, что
 * говорят про САМ РЕЕСТР, а не про статью:
 *
 *   stale    строка реестра для величины, которую тело БОЛЬШЕ НЕ ПЕЧАТАЕТ. Реестр сжимается
 *            вместе со статьёй и не гниёт.
 *   badref   строка ссылается на `related_to`, которого нет ни одной строкой.
 *
 * Обе неотделимы от файла `repro/populations.tsv` и НЕ ИМЕЮТ АДРЕСА В СТАТЬЕ: `stale` по
 * определению говорит про число, которого в статье нет, а `badref` — про два поля одной строки
 * TSV. Правило ESLint умеет репортить только в линтуемый файл, поэтому перенести их значило бы
 * указывать пальцем в статью и говорить про другой файл.
 *
 * УЕХАЛО В `eslint-rules/paper-registry.mjs` (правила `paper/population-untied` и
 * `paper/population-undeclared`):
 *   untied      — популяция не названа в ОДНОМ ПРЕДЛОЖЕНИИ с той, из которой выведена;
 *   undeclared  — число напечатано в форме популяции, и ни одна строка реестра его не заявляет.
 * Обе говорят про место В СТАТЬЕ, и реестр для них — конфигурация, ровно как профиль площадки
 * для `pdf/profile`. Паритет доказан до удаления (настоящая статья + 17 фикстур), разбор —
 * `the author's private research notes`.
 *
 * Advisory.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { headings as mdHeadings, requireMarkdown } from '../../../lib/markdown.mjs';
import { isMain } from "./consumer.mjs";

// Разбор разметки — парсером (`CLAUDE.md`, 2026-08-11). Падаем, а не деградируем: без границ
// тела статьи `bodyOf()` вернул бы пустую строку, а из пустой строки эта проверка выводит
// «ни одно число реестра не напечатано», то есть ВСЕ строки stale — уверенный список находок
// про статью, которой никто не читал.
requireMarkdown();

/** The body is everything before the bibliography; appendices sit after it in this paper and are
 *  not under the page limit, so a relation stated only there does not reach the reader who stops
 *  at the References. That asymmetry is the whole point of checking the body separately. */
export function bodyOf(md) {
  const stripped = md.replace(/<!--[\s\S]*?-->/g, '');
  // 2026-08-11: обе границы тела берёт парсер. `/^##\s+References\s*$/m` открывало/закрывало
  // тело по решёткам в начале строки — включая решётки внутри ```-блока, а эта статья цитирует
  // куски чужих статей целиком. Соглашение `-1` и сравнения `< 0` оставлены как были.
  const at = (re) => {
    const h = mdHeadings(stripped).find((x) => x.depth === 2 && re.test(x.text));
    return h ? h.offset : -1;
  };
  const cut = at(/^References$/u);
  const start = at(/^Abstract$/u);
  return stripped.slice(start < 0 ? 0 : start, cut < 0 ? stripped.length : cut);
}

const asLiteral = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A printed quantity, not a substring of a longer one: 189 must not match inside 1,189 or 1893.
 *  The trailing guard must still allow ORDINARY PUNCTUATION after the number — "of the 1,921, we
 *  could enumerate 189" and a sentence-final "...over all 1,921." are both the number being
 *  printed. Forbidding any following `.` or `,` silently loses exactly the positions a summary
 *  figure lands in; only a DIGIT after the separator makes it part of a longer quantity. */
const printed = (n) => new RegExp(`(?<![\\d,.])${asLiteral(n)}(?!\\d|[,.]\\d)`);

export function parseRegistry(tsv) {
  const rows = [];
  for (const line of tsv.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [id, print, relation, relatedTo, gloss] = line.split('\t').map((c) => (c ?? '').trim());
    if (!id || id === 'id') continue;
    rows.push({ id, print, relation, relatedTo, gloss });
  }
  return rows;
}

export function findings(md, tsv) {
  const body = bodyOf(md);
  const reg = parseRegistry(tsv);
  const byId = new Map(reg.map((r) => [r.id, r]));
  const out = [];

  for (const row of reg) {
    const appears = printed(row.print).test(body);
    if (!appears) {
      // A registry row for a quantity the body no longer prints. Same discipline as the
      // grandfathered numbers list: the registry shrinks when the paper does, and never rots.
      if (row.relation !== 'retired') out.push({ kind: 'stale', row });
      continue;
    }
    if (row.relation === 'root' || row.relation === 'external') continue;
    // Порядок сохранён из исходника: `untied` считался ПОСЛЕ этой проверки и уехал в
    // `paper/population-untied`; висячая ссылка осталась тут, потому что она про строку TSV.
    if (!byId.get(row.relatedTo)) out.push({ kind: 'badref', row });
  }
  return out;
}

/* Importable above this line; the CLI only runs when this file is the entry point, so the selftest
 * can exercise findings() without the argv handling firing. */
if (!isMain(import.meta.url)) {
  // imported — nothing to do
} else main();

function main() {
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const flagsOnly = args.includes('--flags-only');
if (!dir) { console.error('usage: node population-map.mjs <paper-dir> [--flags-only]'); process.exit(0); }

const paperPath = ['paper.md', 'draft.md'].map((f) => join(dir, f)).find(existsSync);
const regPath = join(dir, 'repro', 'populations.tsv');
// Same silent-skip class as artifact-coverage.mjs — see the note there (measured 2026-08-25).
if (!paperPath || !existsSync(regPath)) {
  const why = !paperPath
    ? 'no paper.md/draft.md — this checker reads markdown only, a .tex paper is NOT covered'
    : `no registry at ${regPath}`;
  console.error(`⏭️  population map SKIPPED for ${dir} — ${why}.`);
  process.exit(0);
}

const found = findings(readFileSync(paperPath, 'utf8'), readFileSync(regPath, 'utf8'));

if (!found.length) {
  if (!flagsOnly) console.log('population map: the registry matches the body — no stale rows, no dangling related_to.');
  process.exit(0);
}

console.log(`population map — ${found.length} finding(s) in ${paperPath}`);
for (const f of found) {
  if (f.kind === 'stale') {
    console.log(`  ·  ${f.row.print} (${f.row.id}) is declared and the body no longer prints it — drop the row or mark it retired`);
  } else if (f.kind === 'badref') {
    console.log(`  🔴 ${f.row.id} says it relates to "${f.row.relatedTo}", which is not a row in populations.tsv`);
  }
}
process.exit(0);
}
