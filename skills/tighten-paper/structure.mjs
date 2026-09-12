#!/usr/bin/env node
/**
 * 🔴 2026-08-26 — ВСЕ ШЕСТНАДЦАТЬ ПРОВЕРОК ОТСЮДА УЕХАЛИ. ЭТОТ ФАЙЛ ТЕПЕРЬ ТОЛЬКО ОПИСЬ.
 *
 * Четырнадцать стали правилами `@eslint/markdown` в `eslint-rules/paper-structure.mjs`
 * (двенадцать правил — у двух по два `messageId`), две удалены как дубли уже перенесённого:
 * доля свободной половины дублировала `paper/appendix-ratio`, а «нумерованная секция без
 * `carries:`» — `paper/section-justification`, обе из `eslint-rules/paper-prose.mjs`.
 * Паритет доказан ДО вырезания: 29 входов (настоящая статья + 22 фикстуры «один дефект за
 * раз» + 6 краевых), расхождений 0, все числа совпали побайтово. Разбор и таблица
 * классификации — в приватных заметках автора
 * (`papers/research/2026-08-26-klassifikatsiya-structure.md`).
 *
 * ЧТО ОСТАЛОСЬ И ПОЧЕМУ ЭТО НЕ ПРОВЕРКА. Опись — таблица «own / total / share / секция» с
 * пометкой `carries:` под каждой строкой. У неё нет порога и она не производит находок: её
 * читает ЧЕЛОВЕК в скилле `tighten-paper`, чтобы сравнить вес секции с тем, что секция сама
 * о себе заявляет. Ровно это сравнение и было идеей автора («печатать заявление рядом с
 * весом»), и линтеру его не выразить — у находки нет места, куда положить всю таблицу.
 *
 * ⚠️ `--flags-only` СОХРАНЁН, НО ВСЕГДА МОЛЧИТ И ВСЕГДА ВЫХОДИТ В 0.
 *
 * ── 2026-08-26, ВЕЧЕР: ОБА НАЗВАННЫХ ПОТРЕБИТЕЛЯ ЗАКРЫТЫ, И НАШЁЛСЯ ТРЕТИЙ ────────────────
 *
 * Абзац выше называл двух вызывающих и говорил, что пока они не переведены, леджер пишет
 * «находок нет» ПО МОЛЧАНИЮ. Это было верно и измерено: на `the reference paper/paper.md`
 * `--flags-only` печатал 0 строк, а те же байты через ESLint дают **6 находок**
 * (`subsection-size` ×2 · `section-lead` · `free-section-size` ×2 · `block-ungraded`).
 *
 *   `.github/workflows/paper-gates.yml`, шаг `structure`  → УДАЛЁН. Рядом уже стоял шаг
 *       `eslint`, гоняющий те же правила по тому же глобу; замер показал побайтово тот же
 *       список файлов. Обоснование целиком — в комментарии на месте удалённого шага.
 *   `run-mechanical.mjs`, строка `tighten-paper/structure` → ПЕРЕВЕДЕНА на ESLint
 *       (`read: 'eslint'`, фильтр по правилам из `eslint-rules/paper-structure.mjs`). Не
 *       удалена: ESLint в леджер не пишет ничего, а леджер — единственное место, где факт
 *       «структуру этой статьи на этих байтах кто-то смотрел» хранится с хешем входа.
 *
 * 🔴 ТРЕТИЙ ВЫЗЫВАЮЩИЙ, КОТОРОГО БАННЕР НЕ ЗНАЛ: `.githooks/pre-commit`. Печатал пустоту и
 * глотал код возврата через `|| true`. Урок ровно тот, что уже записан в `CLAUDE.md` про четыре
 * формы ссылки: баннер перечислял вызывающих ПО ПАМЯТИ, а полный список даёт только греп по
 * имени флага.
 *
 * ✅ ЗАКРЫТ 2026-08-26. Вызов переведён на ESLint через `.githooks/structure-gate.mjs`
 * (имена правил ВЫВОДЯТСЯ из `eslint-rules/paper-structure.mjs`, а не переписаны списком),
 * `|| true` снят, коды возврата разведены: 0 — судил · 2 — НЕ судил, коммит отклоняется ·
 * 3 — нет `node_modules/.bin/eslint`, громко и не блокируя. Тест — `.githooks/structure-gate.harness.mjs`,
 * пять мутаций, у каждой доказано, что патч лёг. Замер: на тех же байтах старый вызов давал 0
 * находок и 0 байт вывода, ESLint теми же правилами — **6**.
 *
 * ⚠️ И проверка ПОЛНОТЫ списка, которой в прошлый раз не было: в `pre-commit` идиома
 * `--flags-only … || true` встречается ЧЕТЫРЕ раза. Прогнаны все, 26.08:
 *   `prose-lint.mjs`        — жив (2 находки, exit 1)
 *   `artifact-coverage.mjs` — жив (6 находок, exit 1)
 *   `population-map.mjs`    — молчит ЗАКОННО (строка 144: в этом режиме чистый прогон не печатает
 *                             ничего; на настоящей статье реестр сходится)
 *   `structure.mjs`         — был мёртв, закрыт выше
 * Список без третьей колонки — это перечисление, а не проверка.
 *
 * ⚠️ ФЛАГ НЕ УДАЛЁН И УДАЛЯТЬ ЕГО НЕЛЬЗЯ БЕЗ ПРАВКИ ЧУЖИХ ФАЙЛОВ: его молчание закреплено
 * двумя ассертами — `eslint-rules/paper-structure.harness.mjs` (≈550) и
 * `.claude/skills/paper-pipeline/scripts/gates.harness.mjs` (блок 1). Оба падают, если этот
 * режим снова что-то напечатает ИЛИ выйдет ненулевым кодом. Печатать здесь указатель «смотри
 * eslint» по-прежнему запрещено: `read: 'flags'` у любого оставшегося потребителя превратит
 * его в вечную ложную находку.
 */
/**
 * structure.mjs — the mechanical leg of tighten-paper.
 *
 *   node structure.mjs <paper.md>              the whole paper
 *   node structure.mjs <paper.md> --section=3  one section and its subsections
 *   node structure.mjs <paper.md> --flags-only ⚠️ ВСЕГДА МОЛЧИТ (см. баннер выше)
 *
 * WHY THIS EXISTS, and why it is NOT in prose-lint. Prose-lint judges sentences. Structure is a
 * different question and was homeless: `tighten-paper` is a skill — a model reading and judging —
 * with no script under it, so nothing mechanical ever looked at the document's SHAPE. Author,
 * 2026-08-05: *"я думал проза это про прозу, а структура это другой вообще"*, and before that
 * *"нужно чтобы релевантный скилл делал то же самое для всей статьи по умолчанию или для секции"*.
 *
 * 🔴 The failure that motivated it. Asked whether the contribution was short-changed, word counts
 * answered "no" — section 3 had 38% more words than related work — and that answer was true and
 * useless. The shape showed the real defect: three top-level sections owned 0, 28 and 38 words
 * before their first subsection. They were dividers wearing section numbers, and a reader met a
 * heading and fell straight through it into a subsection. No metric in the toolchain asked that
 * question, because every metric was per-sentence or per-document and none was per-SECTION.
 *
 * What this prints is an inventory first and findings second, deliberately. The judgement — is this
 * the right order, does this heading name a thing, does this section earn its place — stays with the
 * skill, because it is judgement. Only the mechanically decidable part is compiled.
 */
import { readFileSync } from 'node:fs';
import { headings as mdHeadings, splitSections, stripFences, requireMarkdown, stripFrontmatter } from '../../lib/markdown.mjs';

// Разбор разметки — парсером (`CLAUDE.md`, 2026-08-11). Падаем, а не деградируем: без парсера
// в статье не нашлось бы ни одной секции, `--flags-only` вернул бы 0 находок и код 0 — то есть
// «структура в порядке» про документ, который никто не прочитал. Этот файл ровно про то, что
// метрика без порога и проверка без наблюдаемости молча ничего не значат; уверенный ноль тут
// был бы третьим экземпляром той же ошибки в одном файле.
requireMarkdown();

// Заголовки уровня 2–3 — то, что этот файл называет «секцией» и «подсекцией». Раньше это же
// было записано как `#{2,3}`, то есть как утверждение о ЧИСЛЕ РЕШЁТОК: `#{2,3}` считал секцией
// любую такую строку, включая строку внутри ```-блока. Статьи в этой репе цитируют чужую
// разметку кусками, так что «лишняя секция из цитаты» — не гипотеза.
const SECTION_MIN = 2, SECTION_MAX = 3;

// Пороги (60 слов лида · 350 слов подсекции · 100% свободной половины · 1.0 к самой тяжёлой
// секции) уехали вместе с проверками — они живут опциями правил в `eslint-rules/paper-structure.mjs`,
// а КАЛИБРОВКА каждого (почему именно 60 и именно 350, и на каком корпусе мерили) перенесена
// туда же комментариями. Здесь их держать нельзя: число без порога — проза, а порог без
// проверки — второй источник правды, который разъедется с первым.

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('usage: node structure.mjs <paper.md> [--section=N]   (--flags-only принимается и молчит)');
  process.exit(0);
}
const only = (args.find((a) => a.startsWith('--section=')) || '').split('=')[1] || null;
const flagsOnly = args.includes('--flags-only');

let t = readFileSync(file, 'utf8');
// `stripFences()` вместо `/^```[\s\S]*?^```/gm`: то выражение при НЕЧЁТНОМ числе фенсов
// склеивало конец одного блока с началом следующего и вырезало прозу между ними — а вырезанная
// проза здесь это заниженный вес секции, то есть находка «это разделитель, а не секция» на
// секции, с которой всё в порядке.
// `blank: true` — строки блока становятся пустыми, а не исчезают: код-блок это граница
// абзаца, и удаление строк склеило бы соседние абзацы. Здесь это на числа не влияет (слова
// и заголовки считаются одинаково), но форма должна совпадать с `prose-lint`, где влияет.
t = stripFences(
  stripFrontmatter(t)                           // frontmatter
   .replace(/<!--[\s\S]*?-->/g, ''),            // working comments
  { blank: true },
);
// Body and FREE SECTIONS are measured separately. They hold different bars — the body has a page
// limit and the free sections do not — but "does not count against the limit" is not "unmeasured".
// 🔴 Until 2026-08-05 this script cut at `## Limitations` and never looked further, so every answer
// it gave to "do all the sections survive?" silently excluded Limitations, Ethics and every
// appendix. The author asked the question about those exact sections and the tool could not have
// answered it. A free section is where unbudgeted prose accumulates precisely because nothing
// prices it.
// 2026-08-11: три границы (свободные секции · библиография · приложения) ищет парсер.
// Соглашение `-1 / offset` и сравнения `> 0`, `< 0` сохранены как были — заголовок в самой
// первой строке файла прежние выражения границей тоже не считали, и менять это здесь значило
// бы завести новое поведение под видом перевода на парсер.
const headOffset = (re) => {
  const h = mdHeadings(t).find((x) => x.depth === 2 && re.test(x.text));
  return h ? h.offset : -1;
};
const cut = headOffset(/^(Limitations|References|Ethical)/u);
const body = cut > 0 ? t.slice(0, cut) : t;
const refs = headOffset(/^References/u);
const appx = headOffset(/^Appendix/u);
const freeText = cut > 0 ? (refs > cut ? t.slice(cut, refs) + t.slice(appx < 0 ? t.length : appx) : t.slice(cut)) : '';

const wordsOf = (s) => (s.match(/[A-Za-z0-9%.'’-]+/g) || []).length;

// 🔴 `carries:` notes are read back OUT, not just written. The convention puts a working comment
// above each heading saying what that section carries and whether it is justified — and until
// 2026-08-05 nothing ever read one. They were write-only: authored during a tighten pass, then
// invisible to every later pass, including the passes deciding whether a section earns its place.
// Author's idea, and it is the right one: print the claim beside the weight, so "this section is
// 564 words" and "this section claims to carry X" are read in the same glance.
// 🔴 A justification with no SCALE and no VERDICT cannot decide anything, and for a week none of
// these notes ever concluded "cut me". Author, 2026-08-06: *«читая статью создаётся впечатление —
// блин, а эта секция точно нужна»*, and *«каждая секция приложения должна тоже иметь коммент с
// оправдыванием себе и оценкой от 0 до 10 и пометкой нужно ли вырезать/перенести/сократить»*.
//
// The defect is structural, not laziness. A free-text note is a section arguing its own case, and a
// section always wins that argument — there is no scale to rank it against its neighbours and no
// slot in which the answer can come out negative. So the note now carries three things:
//
//   score:   0-10, how much a REVIEWER'S DECISION depends on this. Not how interesting it is.
//   verdict: KEEP | SHORTEN | MOVE | MERGE | CUT — what to DO, in a fixed vocabulary
//   carries: what it holds, as before
//
// The pairing is what makes it work: a low score with a KEEP verdict is a visible contradiction,
// and the script reports it. Free text could never contradict itself.
// The colon is optional, because the skill's own documented example writes `· score 7/10 ·` and the
// first version of this regex demanded `score:`. The spec and the check disagreed, so the checker
// reported "no score:" on notes that carried a perfectly good score — the same defect class this
// paper is about, committed between a skill and its own compiled leg. Caught 2026-08-06 within
// minutes, because the check was running.
const NOTE_RE = /score:?\s*(\d{1,2})\s*(?:\/\s*10)?/i;
const VERDICT_RE = /verdict:\s*(KEEP|SHORTEN|MOVE|MERGE|CUT)\b/i;

const rawSections = stripFrontmatter(readFileSync(file, 'utf8'));
const carriesFor = new Map();
const scoreFor = new Map();
const verdictFor = new Map();
// `(?:(?!-->)[\s\S])*?` and not `[\s\S]*?`: a lazy match will happily jump ACROSS a closing `-->`
// when the comment it belongs to is not followed by a heading, swallowing the next comment whole and
// attributing its note to the wrong section. Caught 2026-08-05 within a minute of the check existing,
// which is the same reason the check exists.
for (const m of rawSections.matchAll(/<!--((?:(?!-->)[\s\S])*?)-->\s*\n(#{2,3}) (.+)/g)) {
  const note = m[1].replace(/\s+/g, ' ');
  const c = note.match(/carries:\s*(.+?)(?:·|justified:|note:|costs:|verdict:|because:|-->|$)/i);
  if (c) carriesFor.set(m[3].trim(), c[1].trim());
  const s = note.match(NOTE_RE);
  if (s) scoreFor.set(m[3].trim(), Number(s[1]));
  const v = note.match(VERDICT_RE);
  if (v) verdictFor.set(m[3].trim(), v[1].toUpperCase());
}

// Заметки жирных лид-инов приложения (`score:`/`verdict:` над `**Блок.**`) читает теперь
// `paper/block-ungraded` · `paper/block-note` · `paper/block-verdict`. Опись их не печатает,
// поэтому здесь их не разбирают.

const outline = [];
for (const chunk of splitSections(body, { min: SECTION_MIN, max: SECTION_MAX })) {
  if (!chunk.heading) continue;                  // преамбула до первого заголовка — не секция
  const title = chunk.heading.text;
  outline.push({
    // `chunk.body` — кусок УЖЕ без строки заголовка, поэтому прежний
    // `chunk.replace(/^#{2,3} .+$/m, '')` больше не нужен: удаление строки заголовка это часть
    // нарезки, а не отдельная операция над текстом.
    level: chunk.heading.depth, title, words: wordsOf(chunk.body),
    carries: carriesFor.get(title) ?? null,
  });
}

// Own words + everything underneath, so a section's true weight is visible next to its lead.
for (let i = 0; i < outline.length; i++) {
  let total = outline[i].words;
  if (outline[i].level === 2)
    for (let j = i + 1; j < outline.length && outline[j].level === 3; j++) total += outline[j].words;
  outline[i].total = total;
}

const inScope = (row, i) => {
  if (!only) return true;
  const num = (s) => (s.match(/^(\d+)/) || [])[1];
  if (row.level === 2) return num(row.title) === only;
  for (let j = i; j >= 0; j--) if (outline[j].level === 2) return num(outline[j].title) === only;
  return false;
};

const bodyTotal = outline.filter((r) => r.level === 2).reduce((a, r) => a + r.total, 0);

// The free sections are inventoried HERE, above the findings loop, and not down in the printing
// block where they used to live. That placement was the whole defect: measured in a branch that
// only the human-readable mode reaches, the ratio could never become a finding, so `--flags-only`
// — the mode hooks and CI run — reported a clean document while the unpriced half stood at 165%.
const freeSections = [];
for (const chunk of splitSections(freeText || '', { min: SECTION_MIN, max: SECTION_MAX })) {
  if (!chunk.heading) continue;
  freeSections.push({ level: chunk.heading.depth, title: chunk.heading.text, words: wordsOf(chunk.body) });
}
const freeTotal = freeSections.reduce((a, r) => a + r.words, 0);

// 🔴 ЗДЕСЬ БЫЛИ ШЕСТНАДЦАТЬ НАХОДОК — см. баннер в шапке. Ни одной проверки в этом файле
// больше нет НАМЕРЕННО: два источника правды об одном факте расходятся при первой же правке,
// и вопрос «а какой из них прав» решить нечем.

if (flagsOnly) {
  // Тишина и код 0 — ВСЕГДА. Ни строки в stdout/stderr намеренно: `run-mechanical.mjs` читает
  // этот режим как `read: 'flags'`, то есть «непустой вывод = находка», и указатель «проверки
  // переехали» превратился бы в вечную ложную находку в леджере. Ограничение режима названо
  // в баннере шапки; чинится переводом обоих вызывающих на `npx eslint`, а не здесь.
  process.exit(0);
}

console.log(`\n=== ${file.split('/').pop()} — outline, in order ===`);
console.log(`${'own'.padStart(6)} ${'total'.padStart(6)} ${'share'.padStart(6)}  section`);
for (const [i, r] of outline.entries()) {
  if (!inScope(r, i)) continue;
  const share = r.level === 2 ? `${(100 * r.total / bodyTotal).toFixed(1)}%`.padStart(6) : ' '.repeat(6);
  console.log(
    `${String(r.words).padStart(6)} ${String(r.level === 2 ? r.total : '').padStart(6)} ${share}  ` +
      `${r.level === 3 ? '    ' : ''}${r.title}`);
  // The section's own claim about itself, printed where its weight is read. A section whose note
  // does not survive being read next to its size is a section to cut, and that comparison was
  // impossible to make until both appeared in one place.
  if (r.carries) {
    const s = scoreFor.get(r.title), v = verdictFor.get(r.title);
    const tag = s === undefined && !v ? '' : `[${s ?? '?'}/10 ${v ?? 'NO VERDICT'}] `;
    console.log(`${' '.repeat(21)}${r.level === 3 ? '    ' : ''}↳ ${tag}carries: ${r.carries.slice(0, 80)}`);
  }
  else if (/^\d/.test(r.title)) console.log(`${' '.repeat(21)}${r.level === 3 ? '    ' : ''}↳ 🔴 no carries: note — nobody has said why this section is here`);
}
console.log(`\nbody total ${bodyTotal} words across ${outline.filter((r) => r.level === 2).length} sections`);

// The free sections, measured against the body they hang off. A paper whose unbudgeted prose
// outweighs its budgeted prose is telling you where its author was allowed to keep writing.
if (freeSections.length) {
  console.log(`\n=== outside the page limit ===`);
  for (const f of freeSections) {
    console.log(`${String(f.words).padStart(6)} ${' '.repeat(14)}${f.level === 3 ? '    ' : ''}${f.title}`);
    const c = carriesFor.get(f.title);
    if (c) console.log(`${' '.repeat(21)}${f.level === 3 ? '    ' : ''}↳ carries: ${c.slice(0, 96)}`);
    else if (f.level === 2)
      console.log(`${' '.repeat(21)}↳ 🔴 no carries: note — and no page limit forcing the question`);
  }
  console.log(`\nfree total ${freeTotal} words = ${(100 * freeTotal / bodyTotal).toFixed(0)}% of the body`);
  if (freeTotal > bodyTotal)
    console.log(`🔴 The unbudgeted half is LARGER than the paper. Nothing prices these sections, which\n` +
                `   is exactly why prose settles here. Ask of each: would a reviewer miss it?`);
}

console.log(
  '\nThe rest is judgement and stays with the skill: is this the ORDER a stranger needs, does each\n' +
  'heading name a thing, and does each section earn its place. Read the headings as a set — a\n' +
  'stranger should be able to reconstruct the argument from them alone.');
