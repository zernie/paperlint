#!/usr/bin/env node
/**
 * prose-lint.mjs — countable checks for "reads machine-written" expository prose.
 * Usage: node prose-lint.mjs <file.md|file.txt> [--flags-only|--headings]
 *
 * Every check counts something. Thresholds and their provenance are in THRESHOLDS.
 *
 * 🔴 WHAT LEFT THIS FILE ON 2026-08-26 AND WHERE IT WENT. Seven of the twelve gating metrics were
 * moved into `@eslint/markdown` rules — `eslint-rules/paper-craft.mjs`:
 *   citation-density · unexplained-jargon · multi-claim-sentence · conceits ·
 *   hedge-density · discourse-subject · undefined-coinage.
 * Parity was proven on a real paper BEFORE the deletion (the sets of findings matched, the sentence
 * heads byte for byte); the measurement and the classification of all twelve are in
 * `papers/research/2026-08-26-klassifikatsiya-prose-lint.md`.
 * Do NOT add them back: a fact has one home, and `paper-craft.harness.mjs` fails if the number of
 * gating metrics here grows.
 *
 * 🔴 THE SECOND BATCH, 2026-09-06: TWO MORE LEFT, AND THE RECEIVING RULES WERE EXTENDED FIRST.
 *   frameMarkersPer1000 → `paper/metadiscourse`, the `density` finding. The dictionary here was wider
 *     (17 patterns against 9), so the dictionaries were merged first and the threshold removed after.
 *     ⚠️ NOT all seventeen were merged: the patterns `\bfirst(ly)?\b(?=[ ,])` / `second` / `third`
 *     gave 23 matches out of 27 on `compile-rules-2026/paper.md`, and ZERO of them were REAL
 *     ("Only the second one runs", "The first two rows", "A third group ignores"). Those are
 *     ordinary adjectives. What went into the rule is Hyland's form — "First," at the start of a
 *     clause; over four papers it gives 9 matches, all real;
 *   epanorthosisPer10k → `paper/ai-tells`, together with all four forms and with Boggia's baseline.
 *     The receiving rule knew only one form, and that regex caught "is not X," WITHOUT the
 *     substituted replacement — five of its matches on a real paper were not the construction at
 *     all. Parity: the rule prints the same `17.2/10k` and the same 10 sentences.
 *
 * 🔴 RETRACTED 2026-09-06: "A SECOND ENTITY ON THE FILESYSTEM ⇒ UNAVAILABLE TO AN ESLINT RULE" IS
 * WRONG. The paragraph below is kept as a record of what used to be written here, but IT MUST NOT BE
 * ACTED ON. Measured: `eslint-rules/paper-registry.mjs` makes 8 disk accesses and reads neighbouring
 * files of the paper's directory; `pdf-facts.mjs` opens a PDF and computes sha256; `paper-texcount.mjs`
 * RUNS an external program through `execFileSync`. An ESLint rule executes in node, and `readFileSync`
 * is available to it exactly as it is to this script. The real "one file at a time" model is about
 * WHERE a rule reports, not about what it reads.
 * ⇒ All three metrics were reclassified as MOVABLE and are queued as work:
 *   `node .claude/lib/refactor-state.mjs --index`, the "MOVABLE" section.
 *   `captionSentenceWords` / `captionWords` — after one edit of `files:` in `eslint.config.mjs`
 *     (today only the paper's own `paper.tex` is listed there, while the captions live in `figures/`).
 *
 * ✅ `abstractVsVenueMedian` WAS MOVED 2026-09-07 → `eslint-rules/paper-craft.mjs`, the rule
 * `paper/abstract-length` (`warn`). It was the one "without a single condition": the median is read
 * from the neighbouring `CLAUDE.md` exactly as `pdf/profile` reads a venue profile, and the address
 * of the finding is the `## Abstract` line in the paper itself. Parity was taken BEFORE the deletion
 * on `compile-rules-2026/paper.md`: 306 words against a ceiling of 305, one finding in both places,
 * the same four numbers. The test and eight mutations are in
 * `eslint-rules/paper-craft.{harness,mutations}.mjs`.
 *
 * WHAT IS LEFT AND WHY — TWO. The paragraph below was written when there were three, and is kept as
 * a record: they read a SECOND ENTITY on the filesystem, while an ESLint rule sees one linted file:
 *   ← RETRACTED, see above
 *   captionSentenceWords, captionWords → the input is `figures/*.tex` NEXT TO the paper.
 *
 * ⚠️ `.tex` IS NO LONGER ACCEPTED, AND THAT IS FIXING A LIE, NOT NARROWING THE SCOPE. The header
 * declared `<file.md|file.tex|->` from the very beginning, while there is not one line of LaTeX
 * stripping in the file. Measured 2026-08-26 on `agenticdev-2026/paper.tex`: it prints `8127 words`
 * against ~4636 real ones — 43% of that is the preamble, `%` comments and `filecontents`
 * bibliography entries, and the first items in the list of long sentences are `.bib` lines. Every
 * metric in this file is a fraction of the word count, so on `.tex` they were all understated by
 * roughly half and printed `ok`. Nobody ever called it with `.tex` anyway (CI explicitly prints
 * `NOT COVERED` for .tex papers), so the cost of refusing is zero, while the cost of a confident
 * wrong number is not. A LaTeX parser is deliberately not built here: the occupancy of the tools was
 * measured separately, see `papers/research/2026-08-26-proza-v-latex-zanyatost.md`.
 *
 * Advisory: it prints findings; `--flags-only` exits with code 1 if anything was found.
 */
import { headings as mdHeadings, stripFences, requireMarkdown, stripFrontmatter } from '../../lib/markdown.mjs';

// Markup is parsed with a PARSER (`CLAUDE.md`, 2026-08-11). We fail rather than degrade, even
// though this file is advisory: without a parser the paper's body would collapse to empty, and from
// empty this linter derives zero for EVERY metric — that is, a report saying "the prose is perfect".
// `paper-lint.mjs` runs us as a subprocess and prints our stderr, so the reason is visible, and its
// own gate does not suffer: it swallows our exit code deliberately.
requireMarkdown();

const THRESHOLDS = {
  // frameMarkersPer1000 — moved 2026-09-06 into `eslint-rules/paper-prose.mjs`, into the rule
  // `paper/metadiscourse` (the `density` finding), together with Hyland's provenance and the
  // threshold of 10. The FRAME_MARKERS dictionary below STAYS: it is a term in
  // metadiscourseTotalPer1000.
  metadiscourseTotalPer1000: { warn: 90, src: 'Hyland 2005 Table 5.1 total 64.9/1000; Table 7.1 totals 60.0-73.6/1000. Warn ~1.4x.' },
  // pureFrameSentencePct / propositionsPerSentence — moved into `eslint-rules/paper-craft.mjs`
  // as `discourse-subject` and `multi-claim-sentence` (2026-08-26).
  firstMentionDefinites: { warn: 3, src: 'No published rate. Operationalises Pinker\'s curse of knowledge: "the X" on first mention presupposes shared knowledge.' },
  negatedMainClausePct: { warn: 50, src: 'No published rate for negation. Related: Boggia 2026 (arXiv 2607.21498) measures the "not X, but Y" family per 10,000 words; human academic abstracts 3.6, LLM 7.8 (p=0.28, n.s.).' },
  topicChainBreaksPct: { warn: 75, src: 'Gopen & Swan 1990 principles 3-4: "We cannot tell whose story the passage is" when the topic position changes every sentence.' },
  stressPositionWaste: { warn: 0, src: 'Gopen & Swan 1990 principle 2: put the new information you want emphasised in the stress position. A trailing citation/cross-reference/hedge wastes it.' },
  // hedgeWordPct — moved into `eslint-rules/paper-craft.mjs` as `hedge-density` (2026-08-26).
  // The HEDGES lexicon STAYS here: it is a term in metadiscourseTotalPer1000 and in the wasted
  // stress-position detector. Deleting it would silently understate both metrics.
  // epanorthosisPer10k — moved 2026-09-06 into `eslint-rules/paper-prose.mjs`, into the rule
  // `paper/ai-tells`, together with the ONLY published baseline in the whole set
  // (Boggia 2026, arXiv 2607.21498: humans 3.6, models 7.8 per 10 000 words; threshold 15.6) and
  // together with the EPANORTHOSIS lexicon. The metric's history — "it was counted and PRINTED
  // WITHOUT A THRESHOLD from the day the linter was written, sat at 29.8 through five editing
  // passes, and the corpus owner found the tic by eye before the tool did, because measuring is not
  // checking" — moved into the rule's header: it explains why a metric must have a threshold and not
  // only a number.

  contrastivePer10k: { warn: 25, src: 'ours. "rather than" is an ordinary connective; a pile of them is a register problem, but it is NOT the construction Boggia measured and must not borrow that baseline.' },
  // conceitsPer10k — moved into `eslint-rules/paper-craft.mjs` as `conceits` (2026-08-26).

  // Abstract length, as a multiple of the TARGET VENUE's own median. The corpus owner, 2026-08-05:
  // "abstract should be closer to median. no longer than 50% [more than] median". For REALM the measured
  // median over all 34 archival papers is 203 words, so the ceiling is ~305. The previous guidance
  // in this project pointed at the venue MAXIMUM (518) and was wrong in the way maxima always are:
  // it licensed 654 words, longer than any abstract that workshop has ever published, and read as
  // an introduction rather than an abstract. Measure the venue, take the median, allow half again.

  // citationsPerParagraph / jargonPerSentence — moved into `eslint-rules/paper-craft.mjs` as
  // `citation-density` and `unexplained-jargon` (2026-08-26). The provenance of both thresholds,
  // including the history of "count GROUPS, not numbers", moved with them.
  // 🔴 FIGURE CAPTIONS ARE PROSE THAT NOTHING WAS READING. They live in figures/*.tex, not in
  // paper.md, so every writing pass, every persona read and every threshold in paper-lint's pre-edit
  // gate was blind to them by construction. Found 2026-08-05 when a reader hit a 136-word caption
  // containing a 54-word sentence — one word under the limit that would have blocked the same
  // sentence had it been typed into the paper. An entire text surface, unchecked.
  captionSentenceWords: { warn: 40, src: 'ours, from this paper\'s own four captions: longest sentences 21, 31, 41 and 54 words. A caption is read in one pass with the figure, so it tolerates less than body prose, where the limit is 55.' },
  captionWords: { warn: 100, src: 'ours, same four captions: 67, 97, 135, 148. ACL captions in the venue corpus run far shorter; past ~100 words a caption is a section that happens to sit under a picture.' },
};

// CONCEITS — moved into `eslint-rules/paper-craft.mjs` (the `conceits` rule, 2026-08-26)
// together with its whole tuning history.

// --- lexicons ---
// 🔴 FRAME_MARKERS STAYS EVEN THOUGH ITS THRESHOLD LEFT (2026-09-06) — for exactly the same reason
// as HEDGES above: it is a term in `metadiscourseTotalPer1000`, and deleting it would silently
// understate that metric. ⚠️ AND HERE IS A KNOWN DEFECT, measured the same day and NOT fixed: the
// three ordinal-numeral patterns give 23 matches out of 27 on a real paper, and none of them are
// real, while `comes? first` is written TWICE (the second time as `come(s)? (first|before)`), so
// every "comes first" is counted as two. That means `metadiscourse/1000w` in the report below is
// OVERSTATED. Deliberately untouched: narrowing the dictionary is an edit to the BEHAVIOUR of a live
// metric that has no test here, and making it under the guise of a move would change a number
// without showing that it changed.
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
// EPANORTHOSIS — moved 2026-09-06 into `eslint-rules/paper-prose.mjs` (the `paper/ai-tells` rule)
// together with all four forms and with their history, including the one that turned the list into a
// list: the appositive "Admission, not translation", which reaches as far as HEADINGS.

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

// JARGON — moved into `eslint-rules/paper-craft.mjs` (the `unexplained-jargon` rule, 2026-08-26).

const count = (t, pats) => (Array.isArray(pats) ? pats : [pats]).reduce((n, p) => n + (t.match(p) || []).length, 0);
// 🔴 Next to this lived `listHits(t, pats)` — the same walk, but returning THE MATCHES THEMSELVES
// rather than their count. Nobody called it (`no-unused-vars`, 2026-08-28), and that is not a
// trifle: the paragraph below explains that a metric was ignored precisely because it could not NAME
// the offender ("A miscounted metric does not get argued with; it gets ignored"). `listHits` was the
// remedy, and it was not wired into the report. Deleted; the hole — "the report prints counters
// without the offending lines" — is recorded here.

// 🔴 Paragraph and heading boundaries END a sentence. The first version collapsed all whitespace
// first, so a heading ran into the paragraph under it and the last sentence of one paragraph ran
// into the first of the next. Measured 2026-08-05: that inflated "sentences carrying >2
// propositions" to 55, and the top offenders printed by the report were not sentences at all —
// they were a title glued to an abstract. The metric therefore looked like noise, which is exactly
// why nobody ever wired it into the flags that hooks and pre-commit consume. A miscounted metric
// does not get argued with; it gets ignored.
// 2026-08-11: heading lines are struck out BEFORE splitting, and the parser is what strikes them
// out. This used to be done by the filter `!/^#{1,6}\s/.test(l)` inside `flatMap`, and it erred in
// both directions silently: it missed a heading indented by 1-3 spaces (CommonMark counts it as a
// heading) and struck out a `# …` line inside a ``` block — that is, CODE quoted by the paper fell
// soundlessly out of the sentence count, and this file counts nothing but sentences.
// The order is preserved: a line is struck out, not a paragraph, so the paragraph boundaries are
// the same.
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
    .flatMap((p) => p.split('\n').join(' ')            // headings are already struck out, see above
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
  // `props` (>2 propositions) and the "discourse subject" moved into
  // `eslint-rules/paper-craft.mjs` — the rules `multi-claim-sentence` and `discourse-subject`
  // (2026-08-26). What stayed here is the wasted stress position, negation and the topic position:
  // they had no thresholds in the gate and still have none, they are printed by the report.
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

// coinages() + DEFINING_CUE + STOPWORDS — moved into `eslint-rules/paper-craft.mjs`
// (the `undefined-coinage` rule, 2026-08-26) together with the whole justification of the heuristic.

/**
 * An inventory of headings — all that is left of `structure()`.
 *
 * 🔴 The two checks that lived here (citation density in a paragraph and a pile-up of jargon in a
 * sentence) moved on 2026-08-26 into `eslint-rules/paper-craft.mjs` — `citation-density` and
 * `unexplained-jargon`. The reason they were SEPARATE from `analyse()` has not gone anywhere and is
 * now expressed by construction: an ESLint rule has the document tree, so the question "how many
 * stops are in THIS paragraph" is asked directly rather than reconstructed from a collapsed stream
 * of words.
 */
function structure(body) {
  // Not a gate — an INVENTORY. "A heading names a concrete noun" is a judgement call and pretending
  // otherwise would be the failure this file exists to stop. What is mechanical, and what was
  // missing, is that nobody ever saw all the headings AT ONCE: the whole-document question. Two
  // headings a reader called "VAGUE AF" and "why not mention the linter??" survived six passes
  // because each pass looked at the section it was editing.
  // 2026-08-11: the heading inventory comes from the parser. The previous `/^#{2,4} .+$/gm` also
  // printed lines from ``` blocks in this list: an inventory read BY EYE as "all the paper's
  // headings" silently mixed them with quotations of someone else's markup. The parser hands back
  // the heading text already trimmed at the edges — the previous `.replace(/^#+\s*/, '')` left
  // trailing spaces.
  const headings = mdHeadings(body).filter((h) => h.depth >= 2 && h.depth <= 4).map((h) => h.text);

  // 🔴 The document's SHAPE — outline, order, section weights — deliberately does NOT live here.
  // It was written here first and the author drew the line correctly: "I thought prose was about
  // prose, and structure is something else entirely" (said in Russian). Prose-lint judges sentences.
  // Structure belongs to tighten-paper, which had no mechanical leg at all, so the inventory now
  // lives there:
  //   node .claude/skills/tighten-paper/structure.mjs <paper.md> [--section=N]
  return { headings };
}

/** Captions from figures/*.tex beside the paper — the text surface nothing was reading. */
function captions(paperPath, fs, path) {
  const dir = path.join(path.dirname(paperPath), 'figures');
  let files; // no initialiser: the catch branch returns, only try assigns (2026-08-28)
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
  // "not X, but Y" and the frame-marker density were printed from here until 2026-09-06. Both moved
  // into `eslint-rules/paper-prose.mjs`, where a finding has a `file:line:col`; printing them here a
  // second time would set up a second source of truth:
  //   npx eslint papers/*/paper.md papers/*/paper.tex
  console.log(`${flag(r.contrastivePer10k <= THRESHOLDS.contrastivePer10k.warn)} "rather than"/instead-of/10,000w  ${r.contrastivePer10k}   (warn >${THRESHOLDS.contrastivePer10k.warn}; not epanorthosis, no published baseline)`);
  // Conceits, coined terms, sentences about the text and multi-proposition sentences were printed
  // from here until 2026-08-26. They moved into `eslint-rules/paper-craft.mjs`, where every finding
  // has a `file:line:col` — whereas this report printed their heads and made you hunt for the
  // sentence by eye. Printing them here a second time would set up a second source of truth:
  // `npx eslint papers/*/paper.md`.
  console.log(`${flag(r.wastedStress.length === 0)} sentences ending on a cross-ref/citation/hedge (wasted stress position): ${r.wastedStress.length}`);
  r.wastedStress.forEach(s => console.log(`       > …${s.slice(-70)}`));
  console.log(`${flag(r.negatedSentencePct <= THRESHOLDS.negatedMainClausePct.warn)} sentences whose main claim is a negation: ${r.negatedSentencePct}%`);
  console.log(`     topic positions (whose story is this?): ${r.topics.map(t => `"${t}"`).join(' | ')}`);
}

const args = process.argv.slice(2);
if (args.length === 0) { console.error('usage: node prose-lint.mjs <file.md|file.txt> [more files]'); process.exit(0); }

// 🔴 REFUSE RATHER THAN PRINT A CONFIDENT WRONG NUMBER. The analysis is in the file header: there is
// not one line of LaTeX stripping here, so on `.tex` the preamble, the `%` comments and the
// `filecontents` bibliography entries all landed in the denominator of every metric (measured: 8127
// "words" against ~4636 real ones), and every metric printed `ok`. Silent degradation here reads as
// "the prose is clean" — exactly the class of failure for which this file calls `requireMarkdown()`
// above.
const tex = args.filter((a) => !a.startsWith('--') && a.endsWith('.tex'));
if (tex.length) {
  console.error(`prose-lint reads markdown, not LaTeX: ${tex.join(', ')}`);
  console.error('There is no .tex stripping here — the word count would include the preamble and the .bib,');
  console.error('and every metric (they are all fractions of the word count) would be understated by roughly half.');
  console.error('What to cover prose in .tex with — papers/research/2026-08-26-proza-v-latex-zanyatost.md');
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

// 2026-08-11: code blocks are cut out by `stripFences()`, and the parser finds the body boundary.
// The previous `/^```[\s\S]*?^```/gm`, with an ODD number of fences, glued the end of one block to
// the beginning of the next and ate the prose between them — and eaten prose here means an
// understated density for every metric, that is, a clean verdict over a dirty paper. And
// `/^## (References|Limitations)/m` cut the body at hashes INSIDE such a block.
function bodyOnly(t) {
  t = stripFrontmatter(t);                     // YAML frontmatter
  t = t.replace(/<!--[\s\S]*?-->/g, '');          // working comments, incl. TIGHTEN letters
  // `blank: true` — the block's lines become empty rather than disappear. Otherwise the paragraph
  // before the block gets glued to the paragraph after it, and this file is precisely about
  // "Paragraph and heading boundaries END a sentence" (see the comment at `splitSentences`). The
  // measurement is in the `stripFences` docstring: on `aisec-2026/README.md` removing the lines gave
  // 81 sentences instead of 82, merging the lead paragraph with the text after the block.
  t = stripFences(t, { blank: true });            // code blocks
  t = t.replace(/^\|.*\|$/gm, '');                // table rows: data, not prose
  const freeH = mdHeadings(t).find((h) => h.depth === 2 && /^(References|Limitations)/u.test(h.text));
  const cut = freeH ? freeH.offset : -1;          // the `-1` convention and the `> 0` comparison — as before
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
    // Citation density in a paragraph and a pile-up of jargon in a sentence moved on 2026-08-26 into
    // `eslint-rules/paper-craft.mjs` (`citation-density`, `unexplained-jargon`).
    for (const c of captions(f, fs, path)) {
      if (c.longest > THRESHOLDS.captionSentenceWords.warn)
        lines.push(`   figures/${c.file}: caption sentence of ${c.longest} words (warn >${THRESHOLDS.captionSentenceWords.warn}) — "${c.longestSentence.slice(0, 110)}…"`);
      if (c.words > THRESHOLDS.captionWords.warn)
        lines.push(`   figures/${c.file}: caption is ${c.words} words (warn >${THRESHOLDS.captionWords.warn}) — a caption this long is a section under a picture`);
    }
    // Sentences carrying more than two claims moved to the same place — the rule
    // `multi-claim-sentence`, together with the "five worst" slice (now the `maxReported` option).
    // ✅ Abstract length against the venue's median moved on 2026-09-07 into
    // `eslint-rules/paper-craft.mjs` — the rule `paper/abstract-length`. Parity was taken BEFORE the
    // deletion on a real paper: `compile-rules-2026/paper.md` — 306 words against a ceiling of 305
    // (median 203 × 1.5), one finding here and one there, the same four numbers; the rule
    // additionally carries the address `paper.md:126:1`, which this line never had.
    // Hedges, sentences about the text and coined terms are there too:
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
