#!/usr/bin/env node
/**
 * prose-lint.mjs — countable checks for "reads machine-written" expository prose, on a paper's
 * LaTeX source or on the text of its rendered PDF.
 * Usage: node prose-lint.mjs <paper.tex|page.txt> [more files] [--flags-only|--headings]
 *
 * Every check counts something. Thresholds and their provenance are in THRESHOLDS.
 *
 * A `.tex` IS READ THROUGH THE PAPER'S PROSE, NOT AS TEXT. Read raw, a `.tex` put the preamble, the
 * `%` comments and the `filecontents` bibliography into the word count — measured on one paper:
 * `8127 words` against ~4636 real ones — and every metric here is a fraction of that count, so all
 * of them came out understated by about half and printed `ok`. `paperProse` (src/paper-prose.ts)
 * gives the body as the `tex/register` rule reads it: includes spliced, the abstract to the back
 * matter, no headings, captions, floats, code or citation marks.
 *
 * A `.txt` is the text of the rendered PDF — the page a reviewer actually reads.
 *
 * The figure captions are measured too (`--flags-only`): every `\caption{}` in `paper.tex` and the
 * files it includes, or, beside a rendered page, in `figures/*.tex`.
 *
 * Advisory: it prints findings; `--flags-only` exits with code 1 if anything was found.
 */
import { paperProse } from "#src/paper-prose";
import { latexReader } from "#src/adapters/latex/index";
import { nodeFiles } from "#src/adapters/node/index";
import { texToMdast } from "#eslint-rules/latex-language";

const THRESHOLDS = {
  metadiscourseTotalPer1000: {
    warn: 90,
    src: "Hyland 2005 Table 5.1 total 64.9/1000; Table 7.1 totals 60.0-73.6/1000. Warn ~1.4x.",
  },
  firstMentionDefinites: {
    warn: 3,
    src: 'No published rate. Operationalises Pinker\'s curse of knowledge: "the X" on first mention presupposes shared knowledge.',
  },
  negatedMainClausePct: {
    warn: 50,
    src: 'No published rate for negation. Related: Boggia 2026 (arXiv 2607.21498) measures the "not X, but Y" family per 10,000 words; human academic abstracts 3.6, LLM 7.8 (p=0.28, n.s.).',
  },
  topicChainBreaksPct: {
    warn: 75,
    src: 'Gopen & Swan 1990 principles 3-4: "We cannot tell whose story the passage is" when the topic position changes every sentence.',
  },
  stressPositionWaste: {
    warn: 0,
    src: "Gopen & Swan 1990 principle 2: put the new information you want emphasised in the stress position. A trailing citation/cross-reference/hedge wastes it.",
  },
  // The HEDGES lexicon is a term in metadiscourseTotalPer1000 and in the wasted stress-position
  // detector. Deleting it would silently understate both metrics.

  contrastivePer10k: {
    warn: 25,
    src: 'ours. "rather than" is an ordinary connective; a pile of them is a register problem, but it is NOT the construction Boggia measured and must not borrow that baseline.',
  },

  // 🔴 FIGURE CAPTIONS ARE PROSE THAT NOTHING WAS READING. They sit in floats, outside the body
  // the other metrics read, so every writing pass and every persona read was blind to them by
  // construction. Found 2026-08-05 when a reader hit a 136-word caption
  // containing a 54-word sentence — one word under the limit that would have blocked the same
  // sentence had it been typed into the paper. An entire text surface, unchecked.
  captionSentenceWords: {
    warn: 40,
    src: "ours, from this paper's own four captions: longest sentences 21, 31, 41 and 54 words. A caption is read in one pass with the figure, so it tolerates less than body prose, where the limit is 55.",
  },
  captionWords: {
    warn: 100,
    src: "ours, same four captions: 67, 97, 135, 148. ACL captions in the venue corpus run far shorter; past ~100 words a caption is a section that happens to sit under a picture.",
  },
};

// --- lexicons ---
// 🔴 FRAME_MARKERS has no threshold of its own: it is a term in `metadiscourseTotalPer1000`, and
// deleting it would silently understate that metric. ⚠️ AND HERE IS A KNOWN DEFECT, measured the same day and NOT fixed: the
// three ordinal-numeral patterns give 23 matches out of 27 on a real paper, and none of them are
// real, while `comes? first` is written TWICE (the second time as `come(s)? (first|before)`), so
// every "comes first" is counted as two. That means `metadiscourse/1000w` in the report below is
// OVERSTATED. Deliberately untouched: narrowing the dictionary is an edit to the BEHAVIOUR of a live
// metric that has no test here, and making it under the guise of a move would change a number
// without showing that it changed.
const FRAME_MARKERS = [
  /\bcomes? first\b/gi,
  /\bfirst(ly)?\b(?=[ ,])/gi,
  /\bsecond(ly)?\b(?=[ ,])/gi,
  /\bthird(ly)?\b(?=[ ,])/gi,
  /\bfinally\b/gi,
  /\bto (conclude|summari[sz]e|begin( with)?|start)\b/gi,
  /\bin (conclusion|summary|what follows|this (paper|section|article))\b/gi,
  /\bwe (begin|start|turn|now turn|conclude|proceed)\b/gi,
  /\b(my|our) (purpose|aim|goal) is\b/gi,
  /\bthe (rest|remainder) of (this|the)\b/gi,
  /\bbefore (we|turning|proceeding)\b/gi,
  /\bhere we (show|present|report|argue)\b/gi,
  /\bwe (report|present) (it|them|this) as\b/gi,
  /\bcome(s)? (first|before)\b/gi,
  /\bthis (paper|section) (is organi[sz]ed|proceeds)\b/gi,
  /\bwhat follows\b/gi,
  /\bthe (first|second|two|three) (finding|result|point|thing)s?\b/gi,
];
const TRANSITIONS = [
  /\bhowever\b/gi,
  /\bmoreover\b/gi,
  /\bfurthermore\b/gi,
  /\btherefore\b/gi,
  /\bthus\b/gi,
  /\bhence\b/gi,
  /\bin addition\b/gi,
  /\bnevertheless\b/gi,
  /\bconsequently\b/gi,
  /\bwhile\b/gi,
  /\bwhereas\b/gi,
  /\balthough\b/gi,
  /\bthough\b/gi,
  /\bbut\b/gi,
  /\bso\b/gi,
  /\byet\b/gi,
  /\beither\b/gi,
  /\bas well as\b/gi,
  /\bin contrast\b/gi,
  /\bon the other hand\b/gi,
];
const ENDOPHORIC = [
  /\b(see|cf\.?) (Fig|Table|Section|Appendix|§)/gi,
  /\((Appendix|Fig\.?|Table|Section|§)[^)]*\)/gi,
  /\b(noted|discussed|shown|described) (above|below|earlier|previously)\b/gi,
  /\bin (Section|Table|Figure|Appendix) \S+/gi,
];
const CODE_GLOSSES = [
  /\bnamely\b/gi,
  /\be\.g\.,?/gi,
  /\bi\.e\.,?/gi,
  /\bsuch as\b/gi,
  /\bin other words\b/gi,
  /\bthat is\b/gi,
  /\bwhich means\b/gi,
];
const HEDGES = [
  /\bmight\b/gi,
  /\bmay\b/gi,
  /\bcould\b/gi,
  /\bperhaps\b/gi,
  /\bpossibl[ey]\b/gi,
  /\bprobabl[ey]\b/gi,
  /\bsuggest(s|ive|ed)?\b/gi,
  /\bappear(s|ed)?\b/gi,
  /\bseem(s|ed)?\b/gi,
  /\bindicate(s|d)?\b/gi,
  /\brelatively\b/gi,
  /\bsomewhat\b/gi,
  /\bapparently\b/gi,
  /\bnearly\b/gi,
  /\btend(s|ed)? to\b/gi,
  /\blargely\b/gi,
  /\bgenerally\b/gi,
  /\btypically\b/gi,
  /\bin part\b/gi,
  /\bto some extent\b/gi,
  /\bassume(s|d)?\b/gi,
];
const BOOSTERS = [
  /\bclearly\b/gi,
  /\bobviously\b/gi,
  /\bdefinitely\b/gi,
  /\bin fact\b/gi,
  /\bit is clear that\b/gi,
  /\bof course\b/gi,
  /\bmust\b/gi,
  /\bcannot\b/gi,
  /\bno\b(?= \w+ (can|could|will|would|is|are))/gi,
  /\bnever\b/gi,
  /\balways\b/gi,
  /\bshow(s|ed)? that\b/gi,
  /\bdemonstrate(s|d)?\b/gi,
];
const SELF_MENTION = [
  /\bwe\b/gi,
  /\bour\b/gi,
  /\bus\b/gi,
  /\bI\b/g,
  /\bmy\b/gi,
];
const ENGAGEMENT = [
  /\byou(r)?\b/gi,
  /\bconsider\b/gi,
  /\bnote that\b/gi,
  /\bimagine\b/gi,
  /\blet us\b/gi,
  /\brecall\b/gi,
];
const NEGATORS = [
  /\bnot\b/gi,
  /\bno\b/gi,
  /\bnone\b/gi,
  /\bnever\b/gi,
  /\bcannot\b/gi,
  /\bn't\b/gi,
  /\bneither\b/gi,
  /\bnor\b/gi,
  /\bwithout\b/gi,
  /\bfail(s|ed)? to\b/gi,
  /\bunable\b/gi,
];

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
const CONTRASTIVE = [
  /\brather than\b/gi,
  /\binstead of\b/gi,
  /\bas opposed to\b/gi,
];
// nominalisations: -tion/-sion/-ment/-ance/-ence/-ity/-ness/-ing used as head noun (approximate)
const NOMINAL = /\b\w{4,}(tion|sion|ment|ance|ence|ity|ness)s?\b/gi;

/** Matches of every pattern in the lexicon `pats`, summed. Every caller passes a lexicon array. */
const count = (t, pats) =>
  pats.reduce((n, p) => n + (t.match(p) || []).length, 0);
// 🔴 Next to this lived `listHits(t, pats)` — the same walk, but returning THE MATCHES THEMSELVES
// rather than their count. Nobody called it (`no-unused-vars`, 2026-08-28), and that is not a
// trifle: the paragraph below explains that a metric was ignored precisely because it could not NAME
// the offender ("A miscounted metric does not get argued with; it gets ignored"). `listHits` was the
// remedy, and it was not wired into the report. Deleted; the hole — "the report prints counters
// without the offending lines" — is recorded here.

// 🔴 Paragraph boundaries END a sentence. The first version collapsed all whitespace first, so a
// heading ran into the paragraph under it and the last sentence of one paragraph ran into the first
// of the next. Measured 2026-08-05: that inflated "sentences carrying >2
// propositions" to 55, and the top offenders printed by the report were not sentences at all —
// they were a title glued to an abstract. The metric therefore looked like noise, which is exactly
// why nobody ever wired it into the flags that hooks and pre-commit consume. A miscounted metric
// does not get argued with; it gets ignored.
// Headings never reach this function: the paper's prose comes without them (`paperProse`), and a
// rendered page sets them as lines of their own.
function splitSentences(t) {
  return t
    .split(/\n\s*\n/) // paragraphs never run together
    .flatMap((p) =>
      p
        .split("\n")
        .join(" ")
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+(?=[A-Z“"(*`])/),
    )
    .map((s) => s.trim())
    .filter(Boolean);
}
const words = (t) => (t.match(/[A-Za-z0-9%.'’-]+/g) || []).length;

/**
 * The metrics of `text`, whose sentences the caller split and found non-empty — the same array is
 * passed in rather than split again, so the check the caller made is the one the division relies on.
 */
function analyse(text, sents) {
  const W = words(text),
    per1k = (n) => +((n / W) * 1000).toFixed(1);
  const lens = sents.map(words);
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const sd = Math.sqrt(
    lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length,
  );

  const cats = {
    frameMarkers: count(text, FRAME_MARKERS),
    transitions: count(text, TRANSITIONS),
    endophoric: count(text, ENDOPHORIC),
    codeGlosses: count(text, CODE_GLOSSES),
    hedges: count(text, HEDGES),
    boosters: count(text, BOOSTERS),
    selfMention: count(text, SELF_MENTION),
    engagement: count(text, ENGAGEMENT),
  };
  const mdTotal = Object.values(cats).reduce((a, b) => a + b, 0);

  // Per sentence: the wasted stress position, negation and the topic position.
  const perSent = sents.map((s) => {
    const sw = words(s);
    const frame = count(s, FRAME_MARKERS);
    // stress position: last ~8 words
    const tail = s.split(/\s+/).slice(-8).join(" ");
    const wastedStress =
      /\((Appendix|Fig|Table|Section|§)[^)]*\)\.?$/i.test(s.trim()) ||
      /\[\d+([,–-]\s*\d+)*\]\.?$/.test(s.trim()) ||
      // a RESULT number = %, or a digit that is not part of a section/appendix/figure pointer
      (count(tail, HEDGES) > 0 &&
        /%|\b\d+(\.\d+)?\b/.test(
          s.replace(
            /\b(Appendix|Fig\.?|Table|Section|§)\s*[A-Z]?\.?\d+(\.\d+)*/gi,
            "",
          ),
        ) &&
        !/%|\b\d+(\.\d+)?\b/.test(
          tail.replace(
            /\b(Appendix|Fig\.?|Table|Section|§)\s*[A-Z]?\.?\d+(\.\d+)*/gi,
            "",
          ),
        ));
    const negMain = count(s, NEGATORS) > 0;
    // topic position = first 5 words
    const topic = s.split(/\s+/).slice(0, 5).join(" ").toLowerCase();
    return {
      s,
      sw,
      frame,
      wastedStress,
      negMain,
      topic,
      hedges: count(s, HEDGES),
      definites: s.match(/\bthe [a-z][a-z-]*(\s+[a-z][a-z-]*)?\b/g) || [],
    };
  });

  const negPct = Math.round(
    (perSent.filter((p) => p.negMain).length / sents.length) * 100,
  );
  return {
    words: W,
    sentences: sents.length,
    sentenceLens: lens,
    meanLen: +mean.toFixed(1),
    sdLen: +sd.toFixed(1),
    cv: +(sd / mean).toFixed(2),
    per1k: Object.fromEntries(
      Object.entries(cats).map(([k, v]) => [k, per1k(v)]),
    ),
    raw: cats,
    metadiscoursePer1000: per1k(mdTotal),
    nominalisationsPer1000: per1k((text.match(NOMINAL) || []).length),
    contrastivePer10k: +((count(text, CONTRASTIVE) / W) * 10000).toFixed(1),
    wastedStress: perSent.filter((p) => p.wastedStress).map((p) => p.s),
    negatedSentencePct: negPct,
    topics: perSent.map((p) => p.topic),
  };
}

/** The `.tex` files of `figures/` beside a rendered page, each as `{ file, text }`. */
function figureFiles(pagePath, fs, path) {
  const dir = path.join(path.dirname(pagePath), "figures");
  let files; // no initialiser: the catch branch returns, only try assigns (2026-08-28)
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".tex"));
  } catch {
    return [];
  }
  return files.map((f) => ({
    file: `figures/${f}`,
    text: fs.readFileSync(path.join(dir, f), "utf8"),
  }));
}

/**
 * Every `\caption{…}` of `sources` (`{ file, text }`) a reader sees, measured. The LaTeX
 * language's projection blanks what never typesets — verbatim and code, macro definitions, the
 * preamble — and keeps a caption's argument; it keeps comments too, as `html` nodes of its tree,
 * for the rules that read notes. So a caption is skipped when its argument is blank in the
 * projection or it starts inside a comment: a quoted or commented-out `\caption` is not one.
 */
function captions(sources) {
  const out = [];
  for (const { file: f, text: s } of sources) {
    const { root, text: seen } = texToMdast(s);
    const comments = root.children
      .filter((n) => n.type === "html")
      .map((n) => [n.position.start.offset, n.position.end.offset]);
    for (const m of s.matchAll(/\\caption\{/g)) {
      let i = m.index + m[0].length,
        depth = 1,
        j = i;
      while (j < s.length && depth) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") depth--;
        j++;
      }
      if (
        !/\S/.test(seen.slice(i, j - 1)) ||
        comments.some(([a, b]) => m.index >= a && m.index < b)
      )
        continue;
      const text = s
        .slice(i, j - 1)
        .replace(/\\[a-zA-Z]+\s*/g, " ")
        .replace(/[{}]/g, " ")
        .replace(/---/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      // A non-empty caption splits into at least one sentence.
      const sents = splitSentences(text);
      out.push({
        file: f,
        words: words(text),
        longest: Math.max(...sents.map(words)),
        longestSentence: sents.slice().sort((a, b) => words(b) - words(a))[0],
      });
    }
  }
  return out;
}

function report(name, r) {
  const flag = (ok) => (ok ? "ok  " : "FLAG");
  console.log(`\n=== ${name} — ${r.words} words, ${r.sentences} sentences ===`);
  console.log(
    `sentence lengths ${JSON.stringify(r.sentenceLens)}  mean ${r.meanLen}  sd ${r.sdLen}  CV ${r.cv}`,
  );
  console.log(
    `${flag(r.metadiscoursePer1000 <= THRESHOLDS.metadiscourseTotalPer1000.warn)} all metadiscourse/1000w  ${r.metadiscoursePer1000}   (Hyland RA baseline 64.9, warn >${THRESHOLDS.metadiscourseTotalPer1000.warn})`,
  );
  console.log(`     nominalisations/1000w    ${r.nominalisationsPer1000}`);
  console.log(
    `${flag(r.contrastivePer10k <= THRESHOLDS.contrastivePer10k.warn)} "rather than"/instead-of/10,000w  ${r.contrastivePer10k}   (warn >${THRESHOLDS.contrastivePer10k.warn}; not epanorthosis, no published baseline)`,
  );
  console.log(
    `${flag(r.wastedStress.length === 0)} sentences ending on a cross-ref/citation/hedge (wasted stress position): ${r.wastedStress.length}`,
  );
  r.wastedStress.forEach((s) => console.log(`       > …${s.slice(-70)}`));
  console.log(
    `${flag(r.negatedSentencePct <= THRESHOLDS.negatedMainClausePct.warn)} sentences whose main claim is a negation: ${r.negatedSentencePct}%`,
  );
  console.log(
    `     topic positions (whose story is this?): ${r.topics.map((t) => `"${t}"`).join(" | ")}`,
  );
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "usage: node prose-lint.mjs <paper.tex|page.txt> [more files] [--flags-only|--headings]",
  );
  process.exit(0);
}

// A paper's source is its `paper.tex`, and a `.txt` is its rendered page. Anything else would be
// measured as if it were prose, with no way to tell its markup from its sentences.
const unread = args.filter(
  (a) => !a.startsWith("--") && !a.endsWith(".tex") && !a.endsWith(".txt"),
);
if (unread.length) {
  console.error(
    `prose-lint reads a paper.tex or the text of its rendered PDF (.txt), not: ${unread.join(", ")}`,
  );
  process.exit(2);
}

const fs = await import("node:fs");
const path = await import("node:path");

// 🔴 The RENDERED page, not only the source. Added 2026-08-05 after the author asked why the render
// step had not caught a stall he found by opening the PDF. It had not because nothing reads the
// rendered text: the build checks FORM — page count, overfull boxes, unresolved references, unset
// characters, the anonymity grep — and never looks at a sentence, while every prose check reads the
// source and never sees a typeset page. Between those two layers sat every
// defect he found by eye, and he was the only reader of the artifact a reviewer actually gets.
function pdfTextOnly(t) {
  const cut = t.search(/^\s*References\s*$/m);
  if (cut > 0) t = t.slice(0, cut);
  return t
    .replace(/^\s*\d+\s*$/gm, "") // page numbers
    .replace(/(\w)-\n(\w)/g, "$1$2") // hyphenation introduced by the two-column set
    .replace(/\f/g, "\n\n");
}

// 🔴 `--flags-only` and a NON-ZERO EXIT, added 2026-08-05, are what let anything downstream act.
// Until today this file printed a wall of numbers and always exited 0, and it was wired to no hook
// at all — it ran only if a human or a skill remembered it existed. Its epanorthosis metric sat at
// 50.8 per 10,000 words (the LLM baseline is 7.8) through five consecutive writing passes and never
// once flagged, because it had no threshold. The corpus owner found the tic by eye in a single reading and
// asked why the tooling had not. It had not because it was measuring, and measuring is not checking
// — which is, word for word, this paper's own thesis running loose inside its own toolchain.
const flagsOnly = args.includes("--flags-only");
let flagged = 0;
for (const f of args.filter((a) => !a.startsWith("--"))) {
  const raw = fs.readFileSync(f, "utf8");
  const tex = f.endsWith(".tex")
    ? paperProse(path.resolve(f), raw, { files: nodeFiles, latex: latexReader })
    : null;
  // 🔴 NOTHING LEFT IS NOT "CLEAN". A body that strips to no words used to be analysed anyway: every
  // metric is a fraction of the word count, so the report printed NaN, FLAGged three metrics and
  // exited 0. Refused — no number is better than a meaningless one. The test is on sentences: a
  // zero sentence count divides just the same as a zero word count.
  const text = tex ? tex.body : pdfTextOnly(raw);
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    console.error(
      tex
        ? `prose-lint: ${f} has no prose to measure — after the preamble, comments, floats and ` +
            "the back matter are left out, no word is left."
        : `prose-lint: ${f} has no prose to measure — no sentence is left before the references.`,
    );
    process.exit(2);
  }
  const r = analyse(text, sentences);
  if (flagsOnly) {
    const lines = [];
    // A paper's captions are in its own files — paper.tex and what it includes, wherever a figure
    // is set; a rendered page has the `.tex` of `figures/` beside it.
    for (const c of captions(tex ? tex.files : figureFiles(f, fs, path))) {
      if (c.longest > THRESHOLDS.captionSentenceWords.warn)
        lines.push(
          `   ${c.file}: caption sentence of ${c.longest} words (warn >${THRESHOLDS.captionSentenceWords.warn}) — "${c.longestSentence.slice(0, 110)}…"`,
        );
      if (c.words > THRESHOLDS.captionWords.warn)
        lines.push(
          `   ${c.file}: caption is ${c.words} words (warn >${THRESHOLDS.captionWords.warn}) — a caption this long is a section under a picture`,
        );
    }
    if (lines.length) {
      flagged += lines.length;
      // The header STATES the count, so a caller need not count output lines — header and footer
      // are not findings.
      console.error(
        `✍️  prose-lint — ${f.split("/").pop()} — ${lines.length} finding(s):`,
      );
      lines.forEach((l) => console.error(l));
      console.error(
        "   run prose-lint.mjs on the file without --flags-only for the sentences",
      );
    }
  } else if (args.includes("--headings")) {
    // The whole-document question, printed as one list. Not a gate: "does this heading name a
    // concrete noun" is judgement and pretending otherwise would be the exact failure this file
    // exists to stop. What was missing is cheaper and was the real cause — nobody had ever seen the
    // headings AS A SET. Two that a reader called "VAGUE AF" and "why not mention the linter??"
    // survived six passes because every pass looked only at the section it was editing.
    if (!tex) {
      console.error(
        `prose-lint: --headings reads a paper.tex — a rendered page (${f}) marks no heading`,
      );
      process.exit(2);
    }
    console.log(`\n=== ${f.split("/").pop()} — every heading, in order ===`);
    tex.headings.forEach((h, i) =>
      console.log(`${String(i + 1).padStart(3)}. ${h}`),
    );
    console.log(
      "\nRead these as a stranger who will read nothing else. Each should name a thing:",
    );
    console.log(
      'a linter, a configuration, a repository, a rule — not "answers", "kinds", "moves".',
    );
  } else {
    report(f.split("/").pop(), r);
  }
}
if (!flagsOnly)
  console.log(
    "\n(thresholds and their sources are in THRESHOLDS at the top of this file)",
  );
// Exit 1 on a flag so a caller can branch. Hooks stay advisory by swallowing it themselves; the
// point is that the information now EXISTS at the exit code, where it was previously unreachable.
process.exit(flagged ? 1 : 0);
