/**
 * pdf/last-page-balance — the two columns of a paper's last page end at about the same height.
 *
 * OPTIONAL, OFF BY DEFAULT. Balance is a requirement of SOME venues, not of papers: some ACM
 * production vendors return a camera-ready for it (Conference Publishing Consulting, which produces
 * ICSE/ASE/SIGSOFT/SIGPLAN proceedings; Sheridan for ACM SIG conferences such as CCS), IEEEtran
 * advises it for camera-ready work, and ACL, USENIX, AAAI and ICML say nothing. No standard format
 * checker (HotCRP's banal, aclpubcheck, IEEE PDF eXpress) tests it. So a consumer turns it on for
 * the papers whose venue asks, in package.json:
 *
 *   "research-paper-pipeline": { "rules": [ { "files": ["papers/my-paper/**"],
 *     "rules": { "pdf/last-page-balance": ["error", { "tolerancePt": 120 }] } } ] }
 *
 * (That is a line comment's worth of JSON in a block comment only because it has no asterisk
 * followed by a slash; see rule 8 of CLAUDE.md before editing it.)
 *
 * ── WHAT IT READS: THE FACTS THE BUILD WROTE, NOT THE PDF ───────────────────────
 * `rpp build` measures the PDF with pdf.js and writes `<paper>/_build/paper.facts.json`. This rule
 * runs on `paper.tex` — the one file every LaTeX paper has, and the one ESLint already parses — and
 * judges that paper's facts file beside it. It never opens the PDF to measure it: it hashes it, to
 * refuse facts about a different build than the one on disk.
 *
 * ── IT DOES NOT FIX, AND SAYS HOW TO ────────────────────────────────────────────
 * rpp used to search for a `\balance` position itself and fail the build when none worked. Every
 * mechanism is documented as unreliable by its own authors (acmart: `balance` "may lead to
 * problems", `pbalance` is "experimental"; pbalance: "this package is a hack"), and for ACM TAPS
 * venues ACM recompiles the source, so an edit to a generated `.bbl` may never reach the proceedings.
 * The message names the manual fixes the vendor itself lists, in its order.
 *
 * Silent, by design, where there is nothing to judge: a stub last page (a few lines) and a review
 * build (numbered lines in the margins make both columns measure full height). Loud where the input
 * is missing: no facts file, a foreign schema, facts about a PDF that is not on disk or changed
 * since — a rule that is on and reads nothing must not look like a rule that passed.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";

/** The difference, in points, that two columns may end apart. See the harness for why 120. */
export const DEFAULT_TOLERANCE_PT = 120;
/** The schema of `paper.facts.json` this rule reads (`src/facts-file.ts`, FACTS_SCHEMA). */
export const FACTS_SCHEMA = 2;
export const FACTS_REL = join("_build", "paper.facts.json");

const isHeight = (x) => typeof x === "number" && Number.isFinite(x);

/** The `last_page` field, parsed. */
function lastPageOf(v) {
  if (v?.kind === "stub" || v?.kind === "review") return { kind: v.kind };
  const c = v?.columns_pt;
  if (
    v?.kind === "measured" &&
    Array.isArray(c) &&
    c.length === 2 &&
    c.every(isHeight)
  )
    return { kind: "measured", left: c[0], right: c[1] };
  return null;
}

/**
 * The facts file's text → what this rule needs, or the reason it cannot be judged. Pure.
 *
 * @returns {{ ok: true, pdf: string, sha: string, last: object } | { ok: false, messageId: string, data: object }}
 */
export function parseFacts(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch (e) {
    return { ok: false, messageId: "factsBroken", data: { why: e.message } };
  }
  if (d?.schema !== FACTS_SCHEMA)
    return {
      ok: false,
      messageId: "schema",
      data: { got: JSON.stringify(d?.schema ?? null) },
    };
  const last = lastPageOf(d.last_page);
  if (
    typeof d.pdf !== "string" ||
    !/^[0-9a-f]{64}$/.test(d.pdf_sha256 ?? "") ||
    !last
  )
    return {
      ok: false,
      messageId: "factsBroken",
      data: {
        why: "no `pdf`, `pdf_sha256` or `last_page` in the expected shape",
      },
    };
  return { ok: true, pdf: d.pdf, sha: d.pdf_sha256, last };
}

/** Whether the facts describe the PDF on disk: null when they do, else the reason. */
function staleness(paperDir, facts) {
  const pdf = isAbsolute(facts.pdf) ? facts.pdf : join(paperDir, facts.pdf);
  let got;
  try {
    got = createHash("sha256").update(readFileSync(pdf)).digest("hex");
  } catch {
    return { messageId: "pdfMissing", data: { pdf: facts.pdf } };
  }
  return got === facts.sha
    ? null
    : { messageId: "stale", data: { pdf: facts.pdf } };
}

/** The finding for a measured page, or null when it is balanced. Pure. */
export function judgeColumns(last, tolerancePt) {
  if (last.kind !== "measured") return null;
  const diff = Math.abs(last.left - last.right);
  if (diff <= tolerancePt) return null;
  return {
    messageId: "unbalanced",
    data: {
      left: last.left.toFixed(1),
      right: last.right.toFixed(1),
      diff: diff.toFixed(1),
      tol: String(tolerancePt),
    },
  };
}

/** Where a finding goes: the `\documentclass` line, where the class options that fix it live. */
function reportLine(file) {
  try {
    const lines = readFileSync(file, "utf8").split("\n");
    const i = lines.findIndex((l) => /^\s*\\documentclass\b/.test(l));
    return i >= 0 ? i + 1 : 1;
  } catch {
    return 1;
  }
}

/** Everything the rule decides for one paper, as a finding or null. */
function verdict(paperDir, tolerancePt) {
  const factsFile = join(paperDir, FACTS_REL);
  if (!existsSync(factsFile))
    return { messageId: "noFacts", data: { file: FACTS_REL } };
  const facts = parseFacts(readFileSync(factsFile, "utf8"));
  if (!facts.ok) return { messageId: facts.messageId, data: facts.data };
  return staleness(paperDir, facts) ?? judgeColumns(facts.last, tolerancePt);
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "the last page's two columns end at about the same height (optional; for venues that require it)",
    },
    schema: [
      {
        type: "object",
        properties: {
          tolerancePt: { type: "number", exclusiveMinimum: 0 },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unbalanced:
        "the last page is unbalanced: its columns end at {{left}} and {{right}} pt, {{diff}} pt " +
        "apart (tolerance {{tol}} pt). Some ACM production vendors send such a camera-ready back. " +
        "Conference Publishing Consulting's advice, in its order: \"For the ACMART style, use " +
        "option 'balance' or, if this does not work, option 'pbalance'\" — acmart already has " +
        "`balance` on by default, and it calls \\balance from the second column, where it does " +
        "nothing when the last page is all bibliography, so try `pbalance`; then " +
        "`\\usepackage{flushend}`; then `\\balance` (balance.sty) placed in what would be the " +
        "FIRST column of the last page — in the bibliography, before the \\bibitem that starts " +
        "that column. Rebuild (`rpp build`) and lint again.",
      noFacts:
        "pdf/last-page-balance is on for this paper, but {{file}} does not exist beside it. The rule " +
        "judges the facts `rpp build` writes after a successful compile — build the paper first.",
      factsBroken:
        "{{why}} in _build/paper.facts.json — rebuild the paper (`rpp build`) to rewrite it",
      schema:
        "_build/paper.facts.json has schema {{got}}; this rule reads schema 2 — rebuild the paper " +
        "(`rpp build`) to rewrite it",
      pdfMissing:
        "_build/paper.facts.json describes {{pdf}}, which is not on disk (a failed build removes " +
        "it) — rebuild the paper",
      stale:
        "_build/paper.facts.json describes a DIFFERENT {{pdf}} than the one on disk (its SHA-256 " +
        "differs), so judging it would judge an earlier build — rebuild the paper",
    },
  },
  create(context) {
    // Judged once per paper, on its paper.tex: the paper directory is the file's directory.
    if (basename(context.filename) !== "paper.tex") return {};
    const tolerancePt = context.options[0]?.tolerancePt ?? DEFAULT_TOLERANCE_PT;
    return {
      root() {
        const v = verdict(dirname(context.filename), tolerancePt);
        if (!v) return;
        const line = reportLine(context.filename);
        context.report({
          loc: { start: { line, column: 1 }, end: { line, column: 2 } },
          messageId: v.messageId,
          data: v.data,
        });
      },
    };
  },
};

export default { rules: { "last-page-balance": rule } };
