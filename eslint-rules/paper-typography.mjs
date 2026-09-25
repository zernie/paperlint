/**
 * `paper/typography` — four MECHANICAL conventions a reviewer already complained about,
 * counted against a declared debt so that a legacy paper does not drown the new finding.
 *
 * ── PROVENANCE: every one is a real review finding, not an invented style ───────────────
 * From HotCRP #20 (2026-08-23). Reviewer B listed three as literal to-dos, Reviewer A the
 * fourth:
 *   B#11  "§ -> Section"                   one paper in the source corpus carried 246
 *   B#12  ".05 -> 0.05"                    four in the submitted text, fixed by hand
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
 * ── WHY THREE COUNTS READ `sourceCode.raw` AND NOT THE PROSE PROJECTION ────────────────
 * `sectionSign`, `figMixed` and `unreachable` are about MARKUP. The projection blanks macros —
 * that is its purpose, it is what lets thirty prose rules read LaTeX without knowing LaTeX — so
 * `\S\ref{}` and `Fig.~\ref{}` reach a normal rule as spaces. Offsets coincide between the
 * two (blanking preserves length), so scanning `raw` and reporting the offset found there
 * still points at the right byte.
 *
 * ── WHY `bareDecimal` READS NEITHER, BUT THE PARSED TREE (paperlint#44) ─────────────────────────
 * Origin. On a workshop paper (HotCRP #20) Reviewer B wrote: `Numbers should be completed:
 * e.g. ".05" -> 0.05`. The submitted PDF really carried `p < .05`, `p=.002`, `p=.006` and
 * `p=.037` in its text (measured with pdftotext on the submitted version); the camera-ready
 * fixed them by hand.
 *
 * The convention. ISO 80000-1 ("the decimal sign shall be preceded by a zero" for magnitudes
 * below 1) and the IEEE Editorial Style Manual ("0.25, not .25") require the zero. Other styles
 * (APA, AMA) drop it for p-values. The rule measures against IEEE/ISO, because that is what the
 * venues this package targets expect.
 *
 * Why parsed, not raw. The count used to be one regex over the raw source. An independent
 * review ran it on every real input available: 22 findings on the current corpus, 0 true
 * positives. That is survivorship — the real cases had been fixed by hand — and synthetic LaTeX
 * showed where the 22 come from: the regex fires on `[width=.48\columnwidth]`,
 * `p{.25\linewidth}`, comments, code listings and tikz coordinates. The projection is no
 * answer either: it blanks math (where p-values live) and whole tables (where they are
 * reported). So this count walks the TREE and keeps only what the reader sees as a number:
 *   LaTeX     prose, inline and display math, table cells, and the text arguments of a known
 *             set of text macros (`\emph`, `\caption`, `\footnote`, headings…). Not: any other
 *             macro's arguments, environment arguments (column specs, widths), comments,
 *             verbatim/listings/`\lstinline`, tikz, the preamble, the inline bibliography.
 *   Markdown  text nodes, table cells included. Not: code, inline code, html, front matter.
 * Only then is the lexeme matched, one run of visible text at a time. The arXiv lookbehind
 * stays: in `2310.05736` the dot follows a digit.
 *
 * What still gets through. A decimal inside a quotation, or a paragraph number such as
 * `¶¶.42`, is prose to the parser and is counted. The per-paper debt below absorbs known cases.
 * And the other direction, chosen on purpose: a text macro outside the known set (`\hl{.05}`, an
 * author's `\pval{.05}`) is read as a parameter and NOT counted — for a warning that people
 * learn to mute, a miss costs less than a finding on markup.
 */
import { relative, dirname } from "node:path";
import { getParser } from "@unified-latex/unified-latex-util-parse";

/**
 * The inline bibliography is counted differently from the prose, and in this corpus it lives
 * INSIDE the `.tex` in a `filecontents` environment rather than in a separate `.bib`.
 */
function splitPaperText(text) {
  const m = text.match(
    /\\begin\{filecontents\*?\}(?:\[[^\]]*\])?\{[^}]*\.bib\}\r?\n([\s\S]*?)\\end\{filecontents\*?\}/,
  );
  return m
    ? { body: text.replace(m[0], ""), bib: m[1] }
    : { body: text, bib: "" };
}

function typographyCounts(text, bareDecimal) {
  const { body, bib } = splitPaperText(text);

  // 🔴 BOTH forms, and the second one is why this check was ever wrong. The first version
  // counted only the literal `§` and returned ZERO on the very paper whose reviewer raised it:
  // the source writes `\S\ref{sec:threats}`, which RENDERS as `§5`. Measured on the held-out
  // submitted build: source hits 0, rendered PDF hits 10. A source-level check calibrated
  // against a rendered complaint reports clean on the exact defect it was written for.
  const sectionSign =
    (body.match(/§/g) || []).length +
    (body.match(/\\S(?=\s*\\ref|~\\ref|\d)/g) || []).length;

  // Mixed `Fig.~\ref` and `Figure~\ref` in ONE document. Consistent use of either is fine, so
  // this counts only when both appear; an absolute rule here would be taste, not a defect.
  const figShort = (body.match(/\bFig\.~?\\(?:ref|autoref)/g) || []).length;
  const figLong = (body.match(/\bFigure~?\\(?:ref|autoref)/g) || []).length;
  const figMixed =
    figShort > 0 && figLong > 0 ? Math.min(figShort, figLong) : 0;

  // A bibliography entry a reader cannot follow: no doi, no url, no arXiv id.
  // ⚠️ NOT "no doi". Measured 2026-08-24: ICLR/NeurIPS/TMLR issue no DOIs at all, so a
  // doi-only rule would demand something that does not exist and get muted for lying.
  let unreachable = 0;
  for (const e of bib.split(/^@/m).slice(1)) {
    if (!/\b(doi|url)\s*=/.test(e) && !/arxiv[:\s]*\d{4}\.\d{4,5}/i.test(e))
      unreachable++;
  }
  return { sectionSign, bareDecimal, figMixed, unreachable };
}

// ── bareDecimal: the text a READER sees, taken from the tree ─────────────────────────────

// The lexeme, matched inside ONE run of visible text — never over the source. The lookbehind
// keeps arXiv ids (2310.05736) out: there the dot follows a digit.
const BARE_DECIMAL = /(?<![\d.\w])\.\d{2,}\b/g;
const countBareDecimals = (runs) =>
  runs.reduce((n, run) => n + (run.match(BARE_DECIMAL) || []).length, 0);

// Environments whose body is not typeset as text: code, drawings, the inline bibliography.
const TEX_HIDDEN_ENV =
  /^(verbatim|Verbatim|lstlisting|minted|tikzpicture|filecontents\*?|comment)$/;
// Text macros whose mandatory argument IS prose. Every other macro's arguments are parameters
// (`\includegraphics[width=…]`, `\hspace{…}`, `\label{…}`) and are not read.
const TEX_PROSE_ARG =
  /^(emph|textbf|textit|textsl|textsc|textup|textmd|textrm|textsf|textnormal|underline|text|mbox|caption|footnote|footnotetext|thanks|title|textsuperscript|textsubscript|part|chapter|section|subsection|subsubsection|paragraph|subparagraph)$/;
// Macros whose LAST mandatory argument is what the reader sees: a table cell, coloured text,
// a link's text.
const TEX_LAST_ARG = /^(multicolumn|multirow|textcolor|href)$/;
// In math every macro argument is typeset (`\frac{.05}{2}`, `\sqrt{…}`) except these.
const TEX_MATH_HIDDEN =
  /^(label|ref|eqref|autoref|cite|hspace|vspace|hskip|vskip|kern|mkern|mskip|rule|phantom|hphantom|vphantom|color|raisebox|includegraphics)$/;

const mandatory = (macro) =>
  (macro.args || []).filter((a) => a.openMark === "{");

/**
 * unified-latex attaches arguments only to what it has a signature for. For the rest — `\def\x`,
 * an author's `\foo[width=.48]{…}`, `\begin{subfigure}{.48\textwidth}`, the column spec of
 * `longtable` — the arguments come back as the NEXT SIBLINGS: an optional `[…]` as bare strings,
 * then groups. They are parameters, not prose. Returns the index of the last sibling to skip,
 * starting after `i`; nothing is skipped past whitespace, and an unclosed `[` skips nothing.
 */
function unparsedArgsEnd(nodes, i) {
  let j = i + 1;
  if (nodes[j]?.type === "string" && nodes[j].content.startsWith("[")) {
    let k = j;
    while (
      k < nodes.length &&
      !(nodes[k].type === "string" && nodes[k].content.endsWith("]"))
    )
      k++;
    if (k < nodes.length) j = k + 1;
  }
  while (nodes[j]?.type === "group") j++;
  return j - 1;
}

/**
 * Collect runs of visible text from a unified-latex node list. A run is a stretch of sibling
 * `string` nodes with nothing between them: math splits `.05` into `.`, `0`, `5`, and prose
 * keeps `2310.05736` whole — both come back as one word. Anything else ends the run.
 */
function texRuns(nodes, math, out) {
  let run = "";
  const flush = () => {
    if (run) out.push(run);
    run = "";
  };
  for (let i = 0; i < (nodes || []).length; i++) {
    const n = nodes[i];
    if (n.type === "string") {
      run += n.content;
      continue;
    }
    flush();
    if (
      n.type === "inlinemath" ||
      n.type === "displaymath" ||
      n.type === "mathenv"
    )
      texRuns(n.content, true, out);
    else if (n.type === "environment") {
      const env = typeof n.env === "string" ? n.env : "";
      // The body only: an environment's own arguments are a column spec, a width, a placement —
      // and when unified-latex has no signature for it, they lead the body as bare siblings.
      if (!TEX_HIDDEN_ENV.test(env)) {
        const body = n.content || [];
        const from = (n.args || []).length ? 0 : unparsedArgsEnd(body, -1) + 1;
        texRuns(body.slice(from), math, out);
      }
    } else if (n.type === "group") {
      texRuns(n.content, math, out);
    } else if (n.type === "macro") {
      const args = mandatory(n);
      if (math) {
        if (!TEX_MATH_HIDDEN.test(n.content))
          for (const a of args) texRuns(a.content, true, out);
      } else if (TEX_PROSE_ARG.test(n.content)) {
        for (const a of args) texRuns(a.content, false, out);
      } else if (TEX_LAST_ARG.test(n.content) && args.length) {
        texRuns(args[args.length - 1].content, false, out);
      }
      // In text, a macro with no parsed arguments may still have them, as siblings.
      if (!math && !(n.args || []).length) i = unparsedArgsEnd(nodes, i);
    }
    // comment, verb, verbatim, whitespace, parbreak: not the reader's number, or not a word
  }
  flush();
  return out;
}

function texVisibleRuns(raw) {
  const root = getParser().parse(raw).content;
  // Only the document body is typeset. A fragment with no `document` environment is all body.
  const document = root.find(
    (n) => n.type === "environment" && n.env === "document",
  );
  return texRuns(document ? document.content : root, false, []);
}

// Markdown: the ESLint markdown language already hands over the mdast. Text nodes are what the
// reader sees, table cells included; these node types are not prose.
const MD_HIDDEN = new Set([
  "code",
  "inlineCode",
  "html",
  "yaml",
  "toml",
  "math",
  "inlineMath",
]);
function mdVisibleRuns(node, out = []) {
  if (!node || MD_HIDDEN.has(node.type)) return out;
  if (node.type === "text") out.push(node.value);
  for (const c of node.children || []) mdVisibleRuns(c, out);
  return out;
}

/** The TexSourceCode of this package carries `raw`; anything else is read through its AST. */
const visibleRuns = (sourceCode) =>
  typeof sourceCode.raw === "string"
    ? texVisibleRuns(sourceCode.raw)
    : mdVisibleRuns(sourceCode.ast);

const LABEL = {
  sectionSign: "`§` instead of «Section» (reviewer B)",
  bareDecimal:
    "a decimal without a leading zero, `.05` instead of `0.05` (IEEE / ISO 80000-1 style)",
  figMixed: "`Fig.` and `Figure` mixed in one document",
  unreachable:
    "bibliography entries with no doi/url/arXiv id — a reader has nothing to follow (reviewer A)",
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
              // { "<path to the paper directory from repo root>": { sectionSign: 54, unreachable: 18 } }
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
            const bareDecimal = countBareDecimals(
              visibleRuns(context.sourceCode),
            );
            const counts = typographyCounts(raw, bareDecimal);
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
                  grew:
                    before > 0
                      ? ` (was ${String(before)}, now ${String(n)})`
                      : "",
                },
              });
            }
          },
        };
      },
    },
  },
};
