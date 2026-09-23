#!/usr/bin/env node
/**
 * 🔴 2026-08-26 — ALL SIXTEEN CHECKS LEFT THIS FILE. THIS FILE IS NOW ONLY AN INVENTORY.
 *
 * Fourteen became `@eslint/markdown` rules in `eslint-rules/paper-structure.mjs`
 * (twelve rules — two of them have two `messageId`s each), two were deleted as duplicates of things
 * already moved: the share of the free half duplicated `paper/appendix-ratio`, and "a numbered
 * section without `carries:`" duplicated `paper/section-justification`, both from
 * `eslint-rules/paper-prose.mjs`.
 * Parity was proven BEFORE the removal: 29 inputs (a real paper + 22 "one defect at a time" fixtures
 * + 6 edge cases), 0 divergences, every number matched byte for byte. The analysis and the
 * classification table are in the author's private notes
 * (`papers/research/2026-08-26-klassifikatsiya-structure.md`).
 *
 * WHAT IS LEFT AND WHY IT IS NOT A CHECK. The inventory is a table "own / total / share / section"
 * with a `carries:` note under each row. It has no threshold and produces no findings: it is read by
 * a HUMAN in the `tighten-paper` skill, to compare a section's weight with what the section claims
 * about itself. That comparison was exactly the author's idea ("print the claim next to the
 * weight"), and a linter cannot express it — a finding has nowhere to put a whole table.
 *
 * ⚠️ `--flags-only` IS KEPT, BUT IT ALWAYS STAYS SILENT AND ALWAYS EXITS 0.
 *
 * ── 2026-08-26, EVENING: BOTH NAMED CONSUMERS ARE CLOSED, AND A THIRD ONE TURNED UP ────────
 *
 * The paragraph above named two callers and said that until they are converted, the ledger writes
 * "no findings" BY SILENCE. That was true and measured: on `the reference paper/paper.md`
 * `--flags-only` printed 0 lines, while the same bytes through ESLint give **6 findings**
 * (`subsection-size` ×2 · `section-lead` · `free-section-size` ×2 · `block-ungraded`).
 *
 *   `.github/workflows/paper-gates.yml`, the `structure` step  → REMOVED. An `eslint` step already
 *       stood next to it, running the same rules over the same glob; a measurement showed a
 *       byte-identical list of files. The full justification is in the comment where the removed
 *       step used to be.
 *   `run-mechanical.mjs`, the `tighten-paper/structure` line → CONVERTED to ESLint
 *       (`read: 'eslint'`, filtered by the rules from `eslint-rules/paper-structure.mjs`). Not
 *       deleted: ESLint writes nothing into the ledger, and the ledger is the only place where the
 *       fact "somebody looked at this paper's structure on these bytes" is stored with a hash of the
 *       input.
 *
 * 🔴 A THIRD CALLER THE BANNER DID NOT KNOW ABOUT: `.githooks/pre-commit`. It printed nothing and
 * swallowed the exit code through `|| true`. The lesson is exactly the one already recorded in
 * `CLAUDE.md` about the four forms of a reference: the banner listed the callers FROM MEMORY, while
 * only a grep for the flag's name gives the full list.
 *
 * ✅ CLOSED 2026-08-26. The call was converted to ESLint through `.githooks/structure-gate.mjs`
 * (the rule names are DERIVED from `eslint-rules/paper-structure.mjs`, not rewritten as a list),
 * the `|| true` was removed, and the exit codes were separated: 0 — it judged · 2 — it did NOT
 * judge, the commit is rejected · 3 — no `node_modules/.bin/eslint`, loudly and without blocking.
 * The test is `.githooks/structure-gate.harness.mjs`, five mutations, each one with proof that the
 * patch applied. Measured: on the same bytes the old call gave 0 findings and 0 bytes of output,
 * ESLint with the same rules — **6**.
 *
 * ⚠️ And the COMPLETENESS check of the list, which was missing last time: in `pre-commit` the idiom
 * `--flags-only … || true` occurs FOUR times. All of them were run, 26.08:
 *   `prose-lint.mjs`        — alive (2 findings, exit 1)
 *   `artifact-coverage.mjs` — alive (6 findings, exit 1)
 *   `population-map.mjs`    — silent LEGITIMATELY (line 144: in this mode a clean run prints
 *                             nothing; on a real paper the registry adds up)
 *   `structure.mjs`         — was dead, closed above
 * A list without the third column is an enumeration, not a check.
 *
 * ⚠️ THE FLAG IS NOT DELETED AND MUST NOT BE DELETED WITHOUT EDITING OTHER PEOPLE'S FILES: its
 * silence is pinned by two asserts — `eslint-rules/paper-structure.harness.mjs` (≈550) and
 * `.claude/skills/paper-pipeline/scripts/gates.harness.mjs` (block 1). Both fail if this mode prints
 * something again OR exits with a non-zero code. Printing a "see eslint" pointer here is still
 * forbidden: `read: 'flags'` at any remaining consumer would turn it into a permanent false finding.
 */
/**
 * structure.mjs — the mechanical leg of tighten-paper.
 *
 *   node structure.mjs <paper.md>              the whole paper
 *   node structure.mjs <paper.md> --section=3  one section and its subsections
 *   node structure.mjs <paper.md> --flags-only ⚠️ ALWAYS SILENT (see the banner above)
 *
 * WHY THIS EXISTS, and why it is NOT in prose-lint. Prose-lint judges sentences. Structure is a
 * different question and was homeless: `tighten-paper` is a skill — a model reading and judging —
 * with no script under it, so nothing mechanical ever looked at the document's SHAPE. Author,
 * 2026-08-05: *"I thought prose was about prose, and structure is something else entirely"*, and
 * before that *"the relevant skill needs to do the same thing for the whole paper by default, or for
 * one section"* (both said in Russian).
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
import { readFileSync } from "node:fs";
import {
  headings as mdHeadings,
  splitSections,
  stripFences,
  requireMarkdown,
  stripFrontmatter,
} from "../../lib/markdown.mjs";

// Markup is parsed with a PARSER (`CLAUDE.md`, 2026-08-11). We fail rather than degrade: without a
// parser not one section would be found in the paper, `--flags-only` would return 0 findings and
// code 0 — that is, "the structure is fine" about a document nobody read. This file is precisely
// about the fact that a metric without a threshold and a check without observability silently mean
// nothing; a confident zero here would be the third instance of the same error in one file.
requireMarkdown();

// Headings of depth 2-3 are what this file calls a "section" and a "subsection". This used to be
// written as `#{2,3}`, that is, as a statement about the NUMBER OF HASHES: `#{2,3}` counted any such
// line as a section, including a line inside a ``` block. The papers in this repo quote other
// people's markup in chunks, so "an extra section out of a quotation" is not a hypothesis.
const SECTION_MIN = 2,
  SECTION_MAX = 3;

// The thresholds (60 words of lead · 350 words of a subsection · 100% of the free half · 1.0
// against the heaviest section) left together with the checks — they live as rule options in
// `eslint-rules/paper-structure.mjs`, and the CALIBRATION of each (why exactly 60 and exactly 350,
// and on which corpus it was measured) moved there as comments. They must not be kept here: a number
// without a threshold is prose, and a threshold without a check is a second source of truth that
// will drift away from the first.

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error(
    "usage: node structure.mjs <paper.md> [--section=N]   (--flags-only is accepted and stays silent)",
  );
  process.exit(0);
}
const only =
  (args.find((a) => a.startsWith("--section=")) || "").split("=")[1] || null;
const flagsOnly = args.includes("--flags-only");

let t = readFileSync(file, "utf8");
// `stripFences()` instead of `/^```[\s\S]*?^```/gm`: with an ODD number of fences that expression
// glued the end of one block to the beginning of the next and cut out the prose between them — and
// prose cut out here means an understated section weight, that is, a finding of "this is a divider,
// not a section" on a section that is perfectly fine.
// `blank: true` — the block's lines become empty rather than disappear: a code block is a paragraph
// boundary, and removing the lines would glue neighbouring paragraphs together. Here it does not
// affect the numbers (words and headings are counted the same either way), but the form must match
// `prose-lint`, where it does.
t = stripFences(
  stripFrontmatter(t) // frontmatter
    .replace(/<!--[\s\S]*?-->/g, ""), // working comments
  { blank: true },
);
// Body and FREE SECTIONS are measured separately. They hold different bars — the body has a page
// limit and the free sections do not — but "does not count against the limit" is not "unmeasured".
// 🔴 Until 2026-08-05 this script cut at `## Limitations` and never looked further, so every answer
// it gave to "do all the sections survive?" silently excluded Limitations, Ethics and every
// appendix. The author asked the question about those exact sections and the tool could not have
// answered it. A free section is where unbudgeted prose accumulates precisely because nothing
// prices it.
// 2026-08-11: the three boundaries (free sections · bibliography · appendices) are found by the
// parser. The `-1 / offset` convention and the `> 0`, `< 0` comparisons are kept as they were — the
// previous expressions did not treat a heading on the very first line of the file as a boundary
// either, and changing that here would mean introducing new behaviour under the guise of moving to a
// parser.
const headOffset = (re) => {
  const h = mdHeadings(t).find((x) => x.depth === 2 && re.test(x.text));
  return h ? h.offset : -1;
};
const cut = headOffset(/^(Limitations|References|Ethical)/u);
const body = cut > 0 ? t.slice(0, cut) : t;
const refs = headOffset(/^References/u);
const appx = headOffset(/^Appendix/u);
const freeText =
  cut > 0
    ? refs > cut
      ? t.slice(cut, refs) + t.slice(appx < 0 ? t.length : appx)
      : t.slice(cut)
    : "";

const wordsOf = (s) => (s.match(/[A-Za-z0-9%.'’-]+/g) || []).length;

// 🔴 `carries:` notes are read back OUT, not just written. The convention puts a working comment
// above each heading saying what that section carries and whether it is justified — and until
// 2026-08-05 nothing ever read one. They were write-only: authored during a tighten pass, then
// invisible to every later pass, including the passes deciding whether a section earns its place.
// Author's idea, and it is the right one: print the claim beside the weight, so "this section is
// 564 words" and "this section claims to carry X" are read in the same glance.
// 🔴 A justification with no SCALE and no VERDICT cannot decide anything, and for a week none of
// these notes ever concluded "cut me". Author, 2026-08-06 (both quotes said in Russian): *"reading
// the paper you get the impression — damn, is this section really needed"*, and *"every appendix
// section must also have a comment justifying itself, with a score from 0 to 10 and a note on
// whether it should be cut / moved / shortened"*.
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

const rawSections = stripFrontmatter(readFileSync(file, "utf8"));
const carriesFor = new Map();
const scoreFor = new Map();
const verdictFor = new Map();
// `(?:(?!-->)[\s\S])*?` and not `[\s\S]*?`: a lazy match will happily jump ACROSS a closing `-->`
// when the comment it belongs to is not followed by a heading, swallowing the next comment whole and
// attributing its note to the wrong section. Caught 2026-08-05 within a minute of the check existing,
// which is the same reason the check exists.
for (const m of rawSections.matchAll(
  /<!--((?:(?!-->)[\s\S])*?)-->\s*\n(#{2,3}) (.+)/g,
)) {
  const note = m[1].replace(/\s+/g, " ");
  const c = note.match(
    /carries:\s*(.+?)(?:·|justified:|note:|costs:|verdict:|because:|-->|$)/i,
  );
  if (c) carriesFor.set(m[3].trim(), c[1].trim());
  const s = note.match(NOTE_RE);
  if (s) scoreFor.set(m[3].trim(), Number(s[1]));
  const v = note.match(VERDICT_RE);
  if (v) verdictFor.set(m[3].trim(), v[1].toUpperCase());
}

// The notes on the appendix's bold lead-ins (`score:`/`verdict:` above a `**Block.**`) are now read
// by `paper/block-ungraded` · `paper/block-note` · `paper/block-verdict`. The inventory does not
// print them, so they are not parsed here.

const outline = [];
for (const chunk of splitSections(body, {
  min: SECTION_MIN,
  max: SECTION_MAX,
})) {
  if (!chunk.heading) continue; // the preamble before the first heading is not a section
  const title = chunk.heading.text;
  outline.push({
    // `chunk.body` is the chunk ALREADY without the heading line, so the previous
    // `chunk.replace(/^#{2,3} .+$/m, '')` is no longer needed: removing the heading line is part of
    // the splitting, not a separate operation over the text.
    level: chunk.heading.depth,
    title,
    words: wordsOf(chunk.body),
    carries: carriesFor.get(title) ?? null,
  });
}

// Own words + everything underneath, so a section's true weight is visible next to its lead.
for (let i = 0; i < outline.length; i++) {
  let total = outline[i].words;
  if (outline[i].level === 2)
    for (let j = i + 1; j < outline.length && outline[j].level === 3; j++)
      total += outline[j].words;
  outline[i].total = total;
}

const inScope = (row, i) => {
  if (!only) return true;
  const num = (s) => (s.match(/^(\d+)/) || [])[1];
  if (row.level === 2) return num(row.title) === only;
  for (let j = i; j >= 0; j--)
    if (outline[j].level === 2) return num(outline[j].title) === only;
  return false;
};

const bodyTotal = outline
  .filter((r) => r.level === 2)
  .reduce((a, r) => a + r.total, 0);

// The free sections are inventoried HERE, above the findings loop, and not down in the printing
// block where they used to live. That placement was the whole defect: measured in a branch that
// only the human-readable mode reaches, the ratio could never become a finding, so `--flags-only`
// — the mode hooks and CI run — reported a clean document while the unpriced half stood at 165%.
const freeSections = [];
for (const chunk of splitSections(freeText || "", {
  min: SECTION_MIN,
  max: SECTION_MAX,
})) {
  if (!chunk.heading) continue;
  freeSections.push({
    level: chunk.heading.depth,
    title: chunk.heading.text,
    words: wordsOf(chunk.body),
  });
}
const freeTotal = freeSections.reduce((a, r) => a + r.words, 0);

// 🔴 THERE WERE SIXTEEN FINDINGS HERE — see the banner in the header. There is DELIBERATELY not a
// single check left in this file: two sources of truth about one fact drift apart on the very first
// edit, and there is nothing to settle the question of which one is right.

if (flagsOnly) {
  // Silence and exit code 0 — ALWAYS. Deliberately not one line on stdout/stderr:
  // `run-mechanical.mjs` reads this mode as `read: 'flags'`, that is, "non-empty output = a
  // finding", and a pointer saying "the checks have moved" would turn into a permanent false finding
  // in the ledger. The limitation of this mode is named in the banner at the top; it is cured by
  // converting both callers to `npx eslint`, not here.
  process.exit(0);
}

console.log(`\n=== ${file.split("/").pop()} — outline, in order ===`);
console.log(
  `${"own".padStart(6)} ${"total".padStart(6)} ${"share".padStart(6)}  section`,
);
for (const [i, r] of outline.entries()) {
  if (!inScope(r, i)) continue;
  const share =
    r.level === 2
      ? `${((100 * r.total) / bodyTotal).toFixed(1)}%`.padStart(6)
      : " ".repeat(6);
  console.log(
    `${String(r.words).padStart(6)} ${String(r.level === 2 ? r.total : "").padStart(6)} ${share}  ` +
      `${r.level === 3 ? "    " : ""}${r.title}`,
  );
  // The section's own claim about itself, printed where its weight is read. A section whose note
  // does not survive being read next to its size is a section to cut, and that comparison was
  // impossible to make until both appeared in one place.
  if (r.carries) {
    const s = scoreFor.get(r.title),
      v = verdictFor.get(r.title);
    const tag =
      s === undefined && !v ? "" : `[${s ?? "?"}/10 ${v ?? "NO VERDICT"}] `;
    console.log(
      `${" ".repeat(21)}${r.level === 3 ? "    " : ""}↳ ${tag}carries: ${r.carries.slice(0, 80)}`,
    );
  } else if (/^\d/.test(r.title))
    console.log(
      `${" ".repeat(21)}${r.level === 3 ? "    " : ""}↳ 🔴 no carries: note — nobody has said why this section is here`,
    );
}
console.log(
  `\nbody total ${bodyTotal} words across ${outline.filter((r) => r.level === 2).length} sections`,
);

// The free sections, measured against the body they hang off. A paper whose unbudgeted prose
// outweighs its budgeted prose is telling you where its author was allowed to keep writing.
if (freeSections.length) {
  console.log(`\n=== outside the page limit ===`);
  for (const f of freeSections) {
    console.log(
      `${String(f.words).padStart(6)} ${" ".repeat(14)}${f.level === 3 ? "    " : ""}${f.title}`,
    );
    const c = carriesFor.get(f.title);
    if (c)
      console.log(
        `${" ".repeat(21)}${f.level === 3 ? "    " : ""}↳ carries: ${c.slice(0, 96)}`,
      );
    else if (f.level === 2)
      console.log(
        `${" ".repeat(21)}↳ 🔴 no carries: note — and no page limit forcing the question`,
      );
  }
  console.log(
    `\nfree total ${freeTotal} words = ${((100 * freeTotal) / bodyTotal).toFixed(0)}% of the body`,
  );
  if (freeTotal > bodyTotal)
    console.log(
      `🔴 The unbudgeted half is LARGER than the paper. Nothing prices these sections, which\n` +
        `   is exactly why prose settles here. Ask of each: would a reviewer miss it?`,
    );
}

console.log(
  "\nThe rest is judgement and stays with the skill: is this the ORDER a stranger needs, does each\n" +
    "heading name a thing, and does each section earn its place. Read the headings as a set — a\n" +
    "stranger should be able to reconstruct the argument from them alone.",
);
