/**
 * The structure the venue-conformance rules read off a LaTeX source (`latex-structure.ts`): the
 * `\documentclass`, a preset's template, and the class `paperlint new` writes. Real sources go
 * through the parser; the node shapes the parser never emits (no position, an argument without
 * content) are handed in as trees, because the functions keep reading them instead of throwing.
 */
import { describe, expect, it } from "vitest";
import type { TexNode, TexRoot } from "./latex-language.ts";
import {
  collapse,
  documentClassLine,
  documentClassOf,
  parseLatex,
  parseTemplate,
  replaceDocumentClass,
  withDocumentClass,
} from "./latex-structure.ts";

const str = (content: string): TexNode => ({ type: "string", content });

describe("documentClassOf", () => {
  it("reads the class and each option, whitespace collapsed, and the span of the whole macro", () => {
    const src = "% x\n\\documentclass[ conference ,\n compsoc]{IEEEtran}\n";
    expect(documentClassOf(parseLatex(src))).toEqual({
      cls: "IEEEtran",
      options: ["conference", "compsoc"],
      span: { start: 4, end: src.indexOf("}") + 1 },
    });
  });

  it("no \\documentclass, or one naming no class: null", () => {
    expect(
      documentClassOf(parseLatex("\\begin{document}\\end{document}")),
    ).toBe(null);
    expect(documentClassOf(parseLatex("\\documentclass[a]{}"))).toBe(null);
  });

  it("reads the shapes the parser never emits: no args, no position, a group, a paragraph break", () => {
    const bare: TexRoot = {
      content: [{ type: "macro", content: "documentclass" }],
    };
    expect(documentClassOf(bare)).toBe(null);
    const odd: TexRoot = {
      content: [
        {
          type: "macro",
          content: "documentclass",
          args: [
            { type: "argument", openMark: "[" },
            {
              type: "argument",
              openMark: "{",
              content: [
                { type: "group", content: [str("IEEE")] },
                { type: "parbreak" },
                { type: "argument", content: [str("tran")] },
                { type: "comment", content: "ignored" },
              ],
            },
          ],
        },
      ],
    };
    expect(documentClassOf(odd)).toEqual({
      cls: "IEEE tran",
      options: [],
      span: { start: 0, end: 0 },
    });
  });
});

describe("parseTemplate — a preset's template", () => {
  it.each<[string, string | null, string[] | null]>([
    [
      "\\documentclass[conference,compsoc]{IEEEtran}",
      "IEEEtran",
      ["conference", "compsoc"],
    ],
    ["article", "article", []],
    [" acmart\n", "acmart", []],
    ["two words", null, null],
    ["\\documentclass[a]{}", null, null],
    ["", null, null],
  ])("%j → %s %j", (text, cls, options) => {
    expect(parseTemplate(text)).toEqual(cls === null ? null : { cls, options });
  });

  it("documentClassLine writes it back; with no options, no brackets", () => {
    expect(
      documentClassLine({
        cls: "IEEEtran",
        options: ["conference", "compsoc"],
      }),
    ).toBe("\\documentclass[conference,compsoc]{IEEEtran}");
    expect(documentClassLine({ cls: "article", options: [] })).toBe(
      "\\documentclass{article}",
    );
  });
});

describe("withDocumentClass — the class `paperlint new` writes", () => {
  const IEEE = { cls: "IEEEtran", options: ["conference", "compsoc"] };

  it("replaces the whole line, arguments included, and keeps everything around it", () => {
    expect(
      withDocumentClass(
        "% c\n\\documentclass[11pt]{article}\n\\title{x}\n",
        IEEE,
      ),
    ).toBe("% c\n\\documentclass[conference,compsoc]{IEEEtran}\n\\title{x}\n");
  });

  it("a class that already satisfies the template keeps the author's own options", () => {
    const src = "\\documentclass[compsoc,conference,a4paper]{IEEEtran}\nx";
    expect(withDocumentClass(src, IEEE)).toBe(src);
  });

  it("a source with no \\documentclass is returned as it is", () => {
    expect(withDocumentClass("just text", IEEE)).toBe("just text");
  });

  it("an argument with no content or no position does not move the end; one with no closing mark ends at its text", () => {
    const root: TexRoot = {
      content: [
        {
          type: "macro",
          content: "documentclass",
          position: {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 14, line: 1, column: 15 },
          },
          args: [
            { type: "argument", openMark: "[" },
            { type: "argument", openMark: "{", content: [str("article")] },
            {
              type: "argument",
              content: [
                {
                  type: "string",
                  content: "x",
                  position: {
                    start: { offset: 21, line: 1, column: 22 },
                    end: { offset: 22, line: 1, column: 23 },
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    // The second argument has no position: skipped. The third ends at 22 and has no closing mark.
    expect(replaceDocumentClass("\\documentclass{article}", root, IEEE)).toBe(
      "\\documentclass[conference,compsoc]{IEEEtran}}",
    );
  });
});

describe("collapse", () => {
  it("collapses every run of whitespace, newlines included, and trims", () => {
    expect(collapse("  LLM   Usage\n Statement ")).toBe("LLM Usage Statement");
  });
});
