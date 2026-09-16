/**
 * `paper/typography` — four MECHANICAL conventions a reviewer already complained about,
 * counted against a declared debt so that a legacy paper does not drown the new finding.
 *
 * ── PROVENANCE: every one is a real review finding, not an invented style ───────────────
 * From HotCRP #20 (2026-08-23). Reviewer B listed three as literal to-dos, Reviewer A the
 * fourth:
 *   B#11  "§ -> Section"                   one paper in the source corpus carried 246
 *   B#12  ".05 -> 0.05"                    one instance survived a declared fix
 *   A#2   "not every entry has a DOI/link" one paper: 0 of 47 entries reachable
 *   (own) `Fig.` and `Figure` side by side
 *
 * ── RATCHET, and it is the load-bearing part ───────────────────────────────────────────
 * 🔴 A check that reports 246 findings on its first run is a check that gets muted, and the
 * next REAL instance then hides among the old ones. The consumer's repo has already killed a
 * check exactly that way. So the rule takes a `debt` option — what each paper owes today —
 * and speaks only when a paper is ABSENT from it (a new paper owes nothing) or when its count
 * GREW. Lowering a count is free and silently re-baselines.
 *
 * The debt itself is DATA about one corpus, so it does not live here: the consumer passes it
 * in options. The mechanism is general, the numbers are not.
 *
 * ── WHY THIS READS `sourceCode.raw` AND NOT THE PROSE PROJECTION ───────────────────────
 * Every one of the four counts is about MARKUP. The projection blanks macros — that is its
 * purpose, it is what lets thirty prose rules read LaTeX without knowing LaTeX — so
 * `\S\ref{}` and `Fig.~\ref{}` reach a normal rule as spaces. Offsets coincide between the
 * two (blanking preserves length), so scanning `raw` and reporting the offset found there
 * still points at the right byte.
 */
import { relative, dirname } from "node:path";

/**
 * The inline bibliography is counted differently from the prose, and in this corpus it lives
 * INSIDE the `.tex` in a `filecontents` environment rather than in a separate `.bib`.
 */
function splitPaperText(text) {
  const m = text.match(
    /\\begin\{filecontents\*?\}(?:\[[^\]]*\])?\{[^}]*\.bib\}\r?\n([\s\S]*?)\\end\{filecontents\*?\}/,
  );
  return m ? { body: text.replace(m[0], ""), bib: m[1] } : { body: text, bib: "" };
}

function typographyCounts(text) {
  const { body, bib } = splitPaperText(text);

  // 🔴 BOTH forms, and the second one is why this check was ever wrong. The first version
  // counted only the literal `§` and returned ZERO on the very paper whose reviewer raised it:
  // the source writes `\S\ref{sec:threats}`, which RENDERS as `§5`. Measured on the held-out
  // submitted build: source hits 0, rendered PDF hits 10. A source-level check calibrated
  // against a rendered complaint reports clean on the exact defect it was written for.
  const sectionSign =
    (body.match(/§/g) || []).length + (body.match(/\\S(?=\s*\\ref|~\\ref|\d)/g) || []).length;

  // A decimal with no leading zero. The lookbehind keeps arXiv ids (2310.05736) out — there
  // the dot is preceded by a digit.
  const bareDecimal = (body.match(/(?<![\d.\w])\.\d{2,}\b/g) || []).length;

  // Mixed `Fig.~\ref` and `Figure~\ref` in ONE document. Consistent use of either is fine, so
  // this counts only when both appear; an absolute rule here would be taste, not a defect.
  const figShort = (body.match(/\bFig\.~?\\(?:ref|autoref)/g) || []).length;
  const figLong = (body.match(/\bFigure~?\\(?:ref|autoref)/g) || []).length;
  const figMixed = figShort > 0 && figLong > 0 ? Math.min(figShort, figLong) : 0;

  // A bibliography entry a reader cannot follow: no doi, no url, no arXiv id.
  // ⚠️ NOT "no doi". Measured 2026-08-24: ICLR/NeurIPS/TMLR issue no DOIs at all, so a
  // doi-only rule would demand something that does not exist and get muted for lying.
  let unreachable = 0;
  for (const e of bib.split(/^@/m).slice(1)) {
    if (!/\b(doi|url)\s*=/.test(e) && !/arxiv[:\s]*\d{4}\.\d{4,5}/i.test(e)) unreachable++;
  }
  return { sectionSign, bareDecimal, figMixed, unreachable };
}

const LABEL = {
  sectionSign: "`§` instead of «Section» (reviewer B)",
  bareDecimal: "a decimal without a leading zero, `.05` instead of `0.05` (reviewer B)",
  figMixed: "`Fig.` and `Figure` mixed in one document",
  unreachable: "bibliography entries with no doi/url/arXiv id — a reader has nothing to follow (reviewer A)",
};

export default {
  rules: {
    typography: {
      meta: {
        type: "suggestion",
        docs: {
          description:
            "mechanical conventions a reviewer already raised, counted against a declared debt: silent on what was already there, loud on what grew",
        },
        schema: [
          {
            type: "object",
            properties: {
              // { "<путь к каталогу статьи от корня>": { sectionSign: 54, unreachable: 18 } }
              debt: { type: "object", additionalProperties: true },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          grew: "{{n}} × {{label}}{{grew}}. Paying the debt down is silent; growth is reported",
        },
      },
      create(context) {
        const debt = context.options[0]?.debt ?? {};
        return {
          "root:exit"(node) {
            // `raw` on the LaTeX language, `text` everywhere else. A paper in this corpus may be
            // written in markdown rather than LaTeX, and three of the four counts apply there
            // unchanged; only the macro spellings never match, which is correct rather than a
            // gap. Measured 2026-09-16: the check this rule replaces silently covered a markdown
            // paper carrying 246 section signs, so a `.tex`-only rule would have LOST it.
            const raw = context.sourceCode.raw ?? context.sourceCode.text;
            if (typeof raw !== "string") return;
            const counts = typographyCounts(raw);
            const key = relative(context.cwd, dirname(context.filename));
            const owed = debt[key] ?? {};
            for (const [field, n] of Object.entries(counts)) {
              if (n === 0) continue;
              const before = owed[field] ?? 0;
              if (n <= before) continue; // known debt, unchanged or paid down
              context.report({
                node,
                messageId: "grew",
                data: {
                  n: String(n),
                  label: LABEL[field],
                  grew: before > 0 ? ` (was ${String(before)}, now ${String(n)})` : "",
                },
              });
            }
          },
        };
      },
    },
  },
};
