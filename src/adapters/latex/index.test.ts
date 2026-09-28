/**
 * The LaTeX adapter on real parses: the class line in each of its states, a preset's template, the
 * class `paperlint new` writes, the outline, and the rendered text. Trees come only from
 * `parseLatex`; the one helper that reads a node's position is tested on the shapes a position can
 * take.
 */
import type * as Ast from "@unified-latex/unified-latex-types";
import { describe, expect, it } from "vitest";
import { runText, spanIn } from "../../domain/tex-document.ts";
import {
  documentClassOf,
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
