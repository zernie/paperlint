/**
 * The two term rules as ESLint calls them, on a paper directory in a temp folder: what each reports,
 * with its message filled, where the definition it names stands, and what the options change.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { nodeFiles } from "./adapters/node/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { DEFAULT_TERM_OPTIONS } from "./domain/term-definitions.ts";
import { findingText } from "./tex-paper.ts";
import {
  termDefinitionRules,
  termOptionsOf,
  type TermRuleName,
} from "./term-definition-rules.ts";
import { useTempDir } from "../test/support.ts";

const DEPS = { files: nodeFiles, latex: latexReader, codec: sourcesCodec };

/** What `name` reports on `src` as the paper.tex of a fresh folder: each as `line: message`. */
const reported = (
  name: TermRuleName,
  src: string,
  options: readonly unknown[] = [],
  raw = true,
): readonly string[] => {
  const dir = useTempDir("paperlint-term-rules-");
  const seen: string[] = [];
  const rule = termDefinitionRules(DEPS)[name];
  const messages = rule.meta.messages;
  rule
    .create({
      filename: join(dir, "paper.tex"),
      options,
      sourceCode: {
        text: src,
        ...(raw ? { raw: src } : {}),
        getLocFromIndex: (i: number) => ({
          line: src.slice(0, i).split("\n").length,
          column: 0,
        }),
      },
      report: (d) => {
        const text =
          "messageId" in d
            ? findingText(messages, {
                messageId: d.messageId,
                data: d.data ?? {},
                at: null,
              })
            : d.message;
        seen.push(`${String(d.loc.start.line)}: ${text}`);
      },
    })
    .root?.();
  return seen;
};

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

describe("tex/term-before-definition", () => {
  it("🔴 at the first earlier use: the term, the command, where it is defined, how many uses come before", () => {
    expect(
      reported(
        "term-before-definition",
        doc("A gate runs.\nEvery gate blocks.\n\nA \\emph{gate} is a check."),
      ),
    ).toEqual([
      "3: «gate» is used here before its definition (\\emph at paper.tex:6; 2 earlier use(s) outside the abstract). Move the definition to this first use, or say here in plain words what it means.",
    ]);
  });

  it("🔴 on a body that sets no term with the commands, it says it checks nothing — at the body's start", () => {
    expect(
      reported(
        "term-before-definition",
        doc("A gate runs. A \\textit{gate} is a check."),
      ),
    ).toEqual([
      "3: this rule is on, and no term in the body is set with \\emph: it checks nothing in this paper. Mark each definition with \\emph, or turn the rule off.",
    ]);
    expect(
      reported("term-before-definition", doc(""), [
        { commands: ["textit", "em"] },
      ]),
    ).toEqual([
      "1: this rule is on, and no term in the body is set with \\textit, \\em: it checks nothing in this paper. Mark each definition with \\textit, or turn the rule off.",
    ]);
  });

  it("the options name the commands and the longest phrase read as a definition", () => {
    expect(
      reported(
        "term-before-definition",
        doc("A gate runs. A \\textit{gate} is a check."),
        [{ commands: ["textit"], maxWords: 1 }],
      ),
    ).toEqual([
      "3: «gate» is used here before its definition (\\textit at paper.tex:3; 1 earlier use(s) outside the abstract). Move the definition to this first use, or say here in plain words what it means.",
    ]);
  });

  it("reads the paper's text when the language gives no raw source", () => {
    expect(
      reported(
        "term-before-definition",
        doc("A \\emph{gate} is a check."),
        [],
        false,
      ),
    ).toEqual([]);
  });
});

describe("tex/term-defined-twice", () => {
  it("🔴 at each later definition, naming where the first one stands", () => {
    expect(
      reported(
        "term-defined-twice",
        doc("A \\emph{gate} is a check.\n\nA \\emph{gate}, again, blocks."),
      ),
    ).toEqual([
      "5: «gate» is set as a definition again; it was first defined at paper.tex:3. Keep one definition and set later mentions in roman, or point back to the first one.",
    ]);
  });

  it("silent on a body that defines each term once", () => {
    expect(
      reported("term-defined-twice", doc("A \\emph{gate} is a check.")),
    ).toEqual([]);
  });
});

describe("termOptionsOf — the options, and the defaults for what they leave out", () => {
  it("no options, an empty list or a missing field: the defaults", () => {
    expect([
      termOptionsOf(undefined),
      termOptionsOf([]),
      termOptionsOf([{ commands: [] }]),
      termOptionsOf([{ maxWords: 2 }]),
    ]).toEqual([
      DEFAULT_TERM_OPTIONS,
      DEFAULT_TERM_OPTIONS,
      DEFAULT_TERM_OPTIONS,
      { commands: ["emph"], maxWords: 2 },
    ]);
  });
});
