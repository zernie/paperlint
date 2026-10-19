/**
 * The abstract as plain text, from `\begin{abstract}…\end{abstract}` in the paper's source: the
 * author's argument-less macros expanded, TeX's ligatures for dashes and quotes, citations and
 * comments dropped — and anything else refused by name and place, never guessed.
 */
import { describe, expect, it } from "vitest";
import type * as Ast from "@unified-latex/unified-latex-types";
import { abstractOfTree } from "./abstract.ts";
import { latexReader } from "./index.ts";

const doc = (preamble: string, abstract: string): string =>
  `\\documentclass{article}\n${preamble}\n\\begin{document}\n\\begin{abstract}\n${abstract}\n\\end{abstract}\n\\end{document}\n`;

const text = (preamble: string, abstract: string) =>
  latexReader.abstractText(doc(preamble, abstract));

describe("abstractText — what TeX prints, as plain text", () => {
  it("words, spaces and paragraphs collapse to one paragraph", () => {
    expect(text("", "One  line,\nand\n\nanother.")).toEqual({
      ok: true,
      value: "One line, and another.",
    });
  });

  it("🔴 argument-less macros of the author's own are expanded — \\newcommand, \\renewcommand, \\def — nested too", () => {
    expect(
      text(
        "\\newcommand{\\numX}{83}\\renewcommand\\tool{GateBench}\\def\\pct{\\numX\\%}",
        "\\tool{} blocked \\numX{} attacks (\\pct) and \\tool\\ held.",
      ),
    ).toEqual({
      ok: true,
      value: "GateBench blocked 83 attacks (83%) and GateBench held.",
    });
  });

  it("TeX's ligatures: -- and --- as dashes, `` '' ` ' as curly quotes, ~ as a space", () => {
    expect(
      text("", "pages 1--2---done; ``quoted'' and `single', it's~here."),
    ).toEqual({
      ok: true,
      value: "pages 1–2—done; “quoted” and ‘single’, it’s here.",
    });
  });

  it("citations and comments are dropped; formatting commands say what their argument says", () => {
    expect(
      text(
        "",
        "As shown \\cite{a,b} and \\citep[p.~3]{c}, \\emph{this} \\textbf{is} \\texttt{code}. % a comment\nNext.% glued\nOn.",
      ),
    ).toEqual({ ok: true, value: "As shown and, this is code. Next.On." });
  });

  it("escaped characters, \\ldots, and math that is only digits and symbols", () => {
    expect(
      text(
        "",
        "50\\% \\& more\\ldots{} up to $3\\times$ and $\\le 5$ ($p<0.05$).",
      ),
    ).toEqual({
      ok: true,
      value: "50% & more… up to 3× and ≤ 5 (p<0.05).",
    });
  });
});

describe("abstractText — refused by name and place, never guessed", () => {
  it("🔴 a macro nobody defined", () => {
    const r = text("", "We use \\toolname{} here.");
    expect(r.ok ? r : r.error).toMatchObject({
      kind: "unreadable",
      what: "\\toolname, which no \\newcommand, \\renewcommand or \\def in the paper defines",
    });
  });

  it("🔴 a macro that takes arguments — \\newcommand with [n], \\def with #1", () => {
    for (const preamble of [
      "\\newcommand{\\two}[1]{x#1}",
      "\\def\\two#1{x#1}",
    ]) {
      const r = text(preamble, "See \\two{a}.");
      expect(r.ok ? r : r.error).toMatchObject({
        kind: "unreadable",
        what: "\\two, which takes arguments",
      });
    }
  });

  it("🔴 math beyond digits and symbols, and any other construct", () => {
    const math = text("", "Accuracy $\\alpha_i$ rises.");
    expect(math.ok ? math : math.error).toMatchObject({
      kind: "unreadable",
      what: "the math $\\alpha_i$",
    });
    const env = text("", "A list:\\begin{itemize}\\item one\\end{itemize}");
    expect(env.ok ? env : env.error).toMatchObject({
      kind: "unreadable",
      what: "the itemize environment",
    });
  });

  it("the place is the offset of the construct in the source", () => {
    const src = doc("", "Fine. \\nope{} here.");
    const r = latexReader.abstractText(src);
    expect(r.ok ? -1 : r.error.kind === "unreadable" && r.error.at).toBe(
      src.indexOf("\\nope"),
    );
  });

  it("no abstract environment: said so", () => {
    expect(
      latexReader.abstractText(
        "\\documentclass{article}\\begin{document}Body.\\end{document}",
      ),
    ).toEqual({ ok: false, error: { kind: "none" } });
  });

  it("a macro defined in terms of itself is refused, not expanded forever", () => {
    const r = text("\\def\\loop{\\loop}", "A \\loop.");
    expect(r.ok ? r : r.error).toMatchObject({
      kind: "unreadable",
      what: "\\loop, which expands into itself",
    });
  });
});

describe("abstractText — the edges of what the source may hold", () => {
  it("malformed definitions define nothing; an author's macro reads inside math too", () => {
    expect(
      text(
        "\\newcommand{oops}{x}\\newcommand{\\half}\\def{y}{z}\\newcommand{\\n}{83}",
        "We saw $\\n\\%$ of runs.",
      ),
    ).toEqual({ ok: true, value: "We saw 83% of runs." });
  });

  it.each([
    ["$a@b$", "the math $a@b$"],
    ["${x}$", "the math ${x}$"],
    ["\\begin{equation}x\\end{equation}", "the equation environment"],
    ["\\[x\\]", "the displaymath"],
  ])("%s is refused as %s", (body, what) => {
    const r = text("", `See ${body} here.`);
    expect(r.ok ? r : r.error).toMatchObject({ kind: "unreadable", what });
  });

  it("a node the parser gave no position is refused at -1, and \\def without arguments defines nothing", () => {
    const tree: Ast.Root = {
      type: "root",
      content: [
        { type: "macro", content: "def" },
        {
          type: "environment",
          env: "abstract",
          content: [
            { type: "inlinemath", content: [{ type: "string", content: "@" }] },
          ],
        },
      ],
    };
    expect(abstractOfTree(tree, "")).toEqual({
      ok: false,
      error: { kind: "unreadable", what: "the math ", at: -1 },
    });
  });
});
