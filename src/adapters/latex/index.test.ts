/**
 * The LaTeX adapter on real parses: the class line in each of its states, a preset's template, the
 * class `paperlint new` writes, the outline, and the rendered text. Trees come only from
 * `parseLatex`; the one helper that reads a node's position is tested on the shapes a position can
 * take.
 */
import type * as Ast from "@unified-latex/unified-latex-types";
import { describe, expect, it } from "vitest";
import { runText, spanIn, type ProsePiece } from "../../domain/tex-document.ts";
import {
  bodyEmphasis,
  bodyProse,
  documentBodyOf,
  documentClassOf,
  includesOf,
  inPlace,
  latexReader,
  macroPlace,
  mandatory,
  optional,
  outlineOf,
  parseLatex,
  parseTemplate,
  placeOf,
  renderedRuns,
  replaceDocumentClass,
  textOf,
} from "./index.ts";

const IEEE = { cls: "IEEEtran", options: ["conference", "compsoc"] };

describe("documentClassOf — the class line's three states", () => {
  it("a class: each option whitespace-collapsed, and the span of the whole macro, arguments included", () => {
    const src = "% x\n\\documentclass[ conference ,\n compsoc]{IEEEtran}\n";
    expect(documentClassOf(parseLatex(src))).toEqual({
      kind: "class",
      cls: "IEEEtran",
      options: ["conference", "compsoc"],
      place: {
        kind: "at",
        span: { start: 4, end: src.indexOf("}") + 1 },
      },
    });
  });

  it("🔴 empty: \\documentclass{} names no class, and stands where it stands — not missing", () => {
    expect(documentClassOf(parseLatex("%\n\\documentclass{}\n"))).toEqual({
      kind: "empty",
      place: { kind: "at", span: { start: 2, end: 16 } },
    });
  });

  it("ambiguous: two \\documentclass lines behind a switch, each read as a candidate in source order", () => {
    const src =
      "\\if\\x1\\documentclass{article}\\fi\\if\\x2\\documentclass[a]{b}\\fi";
    const line = documentClassOf(parseLatex(src));
    expect(
      line.kind === "ambiguous" &&
        line.candidates.map((c) => c.kind === "class" && c.cls),
    ).toEqual(["article", "b"]);
  });

  it("missing: no \\documentclass at the top of the tree", () => {
    expect(
      documentClassOf(parseLatex("\\begin{document}\\end{document}")),
    ).toEqual({ kind: "missing" });
  });

  it("a group in the class name and a paragraph break are read as text", () => {
    const line = documentClassOf(parseLatex("\\documentclass{{IEEE}\n\ntran}"));
    expect(line.kind === "class" && line.cls).toBe("IEEE tran");
  });
});

describe("placeOf / macroPlace — a node the parser gave no position is unplaced, never offset 0", () => {
  const at = (start: number, end: number) => ({
    start: { offset: start, line: 1, column: start + 1 },
    end: { offset: end, line: 1, column: end + 1 },
  });
  it("placeOf: a position is a span; none is unplaced", () => {
    expect(placeOf({ position: at(3, 7) })).toEqual({
      kind: "at",
      span: { start: 3, end: 7 },
    });
    expect(placeOf({})).toEqual({ kind: "unplaced" });
  });

  it("macroPlace: unplaced without a position; with one, to past the last argument that holds text", () => {
    const bare: Ast.Macro = { type: "macro", content: "documentclass" };
    expect(macroPlace(bare)).toEqual({ kind: "unplaced" });
    const withArgs: Ast.Macro = {
      type: "macro",
      content: "section",
      position: at(0, 8),
      args: [
        { type: "argument", content: [], openMark: "", closeMark: "" },
        {
          type: "argument",
          content: [{ type: "string", content: "A", position: at(9, 10) }],
          openMark: "{",
          closeMark: "}",
        },
        { type: "argument", content: [], openMark: "[", closeMark: "]" },
      ],
    };
    expect(macroPlace(withArgs)).toEqual({
      kind: "at",
      span: { start: 0, end: 11 },
    });
  });
});

describe("a macro with no arguments, and markup in a name", () => {
  const bare: Ast.Macro = { type: "macro", content: "foo" };
  it("has no mandatory or optional arguments, and its place is its name", () => {
    expect(mandatory(bare)).toEqual([]);
    expect(optional(bare)).toBe(undefined);
    expect(
      macroPlace({
        ...bare,
        position: {
          start: { offset: 2, line: 1, column: 3 },
          end: { offset: 6, line: 1, column: 7 },
        },
      }),
    ).toEqual({ kind: "at", span: { start: 2, end: 6 } });
  });

  it("textOf drops markup it cannot read as text, and reads nothing as empty", () => {
    expect(textOf([bare, { type: "string", content: "x" }])).toBe("x");
    expect(textOf(undefined)).toBe("");
  });
});

describe("parseTemplate — a preset's template", () => {
  it.each<[string, { cls: string; options: string[] } | null]>([
    ["\\documentclass[conference,compsoc]{IEEEtran}", IEEE],
    ["article", { cls: "article", options: [] }],
    [" acmart\n", { cls: "acmart", options: [] }],
    ["two words", null],
    ["% c\n\\documentclass{article}\n", { cls: "article", options: [] }],
    ["\\documentclass{article} trailing", null],
    ["\\documentclass[a]{}", null],
    ["", null],
  ])("%j → %j", (text, want) => {
    expect(parseTemplate(text)).toEqual(want);
  });
});

const replaced = (src: string) => replaceDocumentClass(parseLatex(src), IEEE);

describe("replaceDocumentClass — the class `paperlint new` writes", () => {
  it("replaces the whole line, arguments included, and keeps everything around it", () => {
    expect(replaced("% c\n\\documentclass[11pt]{article}\n\\title{x}\n")).toBe(
      "% c\n\\documentclass[conference,compsoc]{IEEEtran}\n\\title{x}\n",
    );
  });

  it("a class that already satisfies the template keeps the author's own options", () => {
    const src = "\\documentclass[compsoc,conference,a4paper]{IEEEtran}\nx";
    expect(replaced(src)).toBe(src);
  });

  it("the right class missing a required option keeps the author's options and adds the missing ones", () => {
    expect(
      replaced("\\documentclass[review,anonymous,conference]{IEEEtran}\nx"),
    ).toBe("\\documentclass[review,anonymous,conference,compsoc]{IEEEtran}\nx");
  });

  it("an option with a braced value keeps its braces, its commas and its spacing", () => {
    expect(replaced("\\documentclass[review, foo={a,b}]{IEEEtran}\nx")).toBe(
      "\\documentclass[review, foo={a,b},conference,compsoc]{IEEEtran}\nx",
    );
  });

  it("🔴 a source with several \\documentclass lines is returned as it is: which branch builds is not known", () => {
    const src =
      "\\if\\x1\\documentclass{article}\\fi\\if\\x2\\documentclass{IEEEtran}\\fi";
    expect(replaced(src)).toBe(src);
  });

  it("no class, or an empty one, is returned as it is", () => {
    expect(replaced("just text")).toBe("just text");
    expect(replaced("\\documentclass{}\nx")).toBe("\\documentclass{}\nx");
  });

  it("the port does the same over a source", () => {
    expect(
      latexReader.withDocumentClass("\\documentclass{article}", IEEE),
    ).toBe("\\documentclass[conference,compsoc]{IEEEtran}");
  });
});

describe("replaceDocumentClass — missing options are added in place, the author's bytes kept", () => {
  it("🔴 the missing options go before the `]`: the author's bytes, a comment included, stay as written", () => {
    expect(replaced("\\documentclass[foo=bar% note\nbaz]{IEEEtran}\nx")).toBe(
      "\\documentclass[foo=bar% note\nbaz,conference,compsoc]{IEEEtran}\nx",
    );
    const acm = "\\documentclass[review,% reason\nanonymous]{acmart}\nx";
    expect(
      replaceDocumentClass(parseLatex(acm), {
        cls: "acmart",
        options: ["sigconf"],
      }),
    ).toBe("\\documentclass[review,% reason\nanonymous,sigconf]{acmart}\nx");
  });

  it("a trailing comment in the options: the missing ones go on the next line, before the `]`", () => {
    expect(replaced("\\documentclass[review% c\n]{IEEEtran}")).toBe(
      "\\documentclass[review% c\n,conference,compsoc]{IEEEtran}",
    );
  });

  it("no options, an empty `[]`, a blank `[ ]`: the options are written without a stray comma", () => {
    expect(replaced("\\documentclass{IEEEtran}\nx")).toBe(
      "\\documentclass[conference,compsoc]{IEEEtran}\nx",
    );
    expect(replaced("\\documentclass[]{IEEEtran}")).toBe(
      "\\documentclass[conference,compsoc]{IEEEtran}",
    );
    expect(replaced("\\documentclass[ ]{IEEEtran}")).toBe(
      "\\documentclass[ conference,compsoc]{IEEEtran}",
    );
  });

  it("reading the options: a line comment joins its two sides with no space, as TeX does", () => {
    const read = (src: string) => {
      const line = documentClassOf(parseLatex(src));
      return line.kind === "class" && line.options;
    };
    expect(read("\\documentclass[review,% reason\nanonymous]{acmart}")).toEqual(
      ["review", "anonymous"],
    );
    expect(read("\\documentclass[foo=bar% note\nbaz]{IEEEtran}")).toEqual([
      "foo=barbaz",
    ]);
  });
});

describe("outlineOf — a heading's title", () => {
  it("keeps the text of formatting macros and drops keys such as a label", () => {
    const o = outlineOf(
      parseLatex("\\section*{LLM \\textbf{Usage} Statement\\label{s:llm}}"),
    );
    expect(o.sections.map((h) => h.title)).toEqual(["LLM Usage Statement"]);
  });
});

describe("outlineOf — a formatting macro's text is its last mandatory argument", () => {
  it.each<[string, string]>([
    [
      "\\section*{\\textcolor{red}{LLM Usage Statement}}",
      "LLM Usage Statement",
    ],
    [
      "\\section*{LLM \\emph{Usage} \\textbf{Statement}}",
      "LLM Usage Statement",
    ],
    ["\\section*{See \\href{https://x.org}{the site}}", "See the site"],
    [
      "\\section*{\\texorpdfstring{LLM Usage Statement}{Short}}",
      "LLM Usage Statement",
    ],
    ["\\section*{\\color{red}LLM Usage Statement}", "LLM Usage Statement"],
    ["\\section*{LLM~Usage~Statement}", "LLM Usage Statement"],
    [
      "\\section*{\\colorbox{yellow}{LLM Usage} Statement}",
      "LLM Usage Statement",
    ],
    [
      "\\section*{\\fontsize{10}{12}\\selectfont LLM \\vspace{1em}Usage\\hspace{2pt} Statement}",
      "LLM Usage Statement",
    ],
    [
      "\\section*{\\setlength{\\parskip}{0pt}\\addtolength{\\parskip}{1pt}LLM Usage Statement}",
      "LLM Usage Statement",
    ],
  ])("%s → %s", (src, title) => {
    expect(outlineOf(parseLatex(src)).sections.map((h) => h.title)).toEqual([
      title,
    ]);
  });
});

describe("outlineOf", () => {
  it("sections in order with titles collapsed, the first back matter, and the document's end", () => {
    const src =
      "\\documentclass{article}\\section{Pre}\n\\begin{document}\n\\section{A  B}\n" +
      "\\section*{C}\n\\appendix\n\\section{D}\n\\bibliography{r}\n\\end{document}";
    const o = outlineOf(parseLatex(src));
    expect(o.sections.map((h) => h.title)).toEqual(["A B", "C", "D"]);
    expect(o.backMatter).toBe(src.indexOf("\\appendix"));
    expect(o.end).toBe(src.length - 1);
    const [a] = o.sections;
    expect(
      a?.place.kind === "at" && src.slice(a.place.span.start, a.place.span.end),
    ).toBe("\\section{A  B}");
  });

  it("a bibliography environment is back matter too; a fragment has no end; no back matter is null", () => {
    const src = "\\section{A}\\begin{thebibliography}{1}\\end{thebibliography}";
    expect(latexReader.outline(src)).toMatchObject({
      backMatter: src.indexOf("\\begin"),
      end: null,
    });
    expect(latexReader.outline("\\section{A}").backMatter).toBe(null);
  });
});

describe("outlineOf — a heading that is never rendered is not in the outline", () => {
  it.each<[string, string]>([
    [
      "a comment environment",
      "\\begin{comment}\\section{Hidden}\\end{comment}",
    ],
    ["a \\newcommand body", "\\newcommand{\\x}{\\section{Hidden}}"],
    ["a \\def body", "\\def\\y{\\section{Hidden}}"],
    ["a \\newenvironment body", "\\newenvironment{e}{\\section{Hidden}}{}"],
  ])("%s", (_, hidden) => {
    const src = `\\begin{document}${hidden}\\section{Real}\\end{document}`;
    expect(outlineOf(parseLatex(src)).sections.map((h) => h.title)).toEqual([
      "Real",
    ]);
  });
});

describe("\\iffalse … \\fi — a branch TeX never reads is not in the tree any reader walks", () => {
  const dead = [
    "A",
    "\\iffalse",
    "\\section{Old Title}",
    "dead words",
    "\\ifx\\a\\b nested\\fi",
    "still dead",
    "\\fi",
    "B",
  ].join("\n");
  const doc = (body: string) => `\\begin{document}\n${body}\n\\end{document}`;

  it("🔴 outline, headings and rendered text skip it, nested conditionals included", () => {
    const t = parseLatex(doc(dead));
    expect(outlineOf(t).sections).toEqual([]);
    expect(latexReader.headings(doc(dead))).toEqual([]);
    // Guards: the dead strings are gone from the list itself, so A and B are one run.
    expect(
      renderedRuns(t).map((r) => runText(r).replace(/\s+/gu, " ").trim()),
    ).toEqual(["A B"]);
  });

  it("the \\else branch of an \\iffalse is read, and the text after its \\fi", () => {
    const src = doc(
      "\\iffalse\n\\section{Old}\n\\else\n\\section{New}\n\\fi\n\\section{After}",
    );
    expect(outlineOf(parseLatex(src)).sections.map((h) => h.title)).toEqual([
      "New",
      "After",
    ]);
  });

  it("inside a group too, and `\\ifthenelse` (which has no \\fi) does not swallow the rest", () => {
    const src = doc(
      "{\\iffalse\\section{Old}\\ifthenelse{x}{y}{z}\\fi}\\section{Real}",
    );
    expect(outlineOf(parseLatex(src)).sections.map((h) => h.title)).toEqual([
      "Real",
    ]);
  });

  it("inside an environment with arguments, in math, and an \\else holding its own conditional", () => {
    const src = doc(
      [
        "\\begin{minipage}{4cm}\\iffalse\\section{Old}\\fi\\section{Kept}\\end{minipage}",
        "$x \\iffalse y \\fi$ \\[ z \\] \\begin{align*} a \\end{align*}",
        "\\iffalse\\section{Old}\\else\\ifx\\a\\b\\section{Inner}\\fi\\section{New}\\fi",
      ].join("\n"),
    );
    expect(outlineOf(parseLatex(src)).sections.map((h) => h.title)).toEqual([
      "Kept",
      "Inner",
      "New",
    ]);
  });

  it("an \\iffalse that is never closed leaves out everything after it, as TeX does", () => {
    const src = doc("\\section{Real}\n\\iffalse\n\\section{Old}");
    expect(outlineOf(parseLatex(src)).sections.map((h) => h.title)).toEqual([
      "Real",
    ]);
  });
});

describe("renderedRuns", () => {
  it("runs of strings and spaces, each character mapped to its source offset", () => {
    const src = "A~B \\emph{C D}\n\n E";
    const runs = renderedRuns(parseLatex(src));
    expect(runs.map(runText)).toEqual(["A B ", "C D", " E"]);
    const [first] = runs;
    expect(first && spanIn(first, 2, 3)).toEqual({ start: 2, end: 3 });
  });

  it("comments, math, code, keys and the bibliography are not text a reader sees", () => {
    const src =
      "x % AISec\n$AISec$ \\cite{AISec} \\label{AISec} \\url{https://AISec.cc}\n" +
      "\\begin{verbatim}AISec\\end{verbatim}\\begin{thebibliography}{1}\\bibitem{a} AISec\\end{thebibliography}";
    expect(
      latexReader
        .renderedRuns(src)
        .map(runText)
        .some((t) => t.includes("AISec")),
    ).toBe(false);
  });

  it("a citation's key is hidden, its notes in square brackets are text", () => {
    const runs = latexReader
      .renderedRuns("x \\citep[Presented at AISec][p.~3]{zzkey} y")
      .map(runText);
    expect(runs.some((t) => t.includes("Presented at AISec"))).toBe(true);
    expect(runs.some((t) => t.includes("zzkey"))).toBe(false);
  });

  it("\\href: its URL is hidden, its link text is text", () => {
    const runs = latexReader
      .renderedRuns("x \\href{https://example.org/AISec}{the zzlink text} y")
      .map(runText);
    expect(runs.some((t) => t.includes("AISec"))).toBe(false);
    expect(runs.some((t) => t.includes("the zzlink text"))).toBe(true);
  });

  it("a macro definition's body is read like prose: the rule does not expand macros", () => {
    const src =
      "\\newcommand{\\oldvenue}{AISec} \\renewcommand\\b{BISec} \\def\\c{CISec} x";
    const text = latexReader.renderedRuns(src).map(runText).join("|");
    expect(
      ["AISec", "BISec", "CISec", "x"].filter((w) => text.includes(w)),
    ).toEqual(["AISec", "BISec", "CISec", "x"]);
  });

  it("the options of other key macros stay hidden: they are settings, not prose", () => {
    const src = "\\includegraphics[AISec]{f} \\usepackage[AISec]{p}";
    expect(
      latexReader
        .renderedRuns(src)
        .map(runText)
        .some((t) => t.includes("AISec")),
    ).toBe(false);
  });
});

describe("inPlace — a node the parser gave no position yields nothing, never offset 0", () => {
  it("a span is handed to f; an unplaced node gives the empty list", () => {
    const f = (s: { start: number; end: number }) => [s.start];
    expect(inPlace({ kind: "at", span: { start: 3, end: 5 } }, f)).toEqual([3]);
    expect(inPlace({ kind: "unplaced" }, f)).toEqual([]);
  });
});

/** A prose piece, readable in an expectation: text as itself, a mark or math in angle brackets. */
const pieceShape = (x: ProsePiece): string =>
  x.kind === "text"
    ? x.segment.text
    : x.kind === "owner"
      ? `<${x.owner}@${String(x.span.start)}>`
      : `<math ${x.tex}>`;

describe("bodyProse — passages a sentence cannot cross, with the marks that say where a claim comes from", () => {
  it("text, a citation mark, a reference mark and math, in source order; a footnote is its own passage", () => {
    const src =
      "\\begin{document}\nA~\\cite{k} B \\ref{s} $x$.\\footnote{F.}\n\n\\section{H}C\\%\n\\end{document}";
    const at = (s: string) => src.indexOf(s);
    const shape = bodyProse(parseLatex(src)).map((p) =>
      p.pieces.map(pieceShape),
    );
    expect(shape).toEqual([
      [
        "A",
        " ",
        `<citation@${String(at("\\cite"))}>`,
        " ",
        "B",
        " ",
        `<reference@${String(at("\\ref"))}>`,
        " ",
        "<math $x$>",
        ".",
      ],
      ["F", "."],
      ["C", "%"],
    ]);
  });

  it("a character macro's character stands at the macro's last source character", () => {
    const src = "C\\%";
    const [p] = bodyProse(parseLatex(src));
    expect(p?.pieces.at(-1)).toEqual({
      kind: "text",
      segment: { text: "%", at: 2 },
    });
  });
});

describe("bodyProse — run-in headings and list items", () => {
  /** The text of each passage of `src`'s body, marks and math left out. */
  const texts = (src: string): readonly string[] =>
    bodyProse(parseLatex(src)).map((p) =>
      p.pieces
        .map((x) => (x.kind === "text" ? x.segment.text : ""))
        .join("")
        .trim(),
    );

  it("🔴 a run-in heading — a bold, italic or emphasised phrase ending in `.` or `:` that opens a paragraph or an item — is a heading, left out", () => {
    expect(
      texts(
        "\\begin{document}\n\\section{Method}\\label{sec:m}\n\\vspace{2pt}\\textbf{Correctness gate.} Each task carries a check.\n\n\\noindent \\textit{\\textbf{VPNs:}} GPT recommended them.\n\\begin{itemize}\n\\item \\emph{Scale.} It grows.\n\\end{itemize}\n\\end{document}",
      ),
    ).toEqual([
      "Each task carries a check.",
      "GPT recommended them.",
      "It grows.",
    ]);
  });

  it("🔴 a list item's text is prose, each item its own passage; its label is not — and an \\item outside a list ends a passage", () => {
    expect(
      texts(
        "\\begin{document}\n\\begin{itemize}\n\\item[A:] It grows.\n\\item It holds.\n\\end{itemize}\nAfter \\item the list.\n\\end{document}",
      ),
    ).toEqual(["It grows.", "It holds.", "After", "the list."]);
  });

  it("a run-in heading holding a footnote or a citation is still a heading, left out whole", () => {
    expect(
      texts(
        "\\begin{document}\n\\textbf{Scale\\footnote{F.}.} It grows.\n\n\\textbf{See~\\cite{k}:} It holds.\n\\end{document}",
      ),
    ).toEqual(["It grows.", "It holds."]);
  });

  it("🔴 braces around a run-in heading change nothing: `{\\textbf{Side-channel eavesdropping:}}` is a heading, left out", () => {
    // barovox-acsac24, Chapters/09_Related_Works.tex, writes its run-in headings this way.
    expect(
      texts(
        "\\begin{document}\n{\\textbf{Side-channel eavesdropping:}} It has been studied.\n\\end{document}",
      ),
    ).toEqual(["It has been studied."]);
  });

  it("the same markup inside a sentence, or without the closing mark, is prose", () => {
    expect(
      texts(
        "\\begin{document}\nWe \\textbf{do not.} stop.\n\n\\textbf{Bold} opens this one.\n\\end{document}",
      ),
    ).toEqual(["We do not. stop.", "Bold opens this one."]);
  });
});

describe("includesOf — the files a source pulls in", () => {
  it("each of \\input, \\include and \\subfile, with the path as written and the macro's span", () => {
    const src = "a\\input{sections/1-intro}\n\\include{b.tex}\\subfile{c_d}";
    expect(includesOf(parseLatex(src))).toEqual([
      {
        macro: "input",
        target: "sections/1-intro",
        span: { start: 1, end: 25 },
      },
      { macro: "include", target: "b.tex", span: { start: 26, end: 41 } },
      { macro: "subfile", target: "c_d", span: { start: 41, end: 54 } },
    ]);
  });

  it("\\input without braces (TeX's own form) names the file up to the next space", () => {
    const targets = (src: string) =>
      includesOf(parseLatex(src)).map((i) => i.target);
    expect(targets("\\input sections/a \n")).toEqual(["sections/a"]);
    // At the end of the source, the name runs to it.
    expect(targets("\\input sections/a")).toEqual(["sections/a"]);
  });

  it("an \\input with nothing after it names no file", () => {
    expect(includesOf(parseLatex("\\input"))).toEqual([]);
  });

  it("not in a comment, not in a macro definition's body, not an empty argument", () => {
    const src = "% \\input{old}\n\\newcommand{\\x}{\\input{y}}\\input{}";
    expect(includesOf(parseLatex(src))).toEqual([]);
  });

  it("the port answers the same over a source", () => {
    expect(latexReader.includes("\\input{a}").map((i) => i.target)).toEqual([
      "a",
    ]);
  });
});

describe("documentBodyOf — the body of a source that is a document of its own", () => {
  it("from the first to the last node inside the document environment", () => {
    const src =
      "\\documentclass{x}\\begin{document}BODY and more\\end{document}";
    const body = documentBodyOf(parseLatex(src));
    expect(body && src.slice(body.start, body.end)).toBe("BODY and more");
    expect(latexReader.documentBody(src)).toEqual(body);
  });

  it("a body ending in a macro ends after that macro's arguments, not after its name", () => {
    const src = "\\begin{document}\nText.\n\\input{sections/a}\\end{document}";
    const body = documentBodyOf(parseLatex(src));
    expect(body && src.slice(body.start, body.end)).toBe(
      "Text.\n\\input{sections/a}",
    );
  });

  it("none without a document environment, or with an empty one", () => {
    expect(documentBodyOf(parseLatex("just text"))).toBe(null);
    expect(documentBodyOf(parseLatex("\\begin{document}\\end{document}"))).toBe(
      null,
    );
  });
});

describe("bodyEmphasis — phrases set apart inside the body's prose, and where they stand", () => {
  /** Each phrase as `style/place: text`. */
  const shape = (src: string): readonly string[] =>
    bodyEmphasis(parseLatex(src)).map(
      (e) => `${e.style}/${e.place}: ${e.text}`,
    );

  it("🔴 a bold phrase inside a sentence is inline; one opening a paragraph or an item is a label (opening)", () => {
    expect(
      shape(
        "\\begin{document}\nWe find that \\textbf{the guards react to the word}.\n\n\\textbf{Varying the volume}. We vary it.\n\\begin{itemize}\n\\item \\textbf{A corpus of questions}: we release it.\n\\end{itemize}\n\\end{document}",
      ),
    ).toEqual([
      "bold/inline: the guards react to the word",
      "bold/opening: Varying the volume",
      "bold/opening: A corpus of questions",
    ]);
  });

  it("🔴 never a heading, a run-in heading, a caption, a table, or anything after the bibliography", () => {
    expect(
      shape(
        "\\begin{document}\n\\section{\\textbf{Big}}\n\\textbf{Threats.} None \\emph{here}.\n\\begin{table}\\caption{\\textbf{C}}\\begin{tabular}{l}\\textbf{cell}\\end{tabular}\\end{table}\n\\bibliography{refs}\nAfter \\textbf{this}.\n\\end{document}",
      ),
    ).toEqual(["italic/inline: here"]);
  });

  it("braces around a label change nothing: `{\\textbf{Filtering}}.` opening a paragraph is a label", () => {
    // barovox-acsac24, Chapters/08_Discussion.tex.
    expect(
      shape(
        "\\begin{document}\n{\\textbf{Increasing the distance}}. The proximity matters.\n\\end{document}",
      ),
    ).toEqual(["bold/opening: Increasing the distance"]);
  });
});

describe("bodyEmphasis — each style, and edge cases", () => {
  /** Each phrase as `style/place: text`. */
  const shape = (src: string): readonly string[] =>
    bodyEmphasis(parseLatex(src)).map(
      (e) => `${e.style}/${e.place}: ${e.text}`,
    );

  it("each style: \\emph and \\textit italic, \\underline underline, a `{\\bfseries …}` group bold; a footnote's phrase counts", () => {
    expect(
      shape(
        "\\begin{document}\nA \\emph{b} c \\textit{d} e \\underline{f} g {\\bfseries h i} j.\\footnote{In \\textbf{k}.}\n\\end{document}",
      ),
    ).toEqual([
      "italic/inline: b",
      "italic/inline: d",
      "underline/inline: f",
      "bold/inline: h i",
      "bold/inline: k",
    ]);
  });

  it("an empty bold macro sets nothing apart, opening a paragraph or not", () => {
    expect(
      shape(
        "\\begin{document}\n\\textbf{} Opens. We \\textbf{ } go.\n\\end{document}",
      ),
    ).toEqual([]);
  });

  it("an environment opening a paragraph opens nothing for the phrases inside it", () => {
    expect(
      shape(
        "\\begin{document}\n\\begin{quote}\nWe say \\textbf{this}.\n\\end{quote}\n\\end{document}",
      ),
    ).toEqual(["bold/inline: this"]);
  });

  it("the span is the macro with its argument, where the source has it", () => {
    const src = "\\begin{document}\nWe \\textbf{see it}.\n\\end{document}";
    const [e] = bodyEmphasis(parseLatex(src));
    expect(e && src.slice(e.span.start, e.span.end)).toBe("\\textbf{see it}");
  });
});

describe("latexReader.filecontents — the blocks that write a file, where they stand", () => {
  const SRC =
    "\\documentclass{x}\n" +
    "\\begin{filecontents*}[overwrite]{refs.bib}\n@misc{a, title={A}}\n\\end{filecontents*}\n" +
    "\\begin{document}\n" +
    "\\begin{filecontents}{\\jobname.bib}\n@misc{b, title={B}}\n\\end{filecontents}\n" +
    "\\end{document}\n" +
    "\\begin{filecontents}{late.bib}\n@misc{c}\n\\end{filecontents}\n";

  it("each live block, in order: the file it writes (\\jobname expanded), [overwrite], its span and body", () => {
    const blocks = latexReader.filecontents(SRC, "paper");
    expect(
      blocks.map((b) => [
        b.writes,
        b.overwrite,
        SRC.slice(b.body.start, b.body.end),
      ]),
    ).toEqual([
      ["refs.bib", true, "@misc{a, title={A}}\n"],
      ["paper.bib", false, "@misc{b, title={B}}\n"],
    ]);
    expect(SRC.slice(blocks[0]?.span.start, blocks[0]?.span.end)).toMatch(
      /^\\begin\{filecontents\*\}.*\\end\{filecontents\*\}$/s,
    );
  });

  it("a block inside a comment, or after \\end{document}, is not one TeX runs", () => {
    expect(
      latexReader.filecontents(
        "% \\begin{filecontents}{x.bib}\n% @misc{z}\n% \\end{filecontents}\n\\begin{document}\n\\end{document}\n",
        "paper",
      ),
    ).toEqual([]);
  });

  it("a block that names no file writes none", () => {
    expect(
      latexReader.filecontents(
        "\\begin{filecontents}\n@misc{z}\n\\end{filecontents}\n\\begin{document}\n\\end{document}\n",
        "paper",
      ),
    ).toEqual([]);
  });
});
