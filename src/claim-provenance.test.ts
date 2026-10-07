/**
 * `tex/claim-provenance` on real parses: every sentence of the body that states a number is
 * reported once unless it says whose the number is — a citation or a link, the authors (we, our),
 * a place in the paper (`\ref`, "Section 3", "Table 2"), or the sample it counts ("n = 134",
 * "48 runs"). Both halves for every kind of owner, and the places a number is not the body's.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import {
  claimProvenanceRule,
  judgeClaimProvenance,
} from "./claim-provenance.ts";
import { builtPaper } from "../test/recorded-fixture.ts";

const doc = (body: string): string =>
  `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

/** The source text of every sentence the rule reports, in order. */
const reported = (body: string): readonly string[] => {
  const src = doc(body);
  return judgeClaimProvenance(latexReader.bodyProse(src)).map((f) =>
    f.at === null ? "<unplaced>" : src.slice(f.at.start, f.at.end),
  );
};

describe("a sentence with a number and no owner is reported, once, as its whole source", () => {
  it("a percentage", () => {
    expect(
      reported("Agents ignore 42\\% of the rules they are given."),
    ).toEqual(["Agents ignore 42\\% of the rules they are given."]);
  });

  it("a decimal, a multiplier and a count with no noun after it — each sentence once", () => {
    expect(
      reported(
        "The rate rose from 0.37 to 2.1. It runs 3x faster. Violations went from 12 to 40.",
      ),
    ).toEqual([
      "The rate rose from 0.37 to 2.1.",
      "It runs 3x faster.",
      "Violations went from 12 to 40.",
    ]);
  });

  it("only the sentence without an owner, in a passage that has both", () => {
    expect(
      reported(
        "We measured 48 runs. Under test the rules held in 97\\% of cases. See~\\cite{a}.",
      ),
    ).toEqual(["Under test the rules held in 97\\% of cases."]);
  });

  it("🔴 a count's modifiers are words, not «of the»: «2 of the guards» is not a sample", () => {
    expect(reported("It held for 2 of the guards.")).toEqual([
      "It held for 2 of the guards.",
    ]);
  });

  it("🔴 a name before a number is skipped only mid-sentence: a sentence-initial word is not a name", () => {
    expect(
      reported(
        "Only 2 of the guards hold. It runs on Claude 3 and fails 40\\%.",
      ),
    ).toEqual([
      "Only 2 of the guards hold.",
      "It runs on Claude 3 and fails 40\\%.",
    ]);
  });
});

describe("the numbers the rule skips do not hide their neighbours", () => {
  it("🔴 a number after an enumerator, or outside the quotation, is still read", () => {
    expect(
      reported(
        "It rose to 2. The ``safe'' share fell by 30\\%. A high share (81.15\\%) holds.",
      ),
    ).toEqual([
      "It rose to 2.",
      "The ``safe'' share fell by 30\\%.",
      "A high share (81.15\\%) holds.",
    ]);
  });

  it("🔴 «US» is a country, not the authors", () => {
    expect(reported("US agencies report 40\\% growth.")).toEqual([
      "US agencies report 40\\% growth.",
    ]);
  });

  it("a number inside \\emph is still the sentence's", () => {
    expect(
      reported("A model changes its mind on \\emph{21.5\\%} of rows."),
    ).toEqual(["A model changes its mind on \\emph{21.5\\%} of rows."]);
  });
});

describe("where the reported sentence's text comes from", () => {
  it("the text of a formatting macro the parser has no signature for, and of a bare group", () => {
    expect(
      reported("\\enquote{It fails 40\\%.} {\\bfseries It holds 60\\%.}"),
    ).toEqual(["It fails 40\\%.", "It holds 60\\%."]);
  });

  it("a source with no document environment is read whole", () => {
    const src = "It fails 40\\%.";
    expect(
      judgeClaimProvenance(latexReader.bodyProse(src)).map((f) => f.at),
    ).toEqual([{ start: 0, end: src.length }]);
  });

  it("the abstract is body prose", () => {
    expect(
      reported(
        "\\begin{abstract}A frontier model flips on 21.5\\% of rows.\\end{abstract}",
      ),
    ).toEqual(["A frontier model flips on 21.5\\% of rows."]);
  });

  it("a footnote is its own passage", () => {
    expect(
      reported("Text.\\footnote{The cache hit 93\\% of lookups.}"),
    ).toEqual(["The cache hit 93\\% of lookups."]);
  });

  it("🔴 a sample named in math owns only its own sentence", () => {
    expect(reported("We set $n=3$. It fails 12\\%. Then $n=5$ held.")).toEqual([
      "It fails 12\\%.",
    ]);
  });

  it("the sentence ends at a paragraph break", () => {
    expect(reported("Rates rose by 12\\%\n\nand we then stopped.")).toEqual([
      "Rates rose by 12\\%",
    ]);
  });
});

describe("an owner silences the sentence", () => {
  it.each([
    ["a citation", "Hooks block 2 of 7 commands~\\cite{x}."],
    [
      "a citation after the full stop",
      "It grew 900\\%.~\\cite{x} Then it fell.",
    ],
    ["a citation opening the passage", "\\cite{x} report 40\\%."],
    [
      "a citation's note is still a citation",
      "It fails 30\\%~\\citep[p.~4]{x}.",
    ],
    [
      "a link",
      "The registry lists 900\\% growth (\\url{https://example.org}).",
    ],
    [
      "a link with its text",
      "The registry grew 900\\% (\\href{https://e.org}{see})..",
    ],
    [
      "a footnote whose own footnote links",
      "The registry grew 900\\%.\\footnote{Seen\\footnote{\\url{https://e.org}} there.}",
    ],
    [
      "a footnote that links",
      "The registry grew 900\\%.\\footnote{\\url{https://e.org}}",
    ],
  ])("%s", (_, body) => {
    expect(reported(body)).toEqual([]);
  });
});

describe("an owner in words silences the sentence", () => {
  it.each([
    ["we", "We find a 6\\% reduction."],
    ["our", "Our census found 12\\% of files empty."],
    ["a \\ref", "The rate is 12\\% (Table~\\ref{t:rates})."],
    ["a \\cref", "\\Cref{s:x} puts it at 12\\%."],
    ["Section N", "Section 4 puts the rate at 12\\%."],
    ["Table N", "The rate is 12\\% (see Table 2)."],
    ["Fig. N, across its full stop", "As Fig. 3 shows, the rate is 12\\%."],
    ["Appendix X", "Appendix B gives the rate as 12\\%."],
    ["§N", "The rate is 12\\% (\\S 4)."],
    ["n = 134", "The rate is 12\\% (n = 134)."],
    ["$n=134$ in math", "The rate is 12\\% ($n=134$)."],
    ["$n{=}7$ in math, braces and all", "The rate is 12\\% ($n{=}7$)."],
    [
      "a claimant named as one",
      "The skill advertises a 65\\% token reduction.",
    ],
    ["a claim in brackets", "The second tool (claim 63\\%) runs slower."],
    ["a count of things", "The rule held in 48 runs."],
    ["a count of times", "It is 3 times faster."],
    ["a count with an adjective", "The rule held in 48 independent runs."],
    [
      "a count with a capitalised modifier",
      "Each dataset contains 466 Boolean questions.",
    ],
    [
      "a count with two modifiers",
      "GPT was evaluated on 900 systematically collected questions.",
    ],
    ["of N things", "Of 1,836 repositories, 12\\% ship hooks."],
    [
      "e.g. does not end the sentence",
      "Some fail, e.g. Table 2 has 12\\% of them.",
    ],
  ])("%s", (_, body) => {
    expect(reported(body)).toEqual([]);
  });
});

describe("a number that is not the body's claim is not read", () => {
  it.each([
    ["a year", "In 2024 the first agents shipped."],
    [
      "a digit that belongs to a product or model name",
      "It runs on Claude 3 and Python 3.12, beside GPT-4o and Llama-3-8B.",
    ],
    [
      "an inline list's enumerators",
      "The weaknesses are: 1. keeping up with guidance, 2. judging tools, and (3) time.",
    ],
    [
      "a number inside a quotation",
      "Such as ``Will 2 factor authentication protect me?''.",
    ],
    [
      "the level of an interval",
      "It is the 95\\% CI of the median, and the 99\\% confidence band.",
    ],
    [
      "a name with a digit",
      "GPT-4 and COVID-19 and v1.2 and 10k and 2FA and 0x1F appear.",
    ],
  ])("%s", (_, body) => {
    expect(reported(body)).toEqual([]);
  });
});

describe("markup that is not the body's prose is not read", () => {
  it.each([
    ["math", "The bound $x \\le 3$ holds."],
    ["an equation", "\\begin{equation} x = 40 \\end{equation}"],
    [
      "a bibliography environment",
      "Text.\n\\begin{thebibliography}{9}\\bibitem{a} It fails 40\\%.\\end{thebibliography}",
    ],
    ["the ACM classification", "\\ccsdesc[500]{Security~Software}Text."],
    [
      "its XML",
      "\\begin{CCSXML}<concept_significance>500</concept_significance>\\end{CCSXML}",
    ],
    [
      "a table",
      "\\begin{table}\\caption{Rates: 12\\%}\\begin{tabular}{l}40\\%\\end{tabular}\\end{table}",
    ],
    ["a figure", "\\begin{figure}\\caption{The 12\\% gap.}\\end{figure}"],
    ["a heading", "\\section{Results for 12 models}\nText."],
    ["a caption outside a float", "\\captionof{table}{Rates of 12\\%}"],
    ["code", "\\begin{lstlisting}x = 42\\end{lstlisting}"],
    ["a comment", "% 42 percent\nText."],
    ["the appendix", "Text.\n\\appendix\n\\section{More}\nIt fails 40\\%."],
    ["the bibliography", "Text.\n\\bibliography{refs}\nIt fails 40\\%."],
    [
      "the title block",
      "\\title{Rules 2026: 12 findings}\\author{A}\\maketitle Text.",
    ],
    [
      "an unknown macro's arguments",
      "\\affiliation{\\institution{Lab 42}}Text.",
    ],
    ["a macro definition", "\\newcommand{\\rate}{42\\%}Text."],
    [
      "a TeX conditional's argument glued to its macro",
      "\\def\\conference{2}\n\\if\\conference1\n\\fi\n\\if\\conference2\nText.\n\\fi",
    ],
  ])("%s", (_, body) => {
    expect(reported(body)).toEqual([]);
  });
});

/** What a rule reported, as ESLint would receive it: the line, and the id or the whole message. */
type Report =
  | {
      readonly line: number;
      readonly messageId: string;
      readonly data?: unknown;
    }
  | { readonly line: number; readonly message: string };

/** Run `rule` over `/p/paper.tex` holding `src`, the way ESLint runs it: `create`, then `root`. */
function run(
  rule: ReturnType<typeof claimProvenanceRule>,
  src: string,
  raw = true,
): Report[] {
  const reports: Report[] = [];
  rule
    .create({
      filename: "/p/paper.tex",
      sourceCode: {
        text: src,
        ...(raw ? { raw: src } : {}),
        getLocFromIndex: (i) => ({
          line: src.slice(0, i).split("\n").length,
          column: 0,
        }),
      },
      report: (d) =>
        reports.push(
          "messageId" in d
            ? { line: d.loc.start.line, messageId: d.messageId, data: d.data }
            : { line: d.loc.start.line, message: d.message },
        ),
    })
    .root?.();
  return reports;
}

const onDisk = (files: Record<string, string> = {}) =>
  claimProvenanceRule({
    files: memoryFiles(files),
    latex: latexReader,
    codec: sourcesCodec,
  });

describe("the rule, as ESLint runs it", () => {
  it("reports each finding at its lines, with the message naming the owners that would do", () => {
    const rule = onDisk();
    expect(run(rule, doc("Agents ignore 42\\% of rules."))).toEqual([
      { line: 3, messageId: "noOwner", data: { number: "42%" } },
    ]);
    expect(rule.meta.messages["noOwner"]).toContain("{{number}}");
    expect(rule.meta.docs.url).toBe(
      "https://github.com/zernie/paperlint/blob/main/docs/rules/tex/claim-provenance.md",
    );
  });

  it("reads `text` when the source code carries no `raw`", () => {
    expect(run(onDisk(), doc("It fails 40\\%."), false)).toEqual([
      { line: 3, messageId: "noOwner", data: { number: "40%" } },
    ]);
  });

  it("🔴 reads the files the build recorded TeX reading: a finding there is reported at the \\input, naming its file and line", () => {
    const main = doc("Intro.\n\\input{sections/results}");
    const rule = onDisk(
      builtPaper(
        "/p",
        {
          "paper.tex": main,
          "sections/results.tex":
            "\\section{Results}\nIt holds.\nAgents ignore 42\\% of rules.\n",
        },
        [
          { path: "paper.tex", role: "body" },
          { path: "sections/results.tex", role: "body" },
        ],
      ),
    );
    expect(run(rule, main)).toEqual([
      {
        line: 4,
        message: `sections/results.tex:3:1: ${String(rule.meta.messages["noOwner"]).replace("{{number}}", "42%")}`,
      },
    ]);
  });

  it("🔴 without a record the paper is paper.tex: the file it \\inputs is not read", () => {
    const main = doc("Intro.\n\\input{sections/results}");
    const rule = onDisk({
      "/p/paper.tex": main,
      "/p/sections/results.tex": "Agents ignore 42\\% of rules.\n",
    });
    expect(run(rule, main)).toEqual([]);
  });
});
