/**
 * AN ESLint LANGUAGE FOR `.tex` — so that the ~30 prose rules of a paper pipeline read papers
 * written in LaTeX, and not only papers written in markdown. The spike it grew out of lives in
 * the source corpus as a coverage measurement plus an executable prototype kept as history.
 *
 * ── CONSTRUCTION: two legs ──────────────────────────────────────────────────
 *  1. AST — a flat mdast-like root (heading / code / html / strong) with REAL positions taken
 *     from `@unified-latex`.
 *  2. TEXT — a projection of `.tex` into a markdown-like view THAT PRESERVES LENGTHS AND
 *     OFFSETS: comments, the preamble, math, service macros and code environments are blanked
 *     with spaces; `\section{X}` projects to `##      X `, `\texttt{X}` to `` `X` ``.
 *     The point: a rule receives what it used to see in markdown and KNOWS NOTHING about
 *     LaTeX, while the position of a finding points into the real `.tex`. Not one rule was
 *     rewritten for LaTeX.
 *
 * ── HEADING SYNTHESIS: not decoration, but the repair of seven silent rules ──
 * Measured 2026-08-26 across three real papers: NONE of them has a `Limitations` /
 * `References` / `Appendix` heading, none has `\section*`, none has `\appendix`. The
 * bibliography is declared by `\bibliography{refs}` or `\begin{thebibliography}`, the
 * abstract by an environment. Rules take their "free half" from HEADINGS, so without
 * synthesis `freeRanges` is empty and SEVEN rules are silent BY CONSTRUCTION —
 * free-section-size · free-section-note · block-note · block-ungraded · block-verdict ·
 * appendix-ref · appendix-ratio. This is exactly the case of "zero findings — a suspect, not
 * a clean corpus".
 *
 * ── CAPTIONS AND FOOTNOTES: a boundary CLOSED on 2026-09-06 ─────────────────
 * Until that day, prose inside `\caption{}` and `\footnote{}` was invisible to ALL 27 prose
 * rules on `.tex` — 11 blocks / 384 words, of which 253 in one paper agree with `texcount`
 * ("Words outside text: 253"). There were TWO locks, and lifting one did not help: a caption
 * was blanked by `OPAQUE` as a macro, and inside `\begin{table}` / `\begin{figure}` it was
 * blanked again by the whole environment under `CODEISH`. Now `caption` / `footnote` are
 * pulled out into `FLOAT_PROSE`, and the `CODEISH` branch blanks the float MINUS the
 * arguments of those two macros.
 * 🔴 Removing `table` / `figure` from `CODEISH` was NOT an option — rules would then receive
 * `&`, `\\`, the column specification and tikz nodes, i.e. findings on markup. That is pinned
 * by the harness and by a "naive fix" mutation which that part kills.
 * Measured after the fix: nine new findings across three papers, all of them captions and
 * footnotes, reviewed one by one; zero false positives on markup.
 *
 * ── KNOWN BOUNDARIES. Written down rather than silently accepted ────────────
 *  1. The projection is a SECOND TRUTH about the document: the text a rule sees is not the
 *     file (only lengths and offsets are equal). Any quotation in a message prints the
 *     projection, not the source — e.g. `§«Discussion and threats to validity »` with a
 *     trailing space left by a blanked `}`.
 *  2. ESCAPED CHARACTERS ARE LOST. `\%`, `\$`, `\&` are single-character macros and get
 *     blanked together with their name: `95\% of it, costing \$5 and A\&B` →
 *     `95   of it, costing   5 and A  B`. This matters: a word splitter counts `%` as part of
 *     a word, and a plain-language rule counts NUMBERS — so the percent sign detaches from
 *     its number. Not fixed: three exceptions would have to be written and pinned.
 *  3. THRESHOLDS WERE CALIBRATED ON MARKDOWN. 60 / 350 / 700 words were taken from a markdown
 *     paper. The projection counts differently: the same place gave 1239 words before macro
 *     blanking and 1208 after — a 2.5% discrepancy. The discrepancy is ACCEPTED deliberately;
 *     the thresholds were not recalibrated.
 *  4. A MULTI-FILE PAPER IS INVISIBLE. `\input` / `\include` are in OPAQUE — their contents
 *     are not read. The first `\input{sections/method}` yields a silent zero over all the
 *     prose it pulls in.
 *  5. `\appendix` IS NOT IMPLEMENTED and is INEXPRESSIBLE in a length-preserving projection:
 *     `\appendix` is 9 characters, `## Appendix` is 11, the synthesis does not fit. On the
 *     first paper with a real `\appendix`, `appendix-ref` / `appendix-ratio` yield a silent
 *     zero.
 *  6. ANYTHING LaTeX GENERATES does not exist for a rule: section numbers, appendix letters,
 *     reference numbers, real page numbers.
 *  7. AUTHOR MACROS ARE NOT EXPANDED (`\newcommand{\tool}{…}` — the name is blanked, the body
 *     is not substituted). Anonymisation is normally done with exactly those, so coinage and
 *     jargon rules see less on an anonymised version than on a camera-ready.
 *  8. `% eslint {"rules":…}` inside `.tex` does NOT work: `applyInlineConfig` returns empty.
 *     The disable directives DO work — `% eslint-disable-next-line <rule> -- reason`,
 *     `% eslint-disable-line`, `% eslint-disable` / `% eslint-enable` — and since 3.0.0 also
 *     inside a `filecontents` bibliography, whose `%` lines are made comment nodes below.
 *  9. `\section*{…}` is untested and does not occur in the corpus (measured: 0 occurrences).
 *     When it appears, `plain()` will glue all arguments together and the heading may come out
 *     as `*X`.
 * 10. The assertion "projection length == source length" holds on every harness input, but
 *     `\r\n`, emoji inside `.tex`, `\verb|…|` and nested `filecontents` are untested.
 * 11. INSIDE A CAPTION no bold lead-in is synthesised: `\emph{…}` in the first column is an
 *     editor's line break, not the heading of an appendix block, and a block-note rule would
 *     take it for an ungraded block. Held by the `inCaption` counter. The flip side: a real
 *     `\textbf{…}` at the start of a caption line does not exist for strong-lead detection.
 *     Measured 2026-09-06 across three papers: zero such captions in the free half, so the
 *     cost today is zero.
 * 12. THE CODE/PROSE BOUNDARY INSIDE A FLOAT IS DRAWN BY LINES, not by offsets, and that is
 *     forced: a document splitter drops from its clean text EVERY line a `code` node touches,
 *     so one node spanning the whole float would carry the caption back into darkness right
 *     after the projection had saved it. Hence `code` nodes are emitted as runs of lines that
 *     step around the caption lines. The cost: a line where the caption sits TOGETHER with
 *     markup (`\begin{table}[t]\caption{…}` on one line — one real paper writes a table that
 *     way) is not dropped from the prose stream at all. No harm done, the markup on it is
 *     blanked with spaces, but for a prose rule it is an ordinary line of text rather than a
 *     gap. Measured: the set of findings agreed; not pinned by a separate assertion.
 * 13. `\citep{}` / `\citet{}` LEAK THEIR KEY, and `\cite{}` does not. Found 2026-09-11 while
 *     extracting this language, by an assertion that expected the opposite. Both names are
 *     listed in OPAQUE, but OPAQUE only blanks a macro NAME plus the ARGUMENTS unified-latex
 *     attached to it — and unified-latex has no signature for the natbib pair, so `{someone2020}`
 *     comes back as a separate group node and survives as prose. Measured, one input per macro:
 *       `\cite{keyABC}`  → `              ` (fully blanked)
 *       `\citep{keyABC}` → `       keyABC}` (key and closing brace survive)
 *       `\citet{keyABC}` → `       keyABC}`
 *     Consequence for a paper using natbib: every citation key is a word in the prose stream.
 *     NOT fixed here — the fix is a signature declaration for unified-latex, which is a change
 *     of behaviour rather than a move, and it wants its own measurement on a real corpus.
 */
import { getParser } from "@unified-latex/unified-latex-util-parse";
import {
  TextSourceCodeBase,
  VisitNodeStep,
  ConfigCommentParser,
  Directive,
} from "@eslint/plugin-kit";

const HEADING = { part: 1, section: 2, subsection: 3, subsubsection: 4 };
const CODEISH =
  /^(verbatim|lstlisting|minted|figure|figure\*|table|table\*|tabular|algorithm|algorithmic|thebibliography|tikzpicture|filecontents\*?)$/;
// Prose that a CODEISH environment has NO right to swallow together with the markup.
// A figure/table caption and a footnote are English sentences: the author writes them and the
// reviewer reads them. Everything else inside a float (`&`, `\\`, the column specification,
// `\includegraphics`) is not prose. Measured on the source corpus 2026-08-28: 11 blocks /
// 384 words were invisible to ALL 27 prose rules on `.tex`, and 253 of those words in one
// paper agree with `texcount`'s "Words outside text".
const FLOAT_PROSE = /^(caption|footnote)$/;
// Macros whose NAME and ARGUMENT are both non-prose.
const OPAQUE =
  /^(label|ref|autoref|eqref|cite|citep|citet|input|include|usepackage|documentclass|bibliography|bibliographystyle|acmISBN|acmDOI|acmConference|setcopyright|ccsdesc|keywords|orcid|affiliation|email|author|copyrightyear|acmYear|acmBooktitle|acmPrice|settopmatter|definecolor|includegraphics|newcommand|renewcommand|def|let|makeatletter|makeatother|hypersetup|pagestyle|thispagestyle|vspace|hspace)$/;

const P = (n) => n?.position;

function plain(nodes) {
  let out = "";
  for (const n of nodes || []) {
    if (n.type === "string") out += n.content;
    else if (n.type === "whitespace") out += " ";
    else if (n.type === "group" || n.type === "argument")
      out += plain(n.content);
    else if (n.type === "macro" && n.args)
      out += plain(n.args.flatMap((a) => a.content || []));
  }
  return out.trim();
}
const argEnd = (node) => {
  let end = P(node).end;
  for (const a of node.args || [])
    for (const c of a.content || [])
      if (P(c) && P(c).end.offset > end.offset) end = P(c).end;
  return end;
};

export function texToMdast(src) {
  const ast = getParser().parse(src);
  const chars = src.split("");
  const blank = (from, to) => {
    for (let i = from; i < to && i < chars.length; i++)
      if (chars[i] !== "\n") chars[i] = " ";
  };
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++)
    if (src[i] === "\n") lineStarts.push(i + 1);
  const loc = (off) => {
    let lo = 0,
      hi = lineStarts.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (lineStarts[m] <= off) lo = m;
      else hi = m - 1;
    }
    return { line: lo + 1, column: off - lineStarts[lo] + 1, offset: off };
  };
  const children = [];
  const pendingStrong = [];
  // Nesting depth inside a `\caption{}` / `\footnote{}` argument. Exactly one place needs it:
  // bold lead-in synthesis. An `\emph{…}` in the first column INSIDE a caption is an editor's
  // line break, not the heading of an appendix block, and a block-note rule would take it for
  // an ungraded block. Measured across three papers: today there are no such captions in the
  // free half (0 findings), so this guards against tomorrow rather than repairing today.
  let inCaption = 0;
  /** A synthetic heading: the ATX marker is written at the START of the span, the tail is blanked. */
  const synthHeading = (from, to, title, depth = 2) => {
    const label = "#".repeat(depth) + " " + title;
    if (label.length > to - from) return null; // does not fit — do not invent one silently
    blank(from, to);
    for (let i = 0; i < label.length; i++) chars[from + i] = label[i];
    const node = {
      type: "heading",
      depth,
      title,
      children: [
        {
          type: "text",
          value: title,
          position: {
            start: loc(from + depth + 1),
            end: loc(from + label.length),
          },
        },
      ],
      position: { start: loc(from), end: loc(from + label.length) },
    };
    children.push(node);
    return node;
  };

  const beginDoc = src.indexOf("\\begin{document}");
  const preEnd = beginDoc > 0 ? beginDoc + "\\begin{document}".length : 0;
  if (preEnd) {
    blank(0, preEnd);
    children.push({
      type: "code",
      lang: "latex",
      value: "",
      position: { start: loc(0), end: loc(preEnd) },
    });
  }

  // 🔴 A `filecontents` body is not LaTeX — it is the `.bib` the paper writes, usually in the
  // preamble — so the parser returns it as one verbatim node and no comment nodes from it. A
  // disable directive above a bibliography entry (`% eslint-disable-next-line bib/reachable-entry
  // -- …`) was therefore invisible. Its `%` lines are made comments here, the only way
  // `getInlineConfigNodes` sees them. BibTeX ignores text between entries, so the line is
  // harmless to the build.
  for (const n of ast.content)
    if (
      n.type === "verbatim" &&
      /^filecontents\*?$/.test(String(n.env)) &&
      P(n)
    ) {
      let at = P(n).start.offset;
      for (const line of src.slice(at, P(n).end.offset).split("\n")) {
        const text = line.replace(/\r$/, "");
        const pct = /^\s*%/.test(text) ? text.indexOf("%") : -1;
        if (pct >= 0)
          children.push({
            type: "html",
            value: text.slice(pct + 1),
            position: { start: loc(at + pct), end: loc(at + text.length) },
          });
        at += line.length + 1;
      }
    }

  (function walk(node) {
    if (Array.isArray(node)) return node.forEach((n) => walk(n));
    if (!node || typeof node !== "object") return;
    const pos = P(node);
    // The preamble is already blanked in full; nothing inside it (including a
    // `\renewcommand{\bibliography}`) is a node of the document. Without this cut-off, one real
    // paper got a FALSE `## References` on line 178 — i.e. its bibliography "began" before the
    // introduction, and the whole paper fell into the free half.
    if (pos && pos.start.offset < preEnd) {
      for (const k of ["content", "args"]) if (node[k]) walk(node[k]);
      return;
    }

    if (node.type === "environment") {
      const env = typeof node.env === "string" ? node.env : plain(node.env);
      // 🔴 MEASURED 2026-08-26: none of the three real `.tex` papers has a `Limitations` /
      // `References` / `Appendix` heading. In LaTeX the free half is declared by an
      // ENVIRONMENT and a macro rather than by a heading, so without synthesis `freeRanges`
      // is empty and seven rules are silent by construction.
      if (env === "abstract" && pos) {
        synthHeading(
          pos.start.offset,
          pos.start.offset + "\\begin{abstract}".length,
          "Abstract",
        );
        for (const k of ["content", "args"]) if (node[k]) walk(node[k]);
        return;
      }
      if (env === "thebibliography" && pos) {
        const h = synthHeading(
          pos.start.offset,
          pos.start.offset + "\\begin{thebibliography}".length,
          "References",
        );
        blank(
          pos.start.offset + (h ? "## References".length : 0),
          pos.end.offset,
        );
        children.push({
          type: "code",
          lang: env,
          value: "",
          position: { start: loc(pos.start.offset + 14), end: pos.end },
        });
        return;
      }
      if (CODEISH.test(env) && pos) {
        // 🔴 THERE WERE TWO LOCKS, AND LIFTING ONE DID NOT HELP (proved by mutation): a
        // caption was blanked by `OPAQUE` as a macro, and inside `table` / `figure` it was
        // blanked AGAIN by the whole environment. So what is blanked here is not the float's
        // borders but the float MINUS the arguments of `\caption{}` / `\footnote{}`.
        //
        // Removing `table` / `figure` from `CODEISH` was NOT an option: prose rules would then
        // receive `&`, `\\` and the column specification, i.e. findings on markup — and for a
        // rule somebody turns up to `error`, a false positive is worse than a miss.
        const keep = [];
        (function findProse(n) {
          if (Array.isArray(n)) return n.forEach(findProse);
          if (!n || typeof n !== "object") return;
          if (n.type === "macro" && FLOAT_PROSE.test(n.content)) {
            const cs = (n.args || [])
              .flatMap((a) => a.content || [])
              .filter((c) => P(c));
            // Keep exactly the CONTENT of the argument: `\caption` itself and the braces
            // stay in the blanked part, so the macro name never becomes prose.
            if (cs.length)
              keep.push({
                node: n,
                s: P(cs[0]).start.offset,
                e: P(cs[cs.length - 1]).end.offset,
              });
            return; // do not look for a caption inside a caption
          }
          for (const k of ["content", "args"]) if (n[k]) findProse(n[k]);
        })(node.content);
        keep.sort((a, b) => a.s - b.s);
        let cur = pos.start.offset;
        for (const k of keep) {
          blank(cur, k.s);
          cur = Math.max(cur, k.e);
        }
        blank(cur, pos.end.offset);
        // 🔴 The code node is emitted LINE BY LINE, stepping around the caption lines. A
        // document splitter drops from its clean text every line a `code` node TOUCHES, so one
        // node spanning the whole float would carry the caption back into darkness right after
        // the projection had saved it.
        const proseLines = new Set();
        for (const k of keep)
          for (
            let l = loc(k.s).line;
            l <= loc(Math.max(k.s, k.e - 1)).line;
            l++
          )
            proseLines.add(l);
        const L0 = loc(pos.start.offset).line;
        const L1 = loc(Math.max(pos.start.offset, pos.end.offset - 1)).line;
        for (let l = L0; l <= L1; l++) {
          if (proseLines.has(l)) continue;
          let r = l;
          while (r + 1 <= L1 && !proseLines.has(r + 1)) r++;
          const s0 = lineStarts[l - 1];
          const e0 = r < lineStarts.length ? lineStarts[r] - 1 : src.length;
          children.push({
            type: "code",
            lang: env,
            value: "",
            position: { start: loc(s0), end: loc(e0) },
          });
          l = r;
        }
        // We walk into the caption itself the ordinary way: `\label`, `\cite` and math inside
        // it are blanked by the same branches as in the body, not by a separate parser.
        for (const k of keep) walk(k.node);
        return;
      }
      // other environments: blank only the `\begin{x}` / `\end{x}` fences
      if (pos) {
        blank(pos.start.offset, pos.start.offset + env.length + 8);
        blank(Math.max(0, pos.end.offset - env.length - 6), pos.end.offset);
      }
    }
    if (
      (node.type === "inlinemath" ||
        node.type === "displaymath" ||
        node.type === "verbatim") &&
      pos
    ) {
      blank(pos.start.offset, pos.end.offset);
      return;
    }
    if (node.type === "comment" && pos) {
      // 🔴 unified-latex includes the TRAILING newline in a comment; mdast does not. A rule
      // that binds an author note to the heading below it requires a newline BETWEEN the end of
      // the comment and the heading; with the `\n` swallowed the gap is empty and the note is
      // never found.
      let ce = pos.end.offset;
      while (
        ce > pos.start.offset &&
        (src[ce - 1] === "\n" || src[ce - 1] === "\r")
      )
        ce--;
      // 🔴 AND SYMMETRICALLY ON THE LEFT (found by a run on 2026-08-27, not by reading). A
      // comment that follows a line of text directly, rather than a blank line, comes back from
      // unified-latex with a position starting at the PREVIOUS newline instead of at `%`.
      // Consumers recognise a comment by its first character (`<!--` in markdown, `%` in
      // LaTeX), so such a node was not a comment to them: notes above bold appendix lead-ins
      // never bound, and the block-note / block-verdict rules could NEVER fire. Measured:
      // 2 out of 2 blocks were reported as "no note AT ALL" while the notes were right there.
      let cs = pos.start.offset;
      while (cs < ce && src[cs] !== "%") cs++;
      children.push({
        type: "html",
        value: node.content,
        position: { start: loc(cs), end: loc(ce) },
      });
      return; // blanking is the document splitter's job — it also takes the note body
    }
    if (node.type === "macro" && pos) {
      const depth = HEADING[node.content];
      if (depth) {
        const title = plain(node.args?.flatMap((a) => a.content || []));
        const end = argEnd(node);
        // project to ATX: `##` where `\se` was, the rest spaces; the closing `}` too
        blank(pos.start.offset, end.offset + 1);
        for (let i = 0; i < depth; i++) chars[pos.start.offset + i] = "#";
        const tStart = end.offset - title.length;
        for (let i = 0; i < title.length; i++) chars[tStart + i] = title[i];
        const tPos = { start: loc(tStart), end: loc(end.offset) };
        children.push({
          type: "heading",
          depth,
          title,
          children: [{ type: "text", value: title, position: tPos }],
          position: {
            start: pos.start,
            end: { ...end, offset: end.offset + 1, column: end.column + 1 },
          },
        });
        return;
      }
      if (node.content === "bibliography" && pos) {
        synthHeading(pos.start.offset, argEnd(node).offset + 1, "References");
        return;
      }
      if (OPAQUE.test(node.content)) {
        blank(pos.start.offset, argEnd(node).offset + 1);
        return;
      }
      // `\texttt{X}` → `` `X` ``: exactly the same character count, so offsets do not move.
      // This is the only markdown markup the projection can reproduce without shifting: `**`
      // needs TWO characters after the content, and there is only `}`.
      if (node.content === "texttt" || node.content === "lstinline") {
        const e = argEnd(node);
        const cs = (node.args || [])
          .flatMap((a) => a.content || [])
          .filter((c) => P(c));
        if (cs.length) {
          const s0 = P(cs[0]).start.offset;
          blank(pos.start.offset, s0 - 1);
          chars[s0 - 1] = "`";
          chars[e.offset] = "`";
          return;
        }
      }
      if (
        (node.content === "textbf" || node.content === "emph") &&
        pos.start.column === 1 &&
        !inCaption
      ) {
        const end = argEnd(node);
        const sv = plain(node.args?.flatMap((a) => a.content || []));
        children.push({
          type: "strong",
          children: [
            {
              type: "text",
              value: sv,
              position: {
                start: loc(end.offset - sv.length),
                end: loc(end.offset),
              },
            },
          ],
          position: {
            start: pos.start,
            end: { ...end, offset: end.offset + 1, column: end.column + 1 },
          },
        });
        // 🔴 The `**` are written IN PLACE OF `\\te`, not before the content: a block-note rule
        // locates a lead-in by the OFFSET of the line's first non-space character. Leave spaces
        // at the start of the line and the note above the block never binds, so block-* go
        // silent.
        pendingStrong.push(pos.start.offset);
      }
      // an ordinary macro: blank the NAME (`\emph`) and the argument's BRACES; the content is prose
      blank(pos.start.offset, pos.end.offset);
      while (pendingStrong.length) {
        const o = pendingStrong.pop();
        chars[o] = "*";
        chars[o + 1] = "*";
      }
      for (const a of node.args || []) {
        const cs = (a.content || []).filter((c) => P(c));
        if (!cs.length) continue;
        const s0 = P(cs[0]).start.offset,
          e0 = P(cs[cs.length - 1]).end.offset;
        if (a.openMark) blank(s0 - a.openMark.length, s0);
        if (a.closeMark) blank(e0, e0 + a.closeMark.length);
      }
      if (FLOAT_PROSE.test(node.content)) {
        inCaption++;
        for (const k of ["content", "args"]) if (node[k]) walk(node[k]);
        inCaption--;
        return;
      }
    }
    for (const k of ["content", "args"]) if (node[k]) walk(node[k]);
  })(ast.content);

  children.sort((a, b) => a.position.start.offset - b.position.start.offset);
  return {
    root: {
      type: "root",
      children,
      position: { start: loc(0), end: loc(src.length) },
    },
    text: chars.join(""),
  };
}

const commentParser = new ConfigCommentParser();
const directiveStart =
  /^\s*eslint(?:-enable|-disable(?:(?:-next)?-line)?)?(?:\s|$)/u;

class TexSourceCode extends TextSourceCodeBase {
  #steps;
  #parents = new WeakMap();
  #comments = [];
  #inline;
  ast;
  /**
   * `raw` is the UNPROJECTED `.tex`, and it is here because the projection is lossy by design:
   * it blanks macros, so a rule that must count `\S\ref` or `Fig.~\ref` sees spaces. Those
   * rules are about MARKUP, not prose, and the projection exists precisely to hide markup.
   *
   * 🔴 Positions stay interchangeable, which is what makes this safe rather than a second
   * coordinate system: `blank()` overwrites characters with spaces and never changes length,
   * so an offset computed on `raw` addresses the same byte of `text`. A rule may therefore
   * scan `raw` and report with the offset it found.
   */
  raw;
  constructor({ text, ast, raw }) {
    super({ ast, text, lineEndingPattern: /\r?\n/u });
    this.ast = ast;
    this.raw = raw ?? text;
    this.traverse();
  }
  getParent(node) {
    return this.#parents.get(node);
  }
  getInlineConfigNodes() {
    if (!this.#inline)
      this.#inline = this.#comments
        .filter((c) => directiveStart.test(c.value))
        .map((c) => ({ value: c.value.trim(), position: c.position }));
    return this.#inline;
  }
  getDisableDirectives() {
    const directives = [];
    for (const comment of this.getInlineConfigNodes()) {
      const { label, value, justification } = commentParser.parseDirective(
        comment.value,
      );
      if (
        [
          "eslint-disable",
          "eslint-enable",
          "eslint-disable-next-line",
          "eslint-disable-line",
        ].includes(label)
      )
        directives.push(
          new Directive({
            type: label.slice(7),
            node: comment,
            value,
            justification,
          }),
        );
    }
    return { problems: [], directives };
  }
  applyInlineConfig() {
    return { configs: [], problems: [] };
  }
  traverse() {
    if (this.#steps) return this.#steps.values();
    const steps = (this.#steps = []);
    const visit = (node, parent) => {
      this.#parents.set(node, parent);
      steps.push(
        new VisitNodeStep({ target: node, phase: 1, args: [node, parent] }),
      );
      if (node.type === "html")
        this.#comments.push({ value: node.value, position: node.position });
      for (const c of node.children || []) visit(c, node);
      steps.push(
        new VisitNodeStep({ target: node, phase: 2, args: [node, parent] }),
      );
    };
    visit(this.ast);
    return steps.values();
  }
}

export const texLanguage = {
  fileType: "text",
  lineStart: 1,
  columnStart: 1,
  nodeTypeKey: "type",
  defaultLanguageOptions: {},
  validateLanguageOptions() {},
  parse(file) {
    try {
      const raw = String(file.body);
      const { root, text } = texToMdast(raw);
      return { ok: true, ast: root, projected: text, raw };
    } catch (ex) {
      return { ok: false, errors: [ex] };
    }
  },
  createSourceCode(file, parseResult) {
    // 🔴 LOAD-BEARING: the SourceCode receives the PROJECTION, not the source. Lengths and
    // offsets are equal, so the position of a finding points into the real `.tex` while the
    // rule sees prose.
    return new TexSourceCode({
      text: parseResult.projected,
      ast: parseResult.ast,
      raw: parseResult.raw,
    });
  },
};
