#!/usr/bin/env node
/**
 * prose-lint.mjs — countable checks for "reads machine-written" expository prose.
 * Usage: node prose-lint.mjs <file.md|file.txt> [--flags-only|--headings]
 *
 * Every check counts something. Thresholds and their provenance are in THRESHOLDS.
 *
 * 🔴 ЧТО ОТСЮДА УЕХАЛО 2026-08-26 И КУДА. Семь из двенадцати гейтящих метрик перенесены в
 * правила `@eslint/markdown` — `eslint-rules/paper-craft.mjs`:
 *   citation-density · unexplained-jargon · multi-claim-sentence · conceits ·
 *   hedge-density · discourse-subject · undefined-coinage.
 * Паритет доказан на настоящей статье ДО удаления (составы находок совпали, головы
 * предложений — побайтово); замер и классификация всех двенадцати —
 * `papers/research/2026-08-26-klassifikatsiya-prose-lint.md`.
 * Обратно НЕ добавлять: у факта один дом, и `paper-craft.harness.mjs` падает, если число
 * гейтящих метрик здесь вырастет.
 *
 * 🔴 ВТОРАЯ ПАРТИЯ, 2026-09-06: ЕЩЁ ДВЕ УЕХАЛИ, И СНАЧАЛА БЫЛИ РАСШИРЕНЫ ПРИНИМАЮЩИЕ ПРАВИЛА.
 *   frameMarkersPer1000 → `paper/metadiscourse`, находка `density`. Здешний словарь был шире
 *     (17 шаблонов против 9), поэтому сначала слиты словари, потом удалён порог. ⚠️ Слиты НЕ
 *     все семнадцать: шаблоны `\bfirst(ly)?\b(?=[ ,])` / `second` / `third` дали на
 *     `compile-rules-2026/paper.md` 23 совпадения из 27, и НАСТОЯЩИХ среди них НОЛЬ
 *     («Only the second one runs», «The first two rows», «A third group ignores»). Это
 *     обычные прилагательные. В правило уехала форма Хайланда — «First,» в начале клаузы;
 *     на четырёх статьях она даёт 9 совпадений, все настоящие;
 *   epanorthosisPer10k → `paper/ai-tells`, вместе со всеми четырьмя формами и с бэйзлайном
 *     Boggia. Принимающее правило знало только одну форму, и та регулярка ловила «is not X,»
 *     БЕЗ подставленной замены — пять её совпадений на настоящей статье конструкцией не
 *     являлись. Паритет: правило печатает те же `17.2/10k` и те же 10 предложений.
 *
 * 🔴 ОТМЕНЕНО 2026-09-06: «ВТОРАЯ СУЩНОСТЬ НА ФС ⇒ ПРАВИЛУ ESLINT НЕДОСТУПНО» — НЕВЕРНО.
 * Абзац ниже оставлен как запись того, что тут было написано, но ДЕЙСТВОВАТЬ ПО НЕМУ НЕЛЬЗЯ.
 * Замер: `eslint-rules/paper-registry.mjs` делает 8 обращений к диску и читает соседние файлы
 * каталога статьи; `pdf-facts.mjs` открывает PDF и считает sha256; `paper-texcount.mjs` через
 * `execFileSync` ЗАПУСКАЕТ внешнюю программу. Правило ESLint исполняется в node, и `readFileSync`
 * ему доступен ровно так же, как этому скрипту. Настоящая модель «один файл за раз» — про то,
 * КУДА правило репортит, а не про то, что оно читает.
 * ⇒ Все три метрики переклассифицированы как ПЕРЕНОСИМЫЕ и стоят в очереди работ:
 *   `node .claude/lib/refactor-state.mjs --index`, раздел «ПЕРЕНОСИМО».
 *   `captionSentenceWords` / `captionWords` — после одной правки `files:` в `eslint.config.mjs`
 *     (сегодня там стоит только сам `paper.tex` статьи, а подписи лежат в `figures/`).
 *
 * ✅ `abstractVsVenueMedian` ПЕРЕНЕСЕНА 2026-09-07 → `eslint-rules/paper-craft.mjs`, правило
 * `paper/abstract-length` (`warn`). Она и была той, что «без единого условия»: медиана
 * читается из соседнего `CLAUDE.md` ровно так, как `pdf/profile` читает профиль площадки, а
 * адрес находки — строка `## Abstract` в самой статье. Паритет снят ДО удаления на
 * `compile-rules-2026/paper.md`: 306 слов против потолка 305, одна находка и там и там, те же
 * четыре числа. Тест и восемь мутаций — `eslint-rules/paper-craft.{harness,mutations}.mjs`.
 *
 * ЧТО ОСТАЛОСЬ И ПОЧЕМУ — ДВЕ. Абзац ниже писан, когда их было три, и оставлен как запись:
 * читают ВТОРУЮ СУЩНОСТЬ на файловой системе, а правило ESLint видит один линтуемый файл:
 *   ← ОТМЕНЕНО, см. выше
 *   captionSentenceWords, captionWords → вход `figures/*.tex` РЯДОМ со статьёй.
 *
 * ⚠️ `.tex` БОЛЬШЕ НЕ ПРИНИМАЕТСЯ, И ЭТО ИСПРАВЛЕНИЕ ВРАНЬЯ, А НЕ СУЖЕНИЕ. Шапка объявляла
 * `<file.md|file.tex|->` с самого начала, а стриппинга LaTeX в файле нет ни строки. Замер
 * 2026-08-26 на `agenticdev-2026/paper.tex`: печатает `8127 words` при ~4636 настоящих —
 * 43% это преамбула, `%`-комментарии и записи `filecontents`-библиографии, и первыми в
 * списке длинных предложений идут строки `.bib`. Каждая метрика этого файла — доля от
 * числа слов, поэтому все они на `.tex` были занижены примерно вдвое и печатали `ok`.
 * Никто так и не звал его с `.tex` (CI явно печатает `NOT COVERED` для .tex-статей), то
 * есть цена отказа нулевая, а цена уверенного неверного числа — нет. LaTeX-парсер здесь
 * не строится намеренно: занятость инструментов замерена отдельно, см.
 * `papers/research/2026-08-26-proza-v-latex-zanyatost.md`.
 *
 * Advisory: печатает находки; `--flags-only` выходит с кодом 1, если что-то нашлось.
 */
import { headings as mdHeadings, stripFences, requireMarkdown, stripFrontmatter } from '../../lib/markdown.mjs';

// Разбор разметки — парсером (`CLAUDE.md`, 2026-08-11). Падаем, а не деградируем, хотя файл и
// advisory: без парсера тело статьи схлопнулось бы в пустое, а из пустого этот линтер выводит
// ноль по КАЖДОЙ метрике — то есть отчёт «проза идеальна». `paper-lint.mjs` запускает нас
// подпроцессом и печатает наш stderr, так что причина видна, а его собственный гейт не страдает:
// код возврата он глотает намеренно.
requireMarkdown();

const THRESHOLDS = {
  // frameMarkersPer1000 — уехал 2026-09-06 в `eslint-rules/paper-prose.mjs`, в правило
  // `paper/metadiscourse` (находка `density`), вместе с провенансом Хайланда и порогом 10.
  // Словарь FRAME_MARKERS ниже ОСТАЁТСЯ: он слагаемое в metadiscourseTotalPer1000.
  metadiscourseTotalPer1000: { warn: 90, src: 'Hyland 2005 Table 5.1 total 64.9/1000; Table 7.1 totals 60.0-73.6/1000. Warn ~1.4x.' },
  // pureFrameSentencePct / propositionsPerSentence — уехали в `eslint-rules/paper-craft.mjs`
  // как `discourse-subject` и `multi-claim-sentence` (2026-08-26).
  firstMentionDefinites: { warn: 3, src: 'No published rate. Operationalises Pinker\'s curse of knowledge: "the X" on first mention presupposes shared knowledge.' },
  negatedMainClausePct: { warn: 50, src: 'No published rate for negation. Related: Boggia 2026 (arXiv 2607.21498) measures the "not X, but Y" family per 10,000 words; human academic abstracts 3.6, LLM 7.8 (p=0.28, n.s.).' },
  topicChainBreaksPct: { warn: 75, src: 'Gopen & Swan 1990 principles 3-4: "We cannot tell whose story the passage is" when the topic position changes every sentence.' },
  stressPositionWaste: { warn: 0, src: 'Gopen & Swan 1990 principle 2: put the new information you want emphasised in the stress position. A trailing citation/cross-reference/hedge wastes it.' },
  // hedgeWordPct — уехал в `eslint-rules/paper-craft.mjs` как `hedge-density` (2026-08-26).
  // Лексикон HEDGES здесь ОСТАЁТСЯ: он входит слагаемым в metadiscourseTotalPer1000 и в
  // детектор растраченной ударной позиции. Удалить его — значит тихо занизить обе метрики.
  // epanorthosisPer10k — уехал 2026-09-06 в `eslint-rules/paper-prose.mjs`, в правило
  // `paper/ai-tells`, вместе с ЕДИНСТВЕННЫМ опубликованным бэйзлайном во всей связке
  // (Boggia 2026, arXiv 2607.21498: люди 3.6, модели 7.8 на 10 000 слов; порог 15.6) и
  // вместе с лексиконом EPANORTHOSIS. История метрики — «считалась и ПЕЧАТАЛАСЬ БЕЗ ПОРОГА
  // со дня написания линтера, стояла на 29.8 через пять проходов правки, и владелец корпуса нашёл тик
  // глазами раньше инструмента, потому что мерить — не значит проверять» — переехала
  // в шапку правила: она объясняет, почему у метрики обязан быть порог, а не только число.

  contrastivePer10k: { warn: 25, src: 'ours. "rather than" is an ordinary connective; a pile of them is a register problem, but it is NOT the construction Boggia measured and must not borrow that baseline.' },
  // conceitsPer10k — уехал в `eslint-rules/paper-craft.mjs` как `conceits` (2026-08-26).

  // Abstract length, as a multiple of the TARGET VENUE's own median. Владелец корпуса, 2026-08-05: «abstract
  // should be closer to median. no longer than 50% [more than] median». For REALM the measured
  // median over all 34 archival papers is 203 words, so the ceiling is ~305. The previous guidance
  // in this project pointed at the venue MAXIMUM (518) and was wrong in the way maxima always are:
  // it licensed 654 words, longer than any abstract that workshop has ever published, and read as
  // an introduction rather than an abstract. Measure the venue, take the median, allow half again.

  // citationsPerParagraph / jargonPerSentence — уехали в `eslint-rules/paper-craft.mjs` как
  // `citation-density` и `unexplained-jargon` (2026-08-26). Провенанс обоих порогов,
  // включая историю «считать ГРУППЫ, а не номера», переехал вместе с ними.
  // 🔴 FIGURE CAPTIONS ARE PROSE THAT NOTHING WAS READING. They live in figures/*.tex, not in
  // paper.md, so every writing pass, every persona read and every threshold in paper-lint's pre-edit
  // gate was blind to them by construction. Found 2026-08-05 when a reader hit a 136-word caption
  // containing a 54-word sentence — one word under the limit that would have blocked the same
  // sentence had it been typed into the paper. An entire text surface, unchecked.
  captionSentenceWords: { warn: 40, src: 'ours, from this paper\'s own four captions: longest sentences 21, 31, 41 and 54 words. A caption is read in one pass with the figure, so it tolerates less than body prose, where the limit is 55.' },
  captionWords: { warn: 100, src: 'ours, same four captions: 67, 97, 135, 148. ACL captions in the venue corpus run far shorter; past ~100 words a caption is a section that happens to sit under a picture.' },
};

// CONCEITS — уехал в `eslint-rules/paper-craft.mjs` (правило `conceits`, 2026-08-26)
// вместе со всей своей историей настройки.

// --- lexicons ---
// 🔴 FRAME_MARKERS ОСТАЁТСЯ, ХОТЯ ЕГО ПОРОГ УЕХАЛ (2026-09-06) — ровно по той же причине,
// что и HEDGES выше: он слагаемое в `metadiscourseTotalPer1000`, и удалить его значит тихо
// занизить ту метрику. ⚠️ И ЗДЕСЬ ЖЕ ИЗВЕСТНЫЙ ДЕФЕКТ, замеренный в тот же день и НЕ
// починенный: три шаблона порядковых числительных дают на настоящей статье 23 совпадения из
// 27, и настоящих среди них ноль, а `comes? first` записан ДВАЖДЫ (второй раз как
// `come(s)? (first|before)`), то есть каждое «comes first» считается за два. Значит
// `metadiscourse/1000w` в отчёте ниже ЗАВЫШЕН. Не тронуто намеренно: сужение словаря — это
// правка ПОВЕДЕНИЯ живой метрики, у которой здесь нет теста, и делать её под видом переноса
// значило бы поменять число, не показав, что оно поменялось.
const FRAME_MARKERS = [
  /\bcomes? first\b/gi, /\bfirst(ly)?\b(?=[ ,])/gi, /\bsecond(ly)?\b(?=[ ,])/gi, /\bthird(ly)?\b(?=[ ,])/gi,
  /\bfinally\b/gi, /\bto (conclude|summari[sz]e|begin( with)?|start)\b/gi, /\bin (conclusion|summary|what follows|this (paper|section|article))\b/gi,
  /\bwe (begin|start|turn|now turn|conclude|proceed)\b/gi, /\b(my|our) (purpose|aim|goal) is\b/gi,
  /\bthe (rest|remainder) of (this|the)\b/gi, /\bbefore (we|turning|proceeding)\b/gi,
  /\bhere we (show|present|report|argue)\b/gi, /\bwe (report|present) (it|them|this) as\b/gi,
  /\bcome(s)? (first|before)\b/gi, /\bthis (paper|section) (is organi[sz]ed|proceeds)\b/gi,
  /\bwhat follows\b/gi, /\bthe (first|second|two|three) (finding|result|point|thing)s?\b/gi,
];
const TRANSITIONS = [/\bhowever\b/gi,/\bmoreover\b/gi,/\bfurthermore\b/gi,/\btherefore\b/gi,/\bthus\b/gi,/\bhence\b/gi,/\bin addition\b/gi,/\bnevertheless\b/gi,/\bconsequently\b/gi,/\bwhile\b/gi,/\bwhereas\b/gi,/\balthough\b/gi,/\bthough\b/gi,/\bbut\b/gi,/\bso\b/gi,/\byet\b/gi,/\beither\b/gi,/\bas well as\b/gi,/\bin contrast\b/gi,/\bon the other hand\b/gi];
const ENDOPHORIC = [/\b(see|cf\.?) (Fig|Table|Section|Appendix|§)/gi, /\((Appendix|Fig\.?|Table|Section|§)[^)]*\)/gi, /\b(noted|discussed|shown|described) (above|below|earlier|previously)\b/gi, /\bin (Section|Table|Figure|Appendix) \S+/gi];
const CODE_GLOSSES = [/\bnamely\b/gi,/\be\.g\.,?/gi,/\bi\.e\.,?/gi,/\bsuch as\b/gi,/\bin other words\b/gi,/\bthat is\b/gi,/\bwhich means\b/gi];
const HEDGES = [/\bmight\b/gi,/\bmay\b/gi,/\bcould\b/gi,/\bperhaps\b/gi,/\bpossibl[ey]\b/gi,/\bprobabl[ey]\b/gi,/\bsuggest(s|ive|ed)?\b/gi,/\bappear(s|ed)?\b/gi,/\bseem(s|ed)?\b/gi,/\bindicate(s|d)?\b/gi,/\brelatively\b/gi,/\bsomewhat\b/gi,/\bapparently\b/gi,/\bnearly\b/gi,/\btend(s|ed)? to\b/gi,/\blargely\b/gi,/\bgenerally\b/gi,/\btypically\b/gi,/\bin part\b/gi,/\bto some extent\b/gi,/\bassume(s|d)?\b/gi];
const BOOSTERS = [/\bclearly\b/gi,/\bobviously\b/gi,/\bdefinitely\b/gi,/\bin fact\b/gi,/\bit is clear that\b/gi,/\bof course\b/gi,/\bmust\b/gi,/\bcannot\b/gi,/\bno\b(?= \w+ (can|could|will|would|is|are))/gi,/\bnever\b/gi,/\balways\b/gi,/\bshow(s|ed)? that\b/gi,/\bdemonstrate(s|d)?\b/gi];
const SELF_MENTION = [/\bwe\b/gi,/\bour\b/gi,/\bus\b/gi,/\bI\b/g,/\bmy\b/gi];
const ENGAGEMENT = [/\byou(r)?\b/gi,/\bconsider\b/gi,/\bnote that\b/gi,/\bimagine\b/gi,/\blet us\b/gi,/\brecall\b/gi];
const NEGATORS = [/\bnot\b/gi,/\bno\b/gi,/\bnone\b/gi,/\bnever\b/gi,/\bcannot\b/gi,/\bn't\b/gi,/\bneither\b/gi,/\bnor\b/gi,/\bwithout\b/gi,/\bfail(s|ed)? to\b/gi,/\bunable\b/gi];
// EPANORTHOSIS — уехал 2026-09-06 в `eslint-rules/paper-prose.mjs` (правило `paper/ai-tells`)
// вместе со всеми четырьмя формами и с их историей, включая ту, из-за которой список стал
// списком: аппозитив «Admission, not translation», доходящий до ЗАГОЛОВКОВ.

/**
 * `rather than` — moved OUT of EPANORTHOSIS on 2026-08-05, and the reason is arithmetic, not taste.
 *
 * The threshold above compares our count against Boggia's measured baselines (human 3.6, LLM 7.8 per
 * 10k). Those were measured on "not X, but Y". `rather than` is a different construction and a
 * mostly innocent English connective — "we report the direction rather than restate corpus shares"
 * is fine writing. Counting it in the same numerator while comparing against that denominator makes
 * the headline number incomparable to the baseline it is printed next to, which is a measurement bug
 * of exactly the kind this paper is about.
 *
 * It still gets reported, on its own line, because a pile of them is a real register problem — it
 * just is not epanorthosis and must not borrow epanorthosis's baseline. No published baseline exists
 * for it, so the threshold is ours and generous.
 */
const CONTRASTIVE = [/\brather than\b/gi, /\binstead of\b/gi, /\bas opposed to\b/gi];
// nominalisations: -tion/-sion/-ment/-ance/-ence/-ity/-ness/-ing used as head noun (approximate)
const NOMINAL = /\b\w{4,}(tion|sion|ment|ance|ence|ity|ness)s?\b/gi;

// JARGON — уехал в `eslint-rules/paper-craft.mjs` (правило `unexplained-jargon`, 2026-08-26).

const count = (t, pats) => (Array.isArray(pats) ? pats : [pats]).reduce((n, p) => n + (t.match(p) || []).length, 0);
// 🔴 Рядом жил `listHits(t, pats)` — тот же обход, но возвращающий САМИ совпадения, а не их
// число. Его не звал никто (`no-unused-vars`, 2026-08-28), и это не мелочь: абзац ниже объясняет,
// что метрика игнорировалась именно потому, что не могла НАЗВАТЬ нарушителя («A miscounted metric
// does not get argued with; it gets ignored»). `listHits` и был лекарством, и он не был подключён
// к отчёту. Удалён; дыра — «отчёт печатает счётчики без строк-нарушителей» — записана здесь.

// 🔴 Paragraph and heading boundaries END a sentence. The first version collapsed all whitespace
// first, so a heading ran into the paragraph under it and the last sentence of one paragraph ran
// into the first of the next. Measured 2026-08-05: that inflated "sentences carrying >2
// propositions" to 55, and the top offenders printed by the report were not sentences at all —
// they were a title glued to an abstract. The metric therefore looked like noise, which is exactly
// why nobody ever wired it into the flags that hooks and pre-commit consume. A miscounted metric
// does not get argued with; it gets ignored.
// 2026-08-11: строки заголовков вычёркиваются ДО нарезки, и вычёркивает их парсер. Прежде это
// делал фильтр `!/^#{1,6}\s/.test(l)` внутри `flatMap`, и он ошибался в обе стороны молча:
// пропускал заголовок с отступом в 1–3 пробела (CommonMark считает его заголовком) и вычёркивал
// строку `# …` внутри ```-блока — то есть КОД, процитированный статьёй, беззвучно выпадал из
// счёта предложений, а этот файл только предложения и считает.
// Порядок сохранён: вычёркивание строки, а не абзаца, поэтому границы абзацев те же.
function stripHeadingLines(t) {
  const drop = new Set(mdHeadings(t).map((h) => h.line));
  return drop.size === 0 ? t : t.split('\n').filter((_, i) => !drop.has(i)).join('\n');
}
function splitSentences(t) {
  return stripHeadingLines(t)
    .split(/\n\s*\n/)                                  // paragraphs never run together
    // A list item is its own unit. Without this the last sentence of one bullet ran into the first
    // of the next and the claim counter blamed the pair for the merge.
    .flatMap((p) => p.split(/\n(?=\s*(?:[-*]\s|\d+\.\s))/))
    .flatMap((p) => p.split('\n').join(' ')            // headings уже вычеркнуты, см. выше
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z“"(*`])/))
    .map((s) => s.trim()).filter(Boolean);
}
const words = t => (t.match(/[A-Za-z0-9%.'’-]+/g) || []).length;

function analyse(text) {
  const W = words(text), per1k = n => +(n / W * 1000).toFixed(1);
  const sents = splitSentences(text);
  const lens = sents.map(words);
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / (lens.length || 1));

  const cats = {
    frameMarkers: count(text, FRAME_MARKERS), transitions: count(text, TRANSITIONS),
    endophoric: count(text, ENDOPHORIC), codeGlosses: count(text, CODE_GLOSSES),
    hedges: count(text, HEDGES), boosters: count(text, BOOSTERS),
    selfMention: count(text, SELF_MENTION), engagement: count(text, ENGAGEMENT),
  };
  const mdTotal = Object.values(cats).reduce((a, b) => a + b, 0);

  // per-sentence structure.
  // `props` (>2 пропозиций) и «дискурсивное подлежащее» уехали в
  // `eslint-rules/paper-craft.mjs` — правила `multi-claim-sentence` и `discourse-subject`
  // (2026-08-26). Здесь остались растраченная ударная позиция, отрицание и тематическая
  // позиция: у них порогов в гейте не было и нет, они печатаются отчётом.
  const perSent = sents.map(s => {
    const sw = words(s);
    const frame = count(s, FRAME_MARKERS);
    // stress position: last ~8 words
    const tail = s.split(/\s+/).slice(-8).join(' ');
    const wastedStress = /\((Appendix|Fig|Table|Section|§)[^)]*\)\.?$/i.test(s.trim())
      || /\[\d+([,–-]\s*\d+)*\]\.?$/.test(s.trim())
      // a RESULT number = %, or a digit that is not part of a section/appendix/figure pointer
      || (count(tail, HEDGES) > 0
          && /%|\b\d+(\.\d+)?\b/.test(s.replace(/\b(Appendix|Fig\.?|Table|Section|§)\s*[A-Z]?\.?\d+(\.\d+)*/gi, ''))
          && !/%|\b\d+(\.\d+)?\b/.test(tail.replace(/\b(Appendix|Fig\.?|Table|Section|§)\s*[A-Z]?\.?\d+(\.\d+)*/gi, '')));
    const negMain = count(s, NEGATORS) > 0;
    // topic position = first 5 words
    const topic = s.split(/\s+/).slice(0, 5).join(' ').toLowerCase();
    return { s, sw, frame, wastedStress, negMain, topic,
             hedges: count(s, HEDGES), definites: (s.match(/\bthe [a-z][a-z-]*(\s+[a-z][a-z-]*)?\b/g) || []) };
  });

  const negPct = Math.round(perSent.filter(p => p.negMain).length / sents.length * 100);
  return {
    words: W, sentences: sents.length,
    sentenceLens: lens, meanLen: +mean.toFixed(1), sdLen: +sd.toFixed(1),
    cv: +(sd / mean).toFixed(2),
    per1k: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, per1k(v)])),
    raw: cats,
    metadiscoursePer1000: per1k(mdTotal),
    nominalisationsPer1000: per1k((text.match(NOMINAL) || []).length),
    contrastivePer10k: +((count(text, CONTRASTIVE) / W) * 10000).toFixed(1),
    wastedStress: perSent.filter(p => p.wastedStress).map(p => p.s),
    negatedSentencePct: negPct,
    topics: perSent.map(p => p.topic),
  };
}

// coinages() + DEFINING_CUE + STOPWORDS — уехали в `eslint-rules/paper-craft.mjs`
// (правило `undefined-coinage`, 2026-08-26) вместе со всем обоснованием эвристики.

/**
 * Инвентарь заголовков — всё, что осталось от `structure()`.
 *
 * 🔴 Две проверки, которые здесь жили (плотность цитат в абзаце и нагромождение жаргона в
 * предложении), уехали 2026-08-26 в `eslint-rules/paper-craft.mjs` — `citation-density` и
 * `unexplained-jargon`. Причина, по которой они были ОТДЕЛЬНЫ от `analyse()`, никуда не
 * делась и теперь выражена конструкцией: у правила ESLint есть дерево документа, поэтому
 * вопрос «сколько остановок в ЭТОМ абзаце» задаётся напрямую, а не восстанавливается из
 * схлопнутого потока слов.
 */
function structure(body) {
  // Not a gate — an INVENTORY. "A heading names a concrete noun" is a judgement call and pretending
  // otherwise would be the failure this file exists to stop. What is mechanical, and what was
  // missing, is that nobody ever saw all the headings AT ONCE: the whole-document question. Two
  // headings a reader called "VAGUE AF" and "why not mention the linter??" survived six passes
  // because each pass looked at the section it was editing.
  // 2026-08-11: инвентарь заголовков — от парсера. Прежнее `/^#{2,4} .+$/gm` печатало в этом
  // списке и строки из ```-блоков: инвентарь, который читают ГЛАЗАМИ как «все заголовки статьи»,
  // молча смешивал их с цитатами чужой разметки. Текст заголовка парсер отдаёт уже обрезанным
  // по краям — прежний `.replace(/^#+\s*/, '')` оставлял хвостовые пробелы.
  const headings = mdHeadings(body).filter((h) => h.depth >= 2 && h.depth <= 4).map((h) => h.text);

  // 🔴 The document's SHAPE — outline, order, section weights — deliberately does NOT live here.
  // It was written here first and the author drew the line correctly: "я думал проза это про прозу,
  // а структура это другой вообще". Prose-lint judges sentences. Structure belongs to tighten-paper,
  // which had no mechanical leg at all, so the inventory now lives there:
  //   node .claude/skills/tighten-paper/structure.mjs <paper.md> [--section=N]
  return { headings };
}

/** Captions from figures/*.tex beside the paper — the text surface nothing was reading. */
function captions(paperPath, fs, path) {
  const dir = path.join(path.dirname(paperPath), 'figures');
  let files; // без инициализатора: ветка catch возвращает, присваивает только try (2026-08-28)
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.tex')); } catch { return []; }
  const out = [];
  for (const f of files) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of s.matchAll(/\\caption\{/g)) {
      let i = m.index + m[0].length, depth = 1, j = i;
      while (j < s.length && depth) { if (s[j] === '{') depth++; else if (s[j] === '}') depth--; j++; }
      const text = s.slice(i, j - 1)
        .replace(/\\[a-zA-Z]+\s*/g, ' ').replace(/[{}]/g, ' ').replace(/---/g, ' ')
        .replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const sents = splitSentences(text);
      out.push({
        file: f,
        words: words(text),
        longest: Math.max(0, ...sents.map(words)),
        longestSentence: sents.slice().sort((a, b) => words(b) - words(a))[0] ?? '',
      });
    }
  }
  return out;
}

function report(name, r) {
  const flag = (ok) => ok ? 'ok  ' : 'FLAG';
  console.log(`\n=== ${name} — ${r.words} words, ${r.sentences} sentences ===`);
  console.log(`sentence lengths ${JSON.stringify(r.sentenceLens)}  mean ${r.meanLen}  sd ${r.sdLen}  CV ${r.cv}`);
  console.log(`${flag(r.metadiscoursePer1000 <= THRESHOLDS.metadiscourseTotalPer1000.warn)} all metadiscourse/1000w  ${r.metadiscoursePer1000}   (Hyland RA baseline 64.9, warn >${THRESHOLDS.metadiscourseTotalPer1000.warn})`);
  console.log(`     nominalisations/1000w    ${r.nominalisationsPer1000}`);
  // «not X, but Y» и плотность frame markers печатались отсюда до 2026-09-06. Оба уехали в
  // `eslint-rules/paper-prose.mjs`, где у находки есть `file:line:col`; печатать их здесь
  // второй раз значило бы завести второй источник правды:
  //   npx eslint papers/*/paper.md papers/*/paper.tex
  console.log(`${flag(r.contrastivePer10k <= THRESHOLDS.contrastivePer10k.warn)} "rather than"/instead-of/10,000w  ${r.contrastivePer10k}   (warn >${THRESHOLDS.contrastivePer10k.warn}; not epanorthosis, no published baseline)`);
  // Метафоры, придуманные термины, предложения про текст и многопропозиционные предложения
  // печатались отсюда до 2026-08-26. Они уехали в `eslint-rules/paper-craft.mjs`, где у
  // каждой находки есть `file:line:col`, — а этот отчёт печатал их головы и заставлял
  // искать предложение глазами. Второй раз печатать их здесь значило бы завести второй
  // источник правды: `npx eslint papers/*/paper.md`.
  console.log(`${flag(r.wastedStress.length === 0)} sentences ending on a cross-ref/citation/hedge (wasted stress position): ${r.wastedStress.length}`);
  r.wastedStress.forEach(s => console.log(`       > …${s.slice(-70)}`));
  console.log(`${flag(r.negatedSentencePct <= THRESHOLDS.negatedMainClausePct.warn)} sentences whose main claim is a negation: ${r.negatedSentencePct}%`);
  console.log(`     topic positions (whose story is this?): ${r.topics.map(t => `"${t}"`).join(' | ')}`);
}

const args = process.argv.slice(2);
if (args.length === 0) { console.error('usage: node prose-lint.mjs <file.md|file.txt> [more files]'); process.exit(0); }

// 🔴 ОТКАЗ, А НЕ УВЕРЕННОЕ НЕВЕРНОЕ ЧИСЛО. Разбор — в шапке файла: стриппинга LaTeX здесь нет
// ни строки, поэтому на `.tex` в знаменатель каждой метрики попадали преамбула, `%`-комментарии
// и записи `filecontents`-библиографии (замер: 8127 «слов» против ~4636 настоящих), и все
// метрики печатали `ok`. Молчаливая деградация здесь читается как «проза чистая» — ровно тот
// класс отказа, из-за которого этот файл вызывает `requireMarkdown()` выше.
const tex = args.filter((a) => !a.startsWith('--') && a.endsWith('.tex'));
if (tex.length) {
  console.error(`prose-lint читает markdown, а не LaTeX: ${tex.join(', ')}`);
  console.error('Никакого стриппинга .tex здесь нет — счёт слов включил бы преамбулу и .bib,');
  console.error('и каждая метрика (все они — доля от числа слов) занизилась бы примерно вдвое.');
  console.error('Чем закрывать прозу в .tex — papers/research/2026-08-26-proza-v-latex-zanyatost.md');
  process.exit(2);
}
const fs = await import('node:fs');
const path = await import('node:path');

// 🔴 The paper's own working notes are not the paper. Without this, the linter scored TIGHTEN
// comments, the YAML frontmatter and the keyword block as prose -- and its loudest complaints were
// about text no reviewer will ever see. Found 2026-08-04 on its first real run, where it reported
// the frontmatter's `title:` line as a six-proposition sentence. Strip what the converter strips.
// (It also caught something real that way: the frontmatter title was two revisions stale.)
// 🔴 The RENDERED page, not the markdown. Added 2026-08-05 after the author asked why the render
// step had not caught a stall he found by opening the PDF. It had not because nothing reads the
// rendered text: build-submission.sh checks FORM — page count, overfull boxes, unresolved
// references, unset characters, the anonymity grep — and never looks at a sentence, while every
// prose check reads paper.md and never sees a typeset page. Between those two layers sat every
// defect he found by eye, and he was the only reader of the artifact a reviewer actually gets.
function pdfTextOnly(t) {
  const cut = t.search(/^\s*References\s*$/m);
  if (cut > 0) t = t.slice(0, cut);
  return t
    .replace(/^\s*\d+\s*$/gm, '')          // page numbers
    .replace(/(\w)-\n(\w)/g, '$1$2')       // hyphenation introduced by the two-column set
    .replace(/\f/g, '\n\n');
}

// 2026-08-11: код-блоки вырезает `stripFences()`, границу тела ищет парсер. Прежнее
// `/^```[\s\S]*?^```/gm` при НЕЧЁТНОМ числе фенсов склеивало конец одного блока с началом
// следующего и съедало прозу между ними — а съеденная проза здесь означает заниженную
// плотность каждой метрики, то есть чистый вердикт по грязной статье. И `/^## (References|
// Limitations)/m` резало тело по решёткам ВНУТРИ такого блока.
function bodyOnly(t) {
  t = stripFrontmatter(t);                     // YAML frontmatter
  t = t.replace(/<!--[\s\S]*?-->/g, '');          // working comments, incl. TIGHTEN letters
  // `blank: true` — строки блока становятся пустыми, а не исчезают. Иначе абзац до блока
  // склеивается с абзацем после, а этот файл прямо про то, что «Paragraph and heading
  // boundaries END a sentence» (см. комментарий у `splitSentences`). Замер — в докстринге
  // `stripFences`: на `aisec-2026/README.md` удаление строк давало 81 предложение вместо 82,
  // слив лид-абзац с текстом за блоком.
  t = stripFences(t, { blank: true });            // code blocks
  t = t.replace(/^\|.*\|$/gm, '');                // table rows: data, not prose
  const freeH = mdHeadings(t).find((h) => h.depth === 2 && /^(References|Limitations)/u.test(h.text));
  const cut = freeH ? freeH.offset : -1;          // соглашение `-1` и сравнение `> 0` — как было
  return cut > 0 ? t.slice(0, cut) : t;           // body only; free sections hold a different bar
}


// 🔴 `--flags-only` and a NON-ZERO EXIT, added 2026-08-05, are what let anything downstream act.
// Until today this file printed a wall of numbers and always exited 0, and it was wired to no hook
// at all — it ran only if a human or a skill remembered it existed. Its epanorthosis metric sat at
// 50.8 per 10,000 words (the LLM baseline is 7.8) through five consecutive writing passes and never
// once flagged, because it had no threshold. The corpus owner found the tic by eye in a single reading and
// asked why the tooling had not. It had not because it was measuring, and measuring is not checking
// — which is, word for word, this paper's own thesis running loose inside its own toolchain.
const flagsOnly = args.includes('--flags-only');
let flagged = 0;
for (const f of args.filter((a) => !a.startsWith('--'))) {
  const raw = fs.readFileSync(f, 'utf8');
  const isPdfText = f.endsWith('.txt');
  const prep = isPdfText ? pdfTextOnly : bodyOnly;
  const r = analyse(prep(raw));
  if (flagsOnly) {
    const lines = [];
    // Плотность цитат в абзаце и нагромождение жаргона в предложении уехали 2026-08-26 в
    // `eslint-rules/paper-craft.mjs` (`citation-density`, `unexplained-jargon`).
    for (const c of captions(f, fs, path)) {
      if (c.longest > THRESHOLDS.captionSentenceWords.warn)
        lines.push(`   figures/${c.file}: caption sentence of ${c.longest} words (warn >${THRESHOLDS.captionSentenceWords.warn}) — "${c.longestSentence.slice(0, 110)}…"`);
      if (c.words > THRESHOLDS.captionWords.warn)
        lines.push(`   figures/${c.file}: caption is ${c.words} words (warn >${THRESHOLDS.captionWords.warn}) — a caption this long is a section under a picture`);
    }
    // Предложения, несущие больше двух утверждений, уехали туда же — правило
    // `multi-claim-sentence`, вместе со срезом «пять худших» (теперь опция `maxReported`).
    // ✅ Длина аннотации против медианы площадки уехала 2026-09-07 в
    // `eslint-rules/paper-craft.mjs` — правило `paper/abstract-length`. Паритет снят ДО
    // удаления на настоящей статье: `compile-rules-2026/paper.md` — 306 слов против потолка
    // 305 (медиана 203 × 1.5), одна находка здесь и одна там, те же четыре числа; правило
    // вдобавок несёт адрес `paper.md:126:1`, которого у этой строки не было.
    // Хеджи, предложения про текст и придуманные термины — там же:
    // `hedge-density`, `discourse-subject`, `undefined-coinage`.
    if (lines.length) {
      flagged += lines.length;
      console.error(`✍️  prose-lint — ${f.split('/').pop()}:`);
      lines.forEach((l) => console.error(l));
      console.error('   run `node .claude/skills/grade-paper-writing/prose-lint.mjs <file>` for the sentences');
    }
  } else if (args.includes('--headings')) {
    // The whole-document question, printed as one list. Not a gate: "does this heading name a
    // concrete noun" is judgement and pretending otherwise would be the exact failure this file
    // exists to stop. What was missing is cheaper and was the real cause — nobody had ever seen the
    // headings AS A SET. Two that a reader called "VAGUE AF" and "why not mention the linter??"
    // survived six passes because every pass looked only at the section it was editing.
    console.log(`\n=== ${f.split('/').pop()} — every heading, in order ===`);
    structure(prep(raw)).headings.forEach((h, i) => console.log(`${String(i + 1).padStart(3)}. ${h}`));
    console.log('\nRead these as a stranger who will read nothing else. Each should name a thing:');
    console.log('a linter, a configuration, a repository, a rule — not "answers", "kinds", "moves".');
  } else {
    report(f.split('/').pop(), r);
  }
}
if (!flagsOnly) console.log('\n(thresholds and their sources are in THRESHOLDS at the top of this file)');
// Exit 1 on a flag so a caller can branch. Hooks stay advisory by swallowing it themselves; the
// point is that the information now EXISTS at the exit code, where it was previously unreachable.
process.exit(flagged ? 1 : 0);
