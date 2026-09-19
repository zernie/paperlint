#!/usr/bin/env node
/**
 * pipeline-check — the mechanical leg of paper-pipeline.
 *
 * Usage:  node pipeline-check.mjs <paper-dir> [--json] [--today=YYYY-MM-DD]
 * Exit:   always 0 (advisory). Findings go to stdout; a parse failure to stderr.
 *
 * 🔴 2026-08-26 — SIXTEEN CHECKS OUT OF TWENTY-TWO MOVED INTO `eslint-rules/pipeline-status.mjs`.
 * Their input is ONE markdown document, that is, exactly the subject the `@eslint/markdown` engine
 * is made for; here they were held only by the fact that a private `MarkdownIt` stood next to them.
 * What moved:
 *   unattributed-row · unreadable-row · duplicate-id  → pipeline/row-attribution · row-readable ·
 *                                                       duplicate-id      (all three `error`)
 *   unknown-input                                     → pipeline/unknown-input      (`error`)
 *   no-verdict                                        → pipeline/verdict-present    (`error`)
 *   gate-missing-input · gate-stale-input             → pipeline/gate-inputs
 *   undeclared-input                                  → pipeline/undeclared-input
 *   unattributed-verdict · single-family-jury         → pipeline/judge-recorded
 *   undated-continuous                                → pipeline/undated-continuous
 *   study-before-frame                                → pipeline/study-before-frame
 *   scalar-verdict                                    → pipeline/scalar-verdict
 *   weak-accept-unowned                               → pipeline/weak-accept-unowned
 *   ceiling-unplanned                                 → pipeline/ceiling-unplanned
 *   unrun-gate                                        → pipeline/unrun-gate
 * Parity was proved BEFORE the deletion, on the real corpus (four live scorecards, 29 findings
 * matched byte for byte) and on 27 fixtures of the "one planted defect at a time" kind. The
 * classification of all 22 and the analysis of the single discrepancy that surfaced along the way
 * are in `the author's private research notes`.
 *
 * WHY A SCRIPT AND NOT A PARAGRAPH. The six remaining checks correspond to failures that actually
 * happened on a real paper, and all six read an input from OUTSIDE this file — which is why they
 * stayed a script (the rule "local to a node goes to the linter, cross-file goes to a script"):
 *
 *   stale-continuous   verify-citations was numbered like a one-shot step, so a
 *                      citation added after the last run counted as verified. The
 *                      project rule "we checked last cycle does not count" existed.
 *                      INPUT FROM OUTSIDE: the date of the last commit that touched the paper's
 *                      text (git).
 *   submit-access      OpenReview needs an ACTIVE profile and moderation runs up to
 *                      two weeks. Discovered at T−4 days on a finished paper, as the
 *                      sole item on the critical path.
 *                      INPUT FROM OUTSIDE: the clock (`--today`). The check is HYBRID — its
 *                      second branch (there is no deadline in the header at all) needs no clock,
 *                      but half a check is not moved into the linter: one fact would end up with
 *                      two homes.
 *   repeat-finding     the same worst section named pass after pass, never worked.
 *                      INPUT FROM OUTSIDE: `reviews/*.md` and their mtime.
 *   no-cold-read       nobody without context has read the current text.
 *   stale-cold-read    the cold read describes prose that no longer exists.
 *                      INPUT FROM OUTSIDE: the presence of `reviews/` + the commit date of the
 *                      text.
 *   credential-available a blocker parked on the author that the environment can clear.
 *                      INPUT FROM OUTSIDE: `process.env`.
 *
 * The checks are deliberately mechanical. Judgement — is the science good, does the
 * arc hold — stays with the skills; this only refuses to let a checkable thing be
 * quietly false.
 *
 * 🔴 ROW IDS ARE WORDS, NOT TWO-LETTER CODES (renamed 2026-08-09). The id is the join key between
 * every paper's scorecard, this checker, `pipeline-edges.mjs` and the skills' prose, and two letters
 * had run out of room. It had already collided twice, both live:
 *   - `Cr` meant `cold-read-diff` in one table of `<paper-a>` and `Camera-ready` in another,
 *     and `byId` merges rows by id, so the two are one row to everything downstream.
 *   - `Id` (research-ideate) is the header word `id`, so the header-row filter below silently ate
 *     that row on every scorecard in the repo — a row that parsed as nothing, on every paper, for as
 *     long as the template existed.
 * `coldread`/`cameraready` and `idea` cannot collide that way, which is the point: the fix is in the
 * key space, not in a rule telling people to be careful.
 *
 * 🔴 THE SCORECARD IS PARSED AS MARKDOWN, NOT MATCHED WITH REGULAR EXPRESSIONS (rewritten 2026-08-09;
 * since 2026-08-26 the markup for the moved checks is parsed by ESLint itself, and `MarkdownIt`
 * stayed here for the sections the six remaining checks walk over).
 * Three defects were found in one morning and all three had the same cause — a regex guessing at
 * document structure — and all three were SILENT, which is the only kind that survives:
 *
 *   1. the section heading was `/^###\s+([A-Z]+)\s*$/`. The live `<paper-a>` carries
 *      `### Гейты, прогнанные 06.08 …`; it did not match, `current` stayed unset, and every row of
 *      that table was dropped without a word. Two of them were cold-read rows.
 *   2. the header row was GUESSED with `/^\|\s*id\s*\|/i`. The data row `| Id |` (research-ideate)
 *      matched the guess and was eaten on every scorecard in the repo for as long as the template
 *      had existed. A markdown table has a real `thead`; there is nothing to guess.
 *   3. nothing checked that ids were unique, so two rows sharing one merged into whichever came last.
 *
 * With an AST a heading is a node whose text is just text — Cyrillic, emoji and trailing prose cost
 * nothing — and `thead`/`tbody` are given, not inferred. What remains genuinely textual (pulling the
 * `Venue:` and `**Readiness verdict:**` fields out of prose, reading a ☑ out of a cell) stays a text
 * match, because those are labelled FIELDS inside text rather than document STRUCTURE. That is the
 * line: infer structure from the parse, read values from the text.
 *
 * TWO CLASSIFICATION DECISIONS, MADE EXPLICIT RATHER THAN LEFT INSIDE A PATTERN:
 *
 *   • A heading names a section iff its FIRST Latin-script word is one of SETUP / LOOP / CONTINUOUS /
 *     GATES / AFTER. Everything after that word is free — `### GATES (rerun 06.08)` is GATES. A
 *     heading with no Latin first word (`### Гейты, прогнанные 06.08`) or a different one names no
 *     section and CLOSES the previous one. We deliberately do NOT translate, alias or fuzzy-match
 *     headings: guessing that `Гейты` means GATES is the same move that produced defect 2, and
 *     silently continuing the previous section would file rows under a section they do not belong to.
 *     Rows in such a region are reported by `pipeline/row-attribution` (since 2026-08-26), never dropped.
 *     `AFTER` is an ordinary English word, which is exactly why the name must come FIRST — a prose
 *     heading like `## What changed AFTER the panel` must not capture the tables under it.
 *   • A table belongs to the scorecard iff its `thead`'s first cell is an id column — `id`, `код` or
 *     `code`, a short explicit list. This document legitimately contains PROSE tables (the panel
 *     must-fix table, the ceiling classification table); they are not scorecard rows and the
 *     document's own header row says so. Reading that from `thead` is a structural fact, not the
 *     guess defect 2 was. The legacy single-table format keys its first column `#` — a row NUMBER,
 *     not an id — and is therefore not adopted; see the diagnostic in `main`.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import MarkdownIt from "markdown-it";
import {
  headings as mdHeadings,
  requireMarkdown,
} from "../../../lib/markdown.mjs";
import { isMain } from "./consumer.mjs";

// Markup is parsed with a parser (`CLAUDE.md`, 2026-08-11). This script already parsed tables
// through its own `MarkdownIt` (below) — that is, half the file lived by the rule and half did not.
// Fail rather than degrade: the output goes into a pipeline gate.
requireMarkdown();

const MODERATION_WINDOW_DAYS = 21; // OpenReview says "up to two weeks"; a week of slack.
const SOURCE_RE = /(\.tex|\/(paper|draft)\.md)$/;
const DONE = new Set(["☑"]);

// ── parse ────────────────────────────────────────────────────────────────────

/** Strip bold/emoji decoration so `**access**` and `access` are the same id. */
const cleanId = (s) => s.replace(/\*\*/g, "").replace(/[^\w]/g, "").trim();

const STATUS_RE = /(☑|◐|☐|⚠|n\/a)/;
const ISO_RE = /(\d{4}-\d{2}-\d{2})/;
/**
 * Where a scorecard stops being current. The marker is a HEADING, and it is found as a heading
 * NODE in the parsed document — the level is free, the text is what is checked.
 *
 * 🔴 There used to be a second way in, and removing it is the point of this comment. A
 * `HISTORY_MARK_RE` matched the raw line `Всё, что ниже, — история` — a sentence — with `,?`,
 * `\s*` and the truncated stem `истори` bolted on so it would survive the author's mood and the
 * word's declension. Four hedges in one pattern is four admissions that the thing being matched
 * has no fixed form. Measured 2026-09-19: of the four status files the checker reads, ONE carried
 * that sentence; its `<!-- HISTORY -->` alternative had ZERO users and had never had any. The one
 * file now carries a `## History` heading instead, so both branches went.
 */
const HISTORY_HEADING_RE = /^(History|Archive)(?![\p{L}\p{N}_])/iu;

/** The five kinds of work the template groups rows into. A heading names one or it names none. */
const KNOWN_SECTIONS = new Set([
  "SETUP",
  "LOOP",
  "CONTINUOUS",
  "GATES",
  "AFTER",
]);
/**
 * First-column headers that make a table part of the scorecard. Short and explicit on purpose: an
 * open-ended rule here would be the guess that defect 2 was. `код` is present because the live
 * `<paper-a>` writes its gate-run table that way; `#` is deliberately ABSENT — it is a row
 * number, and the legacy single-table format that uses it has no sections to attribute rows to.
 */
const ID_COLUMNS = new Set(["id", "код", "code"]);

const md = new MarkdownIt();

/**
 * The section a heading names, or null.
 * The name must be the heading's first Latin-script word; anything after it is free text.
 */
function sectionOf(headingText) {
  const first = (headingText.toUpperCase().match(/[A-Z]+/) ?? [])[0];
  return first && KNOWN_SECTIONS.has(first) ? first : null;
}

/**
 * Everything up to the history marker. This project appends rather than rewrites, so every
 * scorecard accumulates superseded snapshots: a 2026-08-02 row saying the artifact was unhosted
 * re-triggered the credential check on 2026-08-05, hours after the artifact went up. A history
 * section is evidence, not status.
 *
 * Done by line before the parse rather than by walking the AST, because the marker is a convention
 * about where the document stops being current — not a structural feature markdown knows about.
 */
function currentPart(text) {
  const lines = text.split("\n");
  // The line numbers of marker headings come from the parser — for the same reason `headings()`
  // takes them from there: "the line starts with hashes" and "the line is a heading" are not the
  // same thing, and they diverge silently.
  const headingLines = new Set(
    mdHeadings(text)
      .filter((h) => HISTORY_HEADING_RE.test(h.text))
      .map((h) => h.line),
  );
  const cut = lines.findIndex((_l, i) => headingLines.has(i));
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n");
}

/** Index of the token closing the container opened at `open`. */
function closeOf(tokens, open, openType, closeType) {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i].type === openType) depth++;
    else if (tokens[i].type === closeType && --depth === 0) return i;
  }
  return tokens.length - 1;
}

/** `thead` cells and `tbody` rows of one table, straight from the AST — nothing is guessed. */
function readTable(toks) {
  const head = [];
  const rows = [];
  let inHead = false;
  let row = null;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type === "thead_open") inHead = true;
    else if (t.type === "thead_close") inHead = false;
    else if (t.type === "tr_open") row = [];
    else if (t.type === "tr_close") {
      if (row) (inHead ? head : rows).push(row);
      row = null;
    } else if (t.type === "th_open" || t.type === "td_open") {
      const inline = toks[i + 1];
      row?.push(inline?.type === "inline" ? inline.content.trim() : "");
    }
  }
  return { head: head[0] ?? [], rows };
}

/**
 * Parse PIPELINE-STATUS.md into `{sections: {SETUP: [row], …}, header, verdict}`.
 *
 * 🔴 `parseFindings` MOVED OUT 2026-08-26. The three findings about the PARSE itself
 * (`unattributed-row`, `unreadable-row`, `duplicate-id`) now live as the rules
 * `pipeline/row-attribution`, `pipeline/row-readable`, `pipeline/duplicate-id` in
 * `eslint-rules/pipeline-status.mjs`, and there they also became `error` — they are binary. We DO
 * NOT DUPLICATE them here: two sources of truth about one fact drift apart. A row that cannot be
 * read is still skipped (`continue`), just silently — the linter speaks about it, and to the
 * precision of a line.
 */
export function parseStatus(text) {
  const sections = {};
  let verdict = "";
  let header = "";
  let tables = 0;
  let scorecardTables = 0;
  const headings = [];

  let section = null;
  let heading = "(before the first heading)";

  const tokens = md.parse(currentPart(text), {});
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.type === "heading_open") {
      const inline = tokens[i + 1];
      const raw = inline?.type === "inline" ? inline.content : "";
      heading = raw.replace(/\s+/g, " ").trim();
      headings.push(heading);
      section = sectionOf(heading);
      if (section) sections[section] ??= [];
      continue;
    }

    // Labelled fields living inside prose. Last one wins, as it always has: a scorecard that
    // appends keeps older verdict paragraphs above the current one.
    if (t.type === "inline") {
      for (const line of t.content.split("\n")) {
        if (/^Venue:/.test(line)) header = line;
        if (/^\*\*Readiness verdict:\*\*/.test(line)) verdict = line;
      }
    }

    if (t.type !== "table_open") continue;
    const end = closeOf(tokens, i, "table_open", "table_close");
    const { head, rows } = readTable(tokens.slice(i, end + 1));
    i = end;
    tables++;

    // Not a scorecard table. The document's own header row says so; see the decision note up top.
    const idCol = (head[0] ?? "").toLowerCase().replace(/[*`\s]/g, "");
    if (!ID_COLUMNS.has(idCol)) continue;
    scorecardTables++;

    for (const c of rows) {
      const id = cleanId(c[0] ?? "");
      // An unreadable row is skipped silently: the finding about it comes from
      // `pipeline/row-readable`.
      if (!id || c.length < 4) continue;
      const joined = c.join(" | ");
      const row = {
        id,
        name: c[1] ?? "",
        skill: c[2] ?? "",
        // The `Requires` column is no longer read here: all three checks that ate it
        // (`gate-missing-input` · `gate-stale-input` · `unknown-input`) and the check of the
        // declaration itself (`undeclared-input`) moved into `eslint-rules/pipeline-status.mjs`.
        status: (joined.match(STATUS_RE) ?? [""])[0],
        date: (joined.match(ISO_RE) ?? [null])[0],
        raw: joined,
        section,
        heading,
      };
      // A row outside a section does not get into `sections` — no check read it before either;
      // the finding about that comes from `pipeline/row-attribution`.
      if (section) sections[section].push(row);
    }
  }

  return {
    sections,
    header,
    verdict,
    shape: { tables, scorecardTables, headings },
  };
}

/** Deadline from the header line, or null. Tolerates markdown bold (`Deadline: **2026-08-06 …**`). */
const deadlineOf = (header) =>
  (header.match(/Deadline:\s*\**\s*(\d{4}-\d{2}-\d{2})/) ?? [null, null])[1];

/**
 * When did the paper's own text LAST ACTUALLY CHANGE, as an ISO date, or null if no source found.
 *
 * 🔴 TWO DEFECTS FIXED HERE 2026-08-09, both of which made this checker lie about a file nobody
 * had touched. Measured on the live paper the same day: of 13 findings, ONE was false outright
 * (a cold read dated 08-07 reported as older than text last changed 08-06) and FOUR carried a
 * false stated reason. A checker wrong on a third of its output is muted inside a week.
 *
 *  1. THE CLOCK WAS `mtime`, WHICH IS NOT A PROPERTY OF THE TEXT. `git checkout`, `git stash pop`,
 *     a merge conflict resolved with `--ours`, or a fresh clone all rewrite it while leaving the
 *     bytes identical — and every gate then reports stale. Proven: `paper.md` was byte-identical
 *     to the submitted version (same md5, git date 08-06) with an mtime of today, and four
 *     continuous checks plus the cold read were called stale. The clock is now the last COMMIT
 *     that touched the file; mtime is used only when the file is dirty, where it is honest,
 *     because uncommitted edits really did just happen.
 *  2. THE GLOB SWEPT BUILD OUTPUTS. `build/acl_latex.tex` and `build-aclpubcheck/*.tex` match
 *     SOURCE_RE, and the walk skipped only dotfiles, node_modules and repro — so REBUILDING THE
 *     PDF marked every gate stale. Every build system in the occupancy sweep makes this
 *     unrepresentable by forcing outputs to be declared apart from inputs; here the cheap
 *     equivalent is to name the generated directories and skip them.
 */
const GENERATED_DIRS = new Set([
  "build",
  "build-aclpubcheck",
  "dist",
  "out",
  "artifact-anon",
]);

function newestSourceDate(dir) {
  const sources = [];
  const walk = (d, depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (
        e.name.startsWith(".") ||
        e.name === "node_modules" ||
        e.name === "repro"
      )
        continue;
      if (e.isDirectory() && GENERATED_DIRS.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (SOURCE_RE.test(p)) sources.push(p);
    }
  };
  walk(dir, 0);
  if (!sources.length) return null;

  let newest = "";
  for (const p of sources) {
    let when; // no initializer: both branches below assign it (2026-08-28)
    try {
      // Dirty file: the edit is real and uncommitted, so mtime is the honest answer.
      const dirty = execFileSync("git", ["status", "--porcelain", "--", p], {
        encoding: "utf8",
      }).trim();
      // 🔴 EMPTY OUTPUT FROM `git log` IS NOT A DATE. The command exits 0 and prints NOTHING when
      // a path has no history: a shallow clone (`actions/checkout` defaults to `fetch-depth: 1`), a
      // file outside git, a file inside `node_modules`. Previously that empty value went on as
      // `when`, the whole `newestSourceDate` returned "", and `stale-continuous` together with
      // `stale-cold-read` silently stopped firing — that is, the staleness check went stale itself
      // without a single word.
      //
      // Measured 14.09: the `fixtures/dirty` fixture lives inside this package, and at the consumer
      // it sits under `node_modules`. Locally `git log` returned 2026-09-12 — the date of the
      // commit THAT DELETED THIS PATH from the consumer's tree, that is, the check rested on a
      // ghost of history. In CI with a shallow clone there is no ghost, the output is empty, and
      // the harness failed on "pipeline-check reports stale-continuous on the dirty fixture" (run
      // 34784079821).
      const logged = dirty
        ? ""
        : execFileSync("git", ["log", "-1", "--format=%cs", "--", p], {
            encoding: "utf8",
          }).trim();
      when = logged || new Date(statSync(p).mtimeMs).toISOString().slice(0, 10);
    } catch {
      when = new Date(statSync(p).mtimeMs).toISOString().slice(0, 10); // no git here: fall back
    }
    if (when > newest) newest = when;
  }
  return newest || null;
}

// ── checks ───────────────────────────────────────────────────────────────────

const byId = (sections) => {
  const m = new Map();
  for (const rows of Object.values(sections))
    for (const r of rows) m.set(r.id, r);
  return m;
};

export function check({ sections, header }, { sourceDate, today, dir }) {
  const out = [];
  const all = byId(sections);
  const add = (kind, msg) => out.push({ kind, msg });

  // 1. A CONTINUOUS check that passed on text older than the current text.
  for (const r of sections.CONTINUOUS ?? []) {
    if (!DONE.has(r.status)) continue;
    // `undated-continuous` (a ☑ with no date) moved into the rule `pipeline/undated-continuous`.
    // What stays here is exactly the half of the loop that needs an input from OUTSIDE the file —
    // the date of the last commit that touched the paper's text.
    if (!r.date) continue;
    if (sourceDate && r.date < sourceDate) {
      add(
        "stale-continuous",
        `${r.id} (${r.skill}) last ran ${r.date}, the text changed ${sourceDate} — this ☑ is stale, not green`,
      );
    }
  }

  // ── MOVED 2026-08-26 into `eslint-rules/pipeline-status.mjs` ─────────────────────────────
  // The five blocks that stood here read ONLY this document and therefore moved into ESLint rules
  // in full, together with their comments and history:
  //   2.      a gate with no declared input  → `pipeline/gate-inputs` (+ `pipeline/unknown-input`)
  //   2a-bis. who cleared it and is it one family → `pipeline/judge-recorded`
  //   2b.     a short Requires cell          → `pipeline/undeclared-input`
  //   3.      study ☑ while frame ☐          → `pipeline/study-before-frame`
  // They must not be duplicated here: two sources of truth about one fact drift apart.

  // 4. Can you physically submit, with enough time for someone else's queue?
  const ac = all.get("access");
  const deadline = deadlineOf(header);
  if (ac && !DONE.has(ac.status)) {
    if (deadline && today) {
      const days = Math.round(
        (Date.parse(deadline) - Date.parse(today)) / 86_400_000,
      );
      if (days <= MODERATION_WINDOW_DAYS) {
        add(
          "submit-access",
          `access (can you physically submit?) is ${ac.status || "blank"} with ${days} day(s) to the deadline — profile moderation runs up to two weeks and there is no expedite route without an institutional email`,
        );
      }
    } else {
      add(
        "submit-access",
        `access (can you physically submit?) is ${ac.status || "blank"} — turn it green in the first week, not the last`,
      );
    }
  }

  // ── MOVED 2026-08-26 into `eslint-rules/pipeline-status.mjs` ─────────────────────────────
  //   5.  a verdict exists and is not just a number → `pipeline/verdict-present` +
  //                                                   `pipeline/scalar-verdict`
  //   5b. Weak Accept with no recorded decision     → `pipeline/weak-accept-unowned`
  //   5b. a ceiling with no classification of bars  → `pipeline/ceiling-unplanned`
  //   6.  ☐ gates                                   → `pipeline/unrun-gate`

  // 6b. The same section named worst, pass after pass, with nothing done about it.
  //
  // The trigger was the reaction of the person who opened the first page of the built PDF
  // (2026-08-05): the complaint was not about the content but about READABILITY, and it sounded
  // like "what is wrong with our writing rules for papers — they are never called at all". The
  // verbatim wording was removed when the pipeline was extracted; it is in the history of the
  // private knowledge base. The answer to it: the rules WERE called. `grade-paper-writing` ran five times
  // and named the abstract its worst section every single time; the finding was faithfully recorded
  // in the scorecard on all five occasions and was never once the next task. Recording is not
  // owning. A review loop that only appends findings converges on a paper whose defects are all
  // thoroughly documented and none of them fixed — the loop needs a ratchet, and this is it.
  //
  // Deliberately dumb: count how many of the most recent reports name the same worst section. Two
  // in a row is a nudge, three is a process failure, and no amount of prose in a skill file
  // substitutes for the count.
  const worst = dir ? recentWorstSections(dir) : [];
  if (worst.length >= 2 && new Set(worst).size === 1) {
    add(
      "repeat-finding",
      `"${worst[0]}" has been the worst-rated section in the last ${worst.length} writing passes and is still the worst — a finding recorded ${worst.length} times without becoming a task is a process failure, not a known issue. Fix it or record why it is being shipped as is.`,
    );
  }

  // 6c. Nobody who does not already know the paper has read the current text.
  //
  // This is the check that would have caught every readability defect found by eye on
  // 2026-08-05, and NONE of them were visible to anything else we run. Sentence length, number
  // density, tic frequency — all proxies, all green on sentences that turned out to mean nothing.
  // The failure they cannot see is a sentence compressed until it only parses for someone who
  // already holds the idea, and the author holds the idea by definition.
  //
  // So the gate is not another metric. It is a person-shaped reader with no context, and the only
  // mechanical part is whether one has looked at THIS text: a cold-read report older than the
  // current paper describes prose that no longer exists.
  if (dir) {
    // 🔴 `cold-?read`, not `cold-read`. Measured 2026-08-24: this check reported "nobody without
    // context has read this text" about a paper that had been cold-read TWICE that day, because the
    // report was filed as `2026-08-24-coldread-worksheet.md` and the pattern only knew the hyphen.
    //
    // Not a typo on either side — BOTH spellings are load-bearing in this repo and always will be:
    // the skill is `cold-read-diff` (88 files) while the scorecard row id, in the very file this
    // checker parses, is `coldread` (15 files). A gate keyed to one of two live spellings is
    // guaranteed to miss, and its failure mode is the worst one available: it announces a hole
    // where none exists, which is how a gate stops being read before a real hole walks past it.
    const cr = newestReviewDate(dir, /cold-?read/i);
    if (cr === undefined) {
      // No reviews/ at all: this project does not use the convention. Silence is correct, and the
      // harness asserts it — the first version of this check treated "no folder" and "no report"
      // alike and fired on every clean fixture.
    } else if (cr === null) {
      add(
        "no-cold-read",
        "no cold-read report in reviews/ — nobody without context has read this text, and a compressed sentence only fails for a reader who does not already know the idea",
      );
    } else if (sourceDate && cr < sourceDate) {
      add(
        "stale-cold-read",
        `the cold read ran ${cr}, the text changed ${sourceDate} — it describes prose that no longer exists`,
      );
    }
  }

  // 7. A blocker parked on the author that the environment can already clear.
  //
  // The trigger was a remark by the repository owner (2026-08-05): the agent forgets over and over
  // that it can upload the artifact ITSELF, although it has access to the variable it needs. The
  // verbatim wording was removed when the pipeline was extracted; it is in the history of the
  // private knowledge base.
  //
  // Artifact hosting sat on the human's side of the owner-split for a day and a half; the
  // credential that clears it was in the environment the whole time. The owner-split is the most
  // useful line in a status report and also the easiest to get wrong in the expensive direction —
  // an item wrongly assigned to the human is pure schedule loss, so the check runs against the
  // environment rather than against the agent's memory of what it can reach.
  for (const [envVar, what] of Object.entries(CREDENTIALS)) {
    if (!process.env[envVar]) continue;
    // `done` is checked against the row TEXT, not the row's status box: a multi-axis gate like
    // harden stays ⚠ for reasons that have nothing to do with this credential, and firing on its
    // status would mean nagging about an upload that already happened.
    const row = [...all.values()].find(
      (r) =>
        what.re.test(r.raw ?? "") &&
        !DONE.has(r.status) &&
        !what.done.test(r.raw ?? ""),
    );
    if (row) {
      add(
        "credential-available",
        `${row.id} (${what.label}) is parked as open, but ${envVar} is set in this environment — ${what.action}. Do not report this as waiting on the human.`,
      );
    }
  }

  return out;
}

/**
 * ISO date of the newest report in reviews/ whose filename matches.
 * `undefined` means this project has no reviews/ at all and is not using the convention —
 * distinct from `null`, which means it does and nothing has matched. Collapsing the two made the
 * cold-read check fire on every paper without a review folder, including the clean test fixture;
 * the harness caught it on the first run after the check was added.
 */
function newestReviewDate(dir, re) {
  const rd = join(dir, "reviews");
  if (!existsSync(rd)) return undefined;
  let newest = 0;
  try {
    for (const f of readdirSync(rd)) {
      if (!re.test(f) || !f.endsWith(".md")) continue;
      newest = Math.max(newest, statSync(join(rd, f)).mtimeMs);
    }
  } catch {
    return null;
  }
  return newest ? new Date(newest).toISOString().slice(0, 10) : null;
}

/**
 * The worst-rated section from each of the most recent writing passes, newest first.
 *
 * Reads the `WORST-SECTION: <name>` marker that grade-paper-writing is required to put on the
 * first line of its report. A report without the marker is skipped rather than guessed at — a
 * wrong guess here would either invent a repeat or hide one, and both are worse than silence.
 */
function recentWorstSections(dir, limit = 4) {
  const rd = join(dir, "reviews");
  if (!existsSync(rd)) return [];
  let files;
  try {
    files = readdirSync(rd).filter(
      (f) => /grade-paper-writing|writing/i.test(f) && f.endsWith(".md"),
    );
  } catch {
    return [];
  }
  return files
    .map((f) => ({ f, m: statSync(join(rd, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, limit)
    .map(({ f }) => {
      try {
        const m = readFileSync(join(rd, f), "utf8").match(
          /^\s*WORST-SECTION:\s*(.+)$/m,
        );
        return m ? m[1].trim().toLowerCase() : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Credentials the session may hold, and the blocker each one un-parks. */
const CREDENTIALS = {
  OSF_TOKEN: {
    label: "artifact hosting",
    re: /artifact|host|upload|anonym\w* (link|url)|osf/i,
    done: /osf\.io\/\w+|захостен|hosted (on|at)\b/i,
    action:
      "upload the anonymised bundle over the OSF API and paste the view-only URL yourself",
  },
  GITHUB_TOKEN: {
    label: "repository work",
    re: /release|tag|github|repo(sitory)? (link|url)/i,
    done: /github\.com\/[\w.-]+\/[\w.-]+\/(releases|tree)\//i,
    action: "do it over the API yourself",
  },
};

// ── cli ──────────────────────────────────────────────────────────────────────

function main(argv) {
  const args = argv.slice(2);
  const dir = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
  const asJson = args.includes("--json");
  const todayArg = (args.find((a) => a.startsWith("--today=")) ?? "").split(
    "=",
  )[1];
  const today = todayArg || new Date().toISOString().slice(0, 10);

  const statusPath = join(dir, "PIPELINE-STATUS.md");
  if (!existsSync(statusPath)) return 0; // no scorecard → nothing to say

  const parsed = parseStatus(readFileSync(statusPath, "utf8"));
  const known = ["SETUP", "LOOP", "CONTINUOUS", "GATES"].filter(
    (s) => parsed.sections[s]?.length,
  );
  if (known.length < 4) {
    // Say WHAT was found, not only what was missing. `<paper-c>` and `<paper-b>` predate the
    // four-section template: one table, first column `#`, no section headings anywhere. Under the
    // old message ("found [none]") that was indistinguishable from a typo in a current scorecard,
    // and the two cases want opposite responses — migrate the format vs fix the heading.
    const { tables, scorecardTables, headings } = parsed.shape;
    const legacy = scorecardTables === 0 && tables > 0;
    console.error(
      `⚠️ ${statusPath}: expected the four sections SETUP/LOOP/CONTINUOUS/GATES, found [${known.join(", ") || "none"}].\n` +
        `   Parsed ${tables} table(s), ${scorecardTables} of them with an id column; headings: ${headings.length ? headings.map((h) => `"${h.slice(0, 40)}"`).join(", ") : "none"}.\n` +
        (legacy
          ? "   No table has an id column — this is the pre-2026-08 single-table format (first column `#`, a row number).\n" +
            "   It does NOT parse and will not be made to: `#` cannot key the edges gates declare, and there are no\n" +
            "   sections to attribute rows to. Migrate it to the template, or leave it as a submitted paper's record.\n"
          : "") +
        "   The template is a format contract — see paper-pipeline/references/pipeline-status-template.md.\n" +
        "   Until it parses, these checks are silent, which is the failure mode they exist to prevent.",
    );
    return 0;
  }

  const findings = check(parsed, {
    sourceDate: newestSourceDate(dir),
    today,
    dir,
  });
  if (asJson) {
    console.log(JSON.stringify(findings, null, 2));
    return 0;
  }

  // The banner prints even with zero findings, and that is the point.
  //
  // A remark by the repository owner, 2026-08-05: the human has to keep asking for the paper's
  // status and steering the agent by hand. (The verbatim quote was removed on extraction; it is in
  // the history of the knowledge base.)
  // The asking happened because nothing volunteered the state. A checker that is silent when clean
  // trains the session to treat silence as "no state to report", so the state only ever surfaces
  // when a human pulls it — which is exactly the work being complained about. Findings are advisory; the
  // banner is unconditional, so every edit to a paper reprints where the paper stands and what
  // the next move is, without anyone asking.
  const dl = deadlineOf(parsed.header);
  const days = dl
    ? Math.round((Date.parse(dl) - Date.parse(today)) / 86_400_000)
    : null;
  const when = dl
    ? `${dl} (T${days >= 0 ? "−" : "+"}${Math.abs(days)}d)`
    : "deadline not in the header";
  const name = dir.split("/").filter(Boolean).pop();

  console.log(`📊 ${name} — ${when} · ${findings.length} open finding(s)`);
  console.log(
    `   verdict row: ${parsed.verdict ? parsed.verdict.replace(/^\*\*Readiness verdict:\*\*\s*/, "").slice(0, 160) : "(none)"}`,
  );
  console.log(
    `   ➡️ NEXT: ${findings.length ? findings[0].msg.slice(0, 200) : "no mechanical blocker — run paper-status for the measured picture (build page count, stale gates, owner-split) before deciding it is done"}`,
  );
  console.log(
    "   (page count comes from repro/build-submission.sh, never from this line)",
  );

  if (!findings.length) return 0;
  console.log(
    `⚠️ pipeline-check — ${findings.length} finding(s) in ${statusPath}:`,
  );
  for (const f of findings) console.log(`   [${f.kind}] ${f.msg}`);
  return 0;
}

if (isMain(import.meta.url))
  process.exit(main(process.argv));
