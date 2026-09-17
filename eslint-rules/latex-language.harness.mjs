/**
 * Colocated test for the LaTeX language `eslint-rules/latex-language.mjs`.
 * Run: `npx vigiles test eslint-rules/latex-language.harness.mjs`
 *
 * FIVE PARTS, AND THE ORDER IS LOAD-BEARING:
 *   0.  THE PROJECTION INVARIANT — length, line count and newline offsets equal the source.
 *       EVERYTHING else stands on this: once offsets drift, every finding lies, and lies
 *       quietly. Checked on both fixtures and on every synthetic input below.
 *   I.  QUIET ON A CORRECT INPUT — before "fires on a planted defect", deliberately: a check
 *       that fails a correct input is more dangerous than no check. `fixtures/latex-language/
 *       clean.tex` goes through the repository's real `eslint.config.mjs` and must be silent.
 *   II. THE PROJECTION ACTUALLY DID ITS WORK — headings (including SYNTHESISED ones), caption
 *       and footnote prose kept, float markup blanked, opaque macros blanked, math blanked,
 *       comments recognised. This is the half that a mutation battery can kill; without it the
 *       language could be gutted and part I would stay green, because a projection that blanks
 *       everything is also silent.
 *  III. FIRES ON A PLANTED DEFECT — `fixtures/latex-language/defect.tex`, through the real
 *       config, must produce findings, and at the right addresses.
 *   IV. THE LANGUAGE'S BOUNDARIES AS ASSERTIONS. A known limitation recorded only in prose
 *       silently stops being known. Pinned here: change the behaviour and this test goes red
 *       and forces the language's header to be rewritten, instead of the drift surfacing in a
 *       month.
 *    V. CONFIG — the language is wired to `.tex`, and the glob it is wired on is NOT EMPTY.
 *
 * ⚠️ WHAT WAS LOST WHEN THIS TEST LEFT THE PRIVATE CORPUS BEHIND, stated rather than glossed.
 * The original harness drove SIX rule modules (walls, prose, claims, structure, craft,
 * registry) through this language and froze their finding counts on three real papers
 * (35 · 52 · 15 at the 2026-08-27 measurement, later 32 · 53 · 20 after captions became
 * visible on 2026-09-06). None of those modules was extracted, and the papers are private, so:
 *   - the "rules see LaTeX the way they saw markdown" half is GONE. What is left proves the
 *     projection is correct, not that a downstream rule consumes it correctly;
 *   - the config half that checked rule-set PARITY between `.tex` and `paper.md`, and the
 *     list of rules explicitly switched `off` on `.tex` WITH A REASON, is GONE with the rules;
 *   - the only rule that still runs through this language here is `tex/future-promise`, and it
 *     reads the file from disk rather than the projection — so end-to-end it proves the
 *     language parses and dispatches, not that the projection is what a rule reads.
 * That last gap is why part II asserts the projection DIRECTLY on `texToMdast`, rather than
 * inferring it from someone's finding count.
 *
 * 🔴 Assertions live at MODULE TOP LEVEL: `vigiles test` imports the file and treats "it did
 * not throw" as success; an exported `tests` object is run by nothing.
 */
import { ESLint } from "eslint";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, ".."); // eslint-rules → repository root
const LANG = join(HERE, "latex-language.mjs");
assert.ok(existsSync(LANG), `no entry point for the test: ${LANG}`);

const { texLanguage, texToMdast } = await import(LANG);

const TMP = realpathSync(mkdtempSync(join(tmpdir(), "latex-language-")));
// Cleanup is registered IMMEDIATELY, not at the end of the file: assertions throw, and an
// `rmSync` at the bottom never runs in exactly the runs that are red.
process.on("exit", () => rmSync(TMP, { recursive: true, force: true }));

const CLEAN_FIXTURE = join(ROOT, "fixtures/latex-language/clean.tex");
const DEFECT_FIXTURE = join(ROOT, "fixtures/latex-language/defect.tex");
for (const f of [CLEAN_FIXTURE, DEFECT_FIXTURE])
  assert.ok(existsSync(f), `missing fixture: ${f}`);

// ═════════════════════════════════════════════════════════════════════════════
// 0. THE PROJECTION INVARIANT
// ═════════════════════════════════════════════════════════════════════════════
// The projection must be character-for-character COMMENSURATE with the source: same length,
// same newlines at the same offsets. Otherwise a finding's `file:line:col` points somewhere
// else — and, worse, lies plausibly: the line exists, it is just not the right one.
function assertProjection(label, src) {
  const { text } = texToMdast(src);
  assert.equal(text.length, src.length, `${label}: projection length drifted from the source`);
  const nl = (s) => {
    const out = [];
    for (let i = 0; i < s.length; i++) if (s[i] === "\n") out.push(i);
    return out;
  };
  assert.deepEqual(nl(text), nl(src), `${label}: projection newlines moved relative to the source`);
  return text;
}
/** Reads a fixture, checks the invariant on it, and returns `{src, text, root}`. */
function project(label, src) {
  const text = assertProjection(label, src);
  return { src, text, root: texToMdast(src).root };
}

const CLEAN_SRC = readFileSync(CLEAN_FIXTURE, "utf8");
const DEFECT_SRC = readFileSync(DEFECT_FIXTURE, "utf8");
const clean = project("fixtures/latex-language/clean.tex", CLEAN_SRC);
const defect = project("fixtures/latex-language/defect.tex", DEFECT_SRC);

// ═════════════════════════════════════════════════════════════════════════════
// I. QUIET ON A CORRECT INPUT — through the repository's real config
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 Deliberately NOT an in-process config. A language that is correct and unreferenced would
// pass every assertion in part II and still be wired to nothing; only a run through
// `eslint.config.mjs` as it sits on disk can fail on that.
const real = new ESLint({ cwd: ROOT });
async function lintTex(file) {
  const [res] = await real.lintFiles([file]);
  assert.deepEqual(
    res.messages.filter((m) => m.fatal || !m.ruleId),
    [],
    `${file}: the language failed to parse or a rule threw — that is a linter crash, not a finding`,
  );
  return res.messages.map((m) => ({
    rule: m.ruleId,
    line: m.line,
    column: m.column,
    text: /«([^»]+)»/.exec(m.message)?.[1] ?? null,
  }));
}

assert.deepEqual(
  await lintTex(CLEAN_FIXTURE),
  [],
  "a CORRECT LaTeX paper produced findings — a check that fails a correct input gets switched " +
    "off the same day",
);

// ═════════════════════════════════════════════════════════════════════════════
// II. THE PROJECTION ACTUALLY DID ITS WORK
// ═════════════════════════════════════════════════════════════════════════════
// Without this part, part I is satisfied by a language that blanks the entire document: zero
// findings either way. Each assertion below names one property of the projection and is the
// thing a mutation of that property kills.
const headings = (root) => root.children.filter((c) => c.type === "heading");

{
  const titles = headings(clean.root).map((h) => h.title);
  // 🔴 SYNTHESIS. Neither `Abstract` nor `References` is written as a heading anywhere in the
  // fixture: the abstract is an environment, the bibliography is a macro. Measured on the
  // source corpus 2026-08-26 — none of the three real papers had a `Limitations` /
  // `References` / `Appendix` heading, so without synthesis the "free half" of a paper is
  // empty and seven downstream rules are silent by construction.
  assert.ok(titles.includes("Abstract"), `no synthesised Abstract heading; got ${titles.join(" | ")}`);
  assert.ok(titles.includes("References"), `no synthesised References heading; got ${titles.join(" | ")}`);
  assert.equal(titles[0], "Abstract", "Abstract is not the first heading");
  assert.equal(titles[titles.length - 1], "References", "References is not the last heading");
  // Real `\section{}` headings arrived as well — otherwise "the LaTeX was read" is a claim
  // about two synthetic nodes.
  assert.deepEqual(
    titles,
    ["Abstract", "Introduction", "Method", "Results", "References"],
    "the heading set of clean.tex drifted — LaTeX was parsed differently",
  );
  // ATX projection: `##` is written where `\se` used to be, so a markdown-shaped consumer sees
  // a heading at the real offset.
  assert.match(
    clean.text,
    /^##\s+Introduction\s*$/m,
    "`\\section{Introduction}` did not project to an ATX heading",
  );
}

{
  // 🔴 THE PREAMBLE CUT-OFF. Nothing before `\begin{document}` is a node of the document.
  // Without the cut-off, one real paper of the source corpus got a FALSE `## References` on
  // line 178 — its bibliography "began" before the introduction, so the whole paper fell into
  // the "free half" that several downstream rules measure.
  //
  // ⚠️ MEASURED WHILE EXTRACTING (2026-09-11), and it changed this fixture: the corpus paper's
  // actual trigger was a `\renewcommand{\bibliography}` in the preamble, and that construct
  // does NOT reproduce the defect here. unified-latex knows `\renewcommand`'s signature, so
  // `{\bibliography}` arrives as an ATTACHED ARGUMENT, `renewcommand` is in OPAQUE, and the
  // walk blanks it and returns before it can ever reach the inner macro. The trigger is any
  // preamble construct whose braces come back as a SIBLING GROUP instead — measured with the
  // cut-off removed:
  //     `\AtBeginDocument{\bibliography{refs}}` → false `References` heading on line 2
  //     `{\bibliography{refs}}`                  → false `References` heading on line 2
  //     `\section{Ghost}`                        → a real heading, also on line 2
  //     `\renewcommand{\bibliography}[1]{...}`   → nothing (the case that used to be quoted)
  // So the property is real and the old example of it was wrong. `\AtBeginDocument` is used
  // here because it is both a genuine thing papers write and a reproducible trigger.
  const src = [
    "\\documentclass{article}",
    "\\AtBeginDocument{\\bibliography{refs}}",
    "\\begin{document}",
    "\\begin{abstract}",
    "One paragraph, nothing more.",
    "\\end{abstract}",
    "\\section{Introduction}",
    "We measured one thing and report it plainly.",
    "\\bibliography{refs}",
    "\\end{document}",
    "",
  ].join("\n");
  const { root } = project("preamble-cutoff", src);
  const titles = headings(root).map((h) => h.title);
  assert.deepEqual(
    titles,
    ["Abstract", "Introduction", "References"],
    "a preamble construct produced a heading — the cut-off was lost, and with a References " +
      "heading landing before the introduction the whole document reads as its own free half",
  );
  assert.ok(
    headings(root).find((h) => h.title === "References").position.start.line > 8,
    "References was synthesised in the preamble rather than at the document's bibliography",
  );
}

{
  // THE PREAMBLE IS BLANKED. Everything before `\begin{document}` is markup, and if it stays
  // visible the package list and the author macros become prose.
  const preEnd = CLEAN_SRC.indexOf("\\begin{document}") + "\\begin{document}".length;
  assert.equal(
    clean.text.slice(0, preEnd).trim(),
    "",
    "the preamble is not blanked — package names and author macros leaked into the prose",
  );
  assert.ok(
    CLEAN_SRC.includes("\\usepackage{natbib}"),
    "the fixture lost its preamble content — the assertion above no longer has a subject",
  );
}

{
  // 🔴 CAPTIONS AND FOOTNOTES ARE PROSE, AND THIS WAS A DOUBLE LOCK. Until 2026-09-06 the text
  // inside `\caption{}` / `\footnote{}` was invisible to every prose rule reading `.tex`: it
  // was blanked once as an opaque macro argument, and again as part of the surrounding
  // `table` / `figure`. Lifting either lock alone changed nothing. Measured on the source
  // corpus: 11 blocks / 384 words of author English that no check could see, of which 253 in
  // one paper agree with `texcount`'s own "Words outside text" count.
  assert.ok(
    clean.text.includes("Deterministic audit of ten files, reported exactly as they were counted."),
    "the caption inside `table` was swallowed — prose rules are blind to captions again",
  );
  assert.ok(
    clean.text.includes("Both\nruns used the same machine and the same working directory, in that order."),
    "the footnote text was swallowed",
  );
  // 🔴 AND THE OTHER HALF, without which the one above invites the naive fix of dropping
  // `table` / `figure` from the code-ish set: the MARKUP of the float must still be blanked.
  // Otherwise prose rules receive `&`, `\\` and the column specification, i.e. findings on
  // markup — and for a rule someone turns up to `error`, a false positive is worse than a miss.
  const floatStart = CLEAN_SRC.indexOf("\\begin{table}");
  const floatEnd = CLEAN_SRC.indexOf("\\end{table}") + "\\end{table}".length;
  const projectedFloat = clean.text.slice(floatStart, floatEnd);
  for (const markup of ["tabular", "lrr", "&", "\\\\", "label", "tab:results"])
    assert.ok(
      !projectedFloat.includes(markup),
      `float markup «${markup}» survived into the prose projection`,
    );
}

{
  // OPAQUE MACROS: name AND argument are blanked. A `\cite` key or a `\label` is not English.
  for (const token of ["someone2020", "sec:intro", "acmart", "sigconf"])
    assert.ok(
      !clean.text.includes(token),
      `opaque macro content «${token}» leaked into the prose projection`,
    );
  assert.ok(
    CLEAN_SRC.includes("\\cite{someone2020}") && CLEAN_SRC.includes("\\label{sec:intro}"),
    "the fixture lost its opaque macros — the assertion above no longer has a subject",
  );
}

{
  // MATH IS BLANKED — inline and display alike. A formula is not a sentence, and a word counter
  // that eats `E = m c^2` reports prose that was never written.
  assert.ok(!clean.text.includes("m c^2"), "display math leaked into the prose projection");
  assert.ok(!clean.text.includes("n = 10"), "inline math leaked into the prose projection");
  assert.ok(
    CLEAN_SRC.includes("E = m c^2") && CLEAN_SRC.includes("$n = 10$"),
    "the fixture lost its math — the assertion above no longer has a subject",
  );
}

{
  // `\texttt{X}` → `` `X` ``: the same character count, so offsets do not move. It is the only
  // markdown markup the projection can reproduce without shifting — `**` needs TWO characters
  // after the content, and LaTeX leaves only `}`.
  assert.ok(
    clean.text.includes("`shadow-budget`"),
    "`\\texttt{X}` no longer projects to a backticked span",
  );
}

{
  // 🔴 A BOLD LEAD-IN AT COLUMN 1 becomes a `strong` node, and its `**` are written IN PLACE OF
  // `\te` rather than before the content. A downstream block-note rule locates a lead-in by the
  // OFFSET of the line's first non-space character; leave spaces at the start of the line and
  // the note above the block never binds, so those rules go silent.
  const src = [
    "\\documentclass{article}",
    "\\begin{document}",
    "\\section{Limitations}",
    "\\textbf{Sample size.} Ten files is not a corpus and we do not pretend it is.",
    "\\end{document}",
    "",
  ].join("\n");
  const { text, root } = project("strong-lead", src);
  const strong = root.children.filter((c) => c.type === "strong");
  assert.equal(strong.length, 1, "a `\\textbf{}` in column 1 did not become a strong node");
  assert.equal(strong[0].children[0].value, "Sample size.");
  assert.ok(
    text.split("\n").some((l) => l.startsWith("**")),
    "the `**` were not written at the start of the line — a note above the block cannot bind",
  );
}

{
  // 🔴 COMMENTS, AND BOTH OF THEIR EDGES. unified-latex includes the TRAILING newline in a
  // comment while mdast does not; and a comment that follows a line of text directly comes back
  // with a position starting at the PREVIOUS newline rather than at `%`. Consumers recognise a
  // comment by its first character, so before both edges were trimmed such a node was not a
  // comment to them at all — notes above bold lead-ins never bound, and the rules reading them
  // could NEVER fire. Measured at the time: 2 out of 2 blocks were reported as "no note at all"
  // while the notes were right there.
  const src = [
    "\\documentclass{article}",
    "\\begin{document}",
    "\\section{Limitations}",
    "A line of ordinary text.",
    "% a note bound to the block below it",
    "\\textbf{Sample size.} Ten files is not a corpus.",
    "\\end{document}",
    "",
  ].join("\n");
  const { root } = project("comment-edges", src);
  const html = root.children.filter((c) => c.type === "html");
  assert.equal(html.length, 1, "the LaTeX comment did not become an html node");
  const { start, end } = html[0].position;
  assert.equal(
    src[start.offset],
    "%",
    "the comment node does not start at `%` — its LEFT edge swallowed the previous newline, " +
      "and every consumer that recognises a comment by its first character stops seeing it",
  );
  assert.notEqual(
    src[end.offset - 1],
    "\n",
    "the comment node ends on a newline — its RIGHT edge swallowed the line break, so the gap " +
      "between the note and what it annotates is empty and the note never binds",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// III. FIRES ON A PLANTED DEFECT
// ═════════════════════════════════════════════════════════════════════════════
// ⚠️ The honest shape of this part after the extraction: the only rule wired to `.tex` in this
// repository is `tex/future-promise`, and it reads the file from disk rather than the
// projection. So this run proves the language parses the document and ESLint dispatches through
// it — the projection's own both-halves are part II, asserted directly.
{
  const ms = await lintTex(DEFECT_FIXTURE);
  assert.ok(ms.length >= 1, "fixtures/latex-language/defect.tex produced no findings at all");
  assert.deepEqual(
    ms.map((m) => `${m.line}:${m.text}`),
    ["30:will be released"],
    "the finding set of defect.tex drifted from the frozen measurement",
  );
  // The promise sits inside a `\caption{}`, which is the point: the defect fixture differs from
  // the clean one exactly in the prose the language spent a double lock to make visible.
  assert.ok(
    /\\caption\{[^}]*will be released/.test(DEFECT_SRC),
    "the defect fixture moved its promise out of the caption — it stopped exercising the " +
      "caption path the clean/defect pair was built around",
  );
  assert.ok(
    defect.text.includes("The full table will be released later."),
    "the caption carrying the defect is invisible in the projection",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// IV. THE LANGUAGE'S BOUNDARIES — pinned by assertions, not only by prose
// ═════════════════════════════════════════════════════════════════════════════
// A known limitation that lives only in a comment silently stops being known: it either gets
// "fixed" unnoticed, or gets quoted as current a year after it went away. The assertions below
// describe CURRENT behaviour. Each is an invitation to rewrite the language's header, not a ban
// on changing the code.
{
  // BOUNDARY 2: escaped characters are lost together with the macro name.
  const { text } = texToMdast(
    "\\documentclass{article}\n\\begin{document}\n" +
      String.raw`We cut 95\% of it, costing \$5 and A\&B.` +
      "\n\\end{document}\n",
  );
  assert.ok(
    text.includes("We cut 95   of it, costing   5 and A  B."),
    "the projection of escaped characters changed — rewrite boundary 2 in the language header:\n" + text,
  );
}
{
  // BOUNDARY 4: `\input{}` — the contents of the included file are invisible.
  const dir = join(TMP, "input-boundary");
  mkdirSync(join(dir, "sections"), { recursive: true });
  writeFileSync(join(dir, "sections/method.tex"), "The solver walks the syntax tree.\n");
  const src = [
    "\\documentclass{article}",
    "\\begin{document}",
    "\\section{Method}",
    "\\input{sections/method}",
    "\\end{document}",
    "",
  ].join("\n");
  const { text } = project("input-boundary", src);
  assert.ok(
    !text.includes("solver"),
    "the contents of `\\input{}` became visible — boundary 4 in the language header is stale",
  );
}
{
  // BOUNDARY 5: `\appendix` is inexpressible in a length-preserving projection (9 characters
  // against the 11 of `## Appendix`).
  const src = [
    "\\documentclass{article}",
    "\\begin{document}",
    "\\section{Results}",
    "We found four of the ten.",
    "\\appendix",
    "\\section{The full table}",
    "\\end{document}",
    "",
  ].join("\n");
  const { root } = project("appendix-boundary", src);
  const titles = headings(root).map((h) => h.title);
  assert.ok(
    !titles.some((t) => /^Appendix/.test(t)),
    "`\\appendix` started producing a heading — boundary 5 in the language header is stale",
  );
}
{
  // 🔴 BOUNDARY 13, found 2026-09-11 BY THIS HARNESS, by an assertion that expected the
  // opposite: `\citep{}` / `\citet{}` leak their key into the prose, while `\cite{}` does not.
  // All three are listed in OPAQUE, but OPAQUE blanks a macro name plus the arguments
  // unified-latex ATTACHED to it, and unified-latex has no signature for the natbib pair — so
  // `{someone2020}` comes back as a separate group node and survives as prose. For a paper
  // using natbib that means every citation key is a word in the prose stream.
  const keyed = (macro) => {
    const src = `\\documentclass{article}\n\\begin{document}\nWe saw it \\${macro}{keyABC} here.\n\\end{document}\n`;
    return project(`opaque-${macro}`, src).text.split("\n")[2];
  };
  assert.ok(!keyed("cite").includes("keyABC"), "`\\cite{}` started leaking its key");
  assert.ok(
    keyed("citep").includes("keyABC"),
    "`\\citep{}` stopped leaking its key — boundary 13 was fixed; rewrite it in the language " +
      "header instead of leaving a stale limitation on record",
  );
  assert.ok(
    keyed("citet").includes("keyABC"),
    "`\\citet{}` stopped leaking its key — boundary 13 was fixed; rewrite it in the language header",
  );
}
{
  // BOUNDARY 8: an inline `% eslint {...}` config does NOT work inside `.tex`
  // (`applyInlineConfig` returns empty), while `% eslint-disable-next-line` DOES.
  // ⚠️ This one runs on an in-process config rather than the repository's, and deliberately:
  // the file has to exist on disk (the rule reads it from disk, and a missing path makes it
  // silent for the wrong reason), and a `.tex` file written inside the repository would also
  // be picked up by the glob assertions in part V.
  const texBuild = (await import(join(HERE, "tex-build.mjs"))).default;
  const local = new ESLint({
    cwd: TMP,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.tex"],
        plugins: { tex: { languages: { latex: texLanguage }, rules: texBuild } },
        language: "tex/latex",
        rules: { "tex/future-promise": "warn" },
      },
    ],
  });
  const dir = join(TMP, "inline-config");
  mkdirSync(dir, { recursive: true });
  const body = [
    "\\documentclass[sigconf,screen]{acmart}",
    "\\begin{document}",
    "PLACEHOLDER",
    "The harness will be released later.",
    "\\end{document}",
    "",
  ];
  // Both halves: the same line fires without the directive, and is suppressed with it. A
  // suppression test that never saw the finding proves nothing.
  const withoutDirective = join(dir, "without.tex");
  writeFileSync(withoutDirective, body.filter((l) => l !== "PLACEHOLDER").join("\n"));
  const [bare] = await local.lintFiles([withoutDirective]);
  assert.deepEqual(
    bare.messages.map((m) => m.ruleId),
    ["tex/future-promise"],
    "the un-suppressed control produced no finding — the suppression test below would pass " +
      "for the wrong reason",
  );
  const withDirective = join(dir, "with.tex");
  writeFileSync(
    withDirective,
    body
      .map((l) =>
        l === "PLACEHOLDER"
          ? "% eslint-disable-next-line tex/future-promise -- the boundary-8 assertion needs it"
          : l,
      )
      .join("\n"),
  );
  const [suppressed] = await local.lintFiles([withDirective]);
  assert.deepEqual(
    suppressed.messages.map((m) => m.ruleId),
    [],
    "`% eslint-disable-next-line` stopped working inside `.tex` — boundary 8 is stale",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// V. CONFIG — the language is wired, over a NON-EMPTY glob
// ═════════════════════════════════════════════════════════════════════════════
{
  const config = (await import(join(ROOT, "eslint.config.mjs"))).default;
  const tex = config.find((b) => b.language === "tex/latex");
  assert.ok(tex, "eslint.config.mjs declares no block using the `tex/latex` language");
  assert.ok(
    tex.plugins?.tex?.languages?.latex === texLanguage,
    "the `.tex` block no longer wires up `latex-language.mjs` — the language stopped executing",
  );

  // 🔴 THE HALF WITHOUT WHICH ALL OF THE ABOVE IS DECORATION: the glob must match files that
  // exist. A language wired over an empty glob is never invoked, and the run is green with zero
  // findings — byte-identical to a run that checked everything. See
  // `scripts/rules-see-files.mjs` for the general check; this is the cheap local copy so that
  // this language's own wiring fails in this language's own test.
  const seen = (await real.lintFiles(["."]))
    .map((r) => relative(ROOT, r.filePath))
    .filter((f) => f.endsWith(".tex"));
  assert.ok(
    seen.length >= 4,
    "the `.tex` glob of eslint.config.mjs matched " + seen.length + " files; the fixtures alone " +
      "are four, so the language was invoked on less than its own test data: " + seen.join(", "),
  );
}
