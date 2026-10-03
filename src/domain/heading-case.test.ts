/**
 * Heading case, judged on real parses of `\section`-family titles: what headline style asks of each
 * word, and — as much — what it does not, because a finding at error level that is wrong is worse
 * than a miss. Every title is parsed by the LaTeX adapter, judged, and the fixes are applied to the
 * source, so what is asserted is the heading an author would end up with.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "../adapters/latex/index.ts";
import {
  BOUND_PREFIXES,
  judgeHeadingCase,
  type HeadingStyle,
} from "./heading-case.ts";

const findingsOf = (src: string, style: HeadingStyle = "headline") =>
  judgeHeadingCase(latexReader.headings(src), style, src);

/** The words a source's findings name, in order. */
const wordsOf = (src: string, style: HeadingStyle = "headline"): string[] =>
  findingsOf(src, style).map((f) => String(f.data["word"]));

/** The source after every fix is applied, last first so offsets stay true. */
function fixed(src: string, style: HeadingStyle = "headline"): string {
  const fixes = findingsOf(src, style)
    .flatMap((f) => (f.fix === null ? [] : [f.fix]))
    .toSorted((a, b) => b.span.start - a.span.start);
  return fixes.reduce(
    (text, f) => text.slice(0, f.span.start) + f.text + text.slice(f.span.end),
    src,
  );
}

const section = (title: string): string => `\\section{${title}}`;

describe("headline style — sentence-case headings are reported and fixed", () => {
  it.each([
    ["Related work", "Related Work"],
    [
      "The advertised savings don't show up",
      "The Advertised Savings Don't Show Up",
    ],
    [
      "Method: a cost-aware, correctness-gated harness",
      "Method: A Cost-Aware, Correctness-Gated Harness",
    ],
    [
      "A ceiling for any output-trimming tool",
      "A Ceiling for Any Output-Trimming Tool",
    ],
    [
      "discussion and threats to validity",
      "Discussion and Threats to Validity",
    ],
    ["The measurement pitfall", "The Measurement Pitfall"],
  ])("🔴 %s", (title, want) => {
    const src = section(title);
    expect(findingsOf(src).length).toBeGreaterThan(0);
    expect(fixed(src)).toBe(section(want));
  });

  it("names each word it reports, where it stands", () => {
    const src = section("Related work");
    const [f] = findingsOf(src);
    expect(f?.data).toMatchObject({ word: "work", expected: "Work" });
    expect(f?.at).toEqual({
      start: src.indexOf("work"),
      end: src.indexOf("}"),
    });
  });
});

describe("headline style — the corrected forms are silent", () => {
  it.each([
    "Related Work",
    "The Advertised Savings Don't Show Up",
    "Method: A Cost-Aware, Correctness-Gated Harness",
    "A Ceiling for Any Output-Trimming Tool",
    "Discussion and Threats to Validity",
    "The Measurement Pitfall",
    "Introduction",
    "What Is It For",
    "Is It Worth It?",
    "Peer-to-Peer Verification of Claims",
    "State-of-the-Art Baselines",
    "Scaling Up the Pipeline",
  ])("🔴 %s", (title) => {
    expect(findingsOf(section(title))).toEqual([]);
  });

  it.each([
    ["a bound prefix keeps its second element lowercase", "Multi-turn Agents"],
    [
      "…and may capitalise it: the rule cannot tell prefix from word",
      "Multi-Turn Agents",
    ],
    ["non-", "Non-trivial Savings"],
    ["pre-", "Pre-trained Models for Review"],
    ["acronyms", "LLM Agents in CI"],
    ["an acronym with a plural", "LLMs and CIs"],
    ["mixed-case names", "GitHub and LaTeX in Practice"],
    ["a lowercase-first brand", "iOS Builds"],
    ["math", "Results for $k=3$ and $n$"],
    ["a word set in code", "Why \\texttt{grep} Fails"],
    ["numbers", "Top 10 Failures in 2026"],
    ["a numbered compound", "GPT-4 Judges"],
    ["a single-letter compound", "Choosing k for k-means"],
    ["a label after the title", "Related Work\\label{sec:rw}"],
    ["a footnote after the last word", "Related Work\\footnote{A note}"],
    ["a name particle", "Notes on von Neumann Machines"],
    ["a dotted abbreviation", "Pitfalls, e.g., Timeouts"],
    ["a slash compound", "Input/output Handling"],
    ["a title that is only math", "$O(n)$"],
    ["a capital letter that labels something", "Module A: Element Relation"],
    ["…and the same letter inside a compound", "Plan A-Prime Results"],
  ])("%s", (_why, title) => {
    expect(findingsOf(section(title))).toEqual([]);
  });

  it("a group right after a macro the parser has no signature for is that macro's argument, not title words", () => {
    expect(
      findingsOf(section("Evaluating \\ours{some words} on Data")),
    ).toEqual([]);
    expect(
      findingsOf("\\subsubsection*{\\finding{label}{a sentence of words}}"),
    ).toEqual([]);
    expect(wordsOf(section("related \\ours {work}"))).toEqual([
      "related",
      "work",
    ]);
  });

  it("emphasis commands are read as the words they wrap", () => {
    expect(wordsOf(section("A \\emph{very} Good Idea"))).toEqual(["very"]);
    expect(fixed(section("A \\emph{very} Good Idea"))).toBe(
      section("A \\emph{Very} Good Idea"),
    );
  });
});

describe("headline style — words whose class is ambiguous are never reported", () => {
  it.each([
    "up",
    "down",
    "over",
    "out",
    "off",
    "on",
    "in",
    "through",
    "about",
    "after",
    "before",
    "under",
    "along",
    "if",
    "while",
    "because",
    "than",
    "that",
    "so",
    "yet",
    "how",
    "using",
    "following",
    "including",
    "given",
  ])("🔴 «%s», mid-title, either case", (word) => {
    const upper = word.charAt(0).toUpperCase() + word.slice(1);
    expect(findingsOf(section(`Turning ${word} the Cache`))).toEqual([]);
    expect(findingsOf(section(`Turning ${upper} the Cache`))).toEqual([]);
  });

  it("…but first, last and after a colon they are capitalised whatever they are", () => {
    expect(fixed(section("in practice"))).toBe(section("In Practice"));
    expect(fixed(section("Scaling up"))).toBe(section("Scaling Up"));
    expect(fixed(section("Result: over the limit"))).toBe(
      section("Result: Over the Limit"),
    );
  });
});

describe("headline style — what the publisher asks lowercase stays lowercase", () => {
  it.each([
    ["The", "the"],
    ["And", "and"],
    ["Of", "of"],
    ["To", "to"],
    ["As", "as"],
    ["For", "for"],
    ["With", "with"],
    ["From", "from"],
    ["Between", "between"],
    ["Without", "without"],
    ["Nor", "nor"],
    ["But", "but"],
    ["An", "an"],
  ])("a capitalised «%s» in the middle is reported", (word, lower) => {
    const src = section(`Speed ${word} Safety`);
    expect(findingsOf(src)).toHaveLength(1);
    expect(fixed(src)).toBe(section(`Speed ${lower} Safety`));
  });

  it("…except where a capital is right or cannot be told from right", () => {
    expect(findingsOf(section("To Measure and to Report"))).toEqual([]);
    expect(findingsOf(section("What It Is For"))).toEqual([]);
    expect(findingsOf(section("Method: The Harness"))).toEqual([]);
    expect(findingsOf(section("Method --- The Harness"))).toEqual([]);
    expect(findingsOf(section("Why? The Harness"))).toEqual([]);
    expect(findingsOf(section("\\texttt{grep} And Friends"))).toEqual([]);
    expect(findingsOf(section("Fast And $k$"))).toEqual([]);
  });

  it("a lowercase minor word at the start, the end or after a colon is reported", () => {
    expect(fixed(section("the Harness"))).toBe(section("The Harness"));
    expect(fixed(section("Where to Look for"))).toBe(
      section("Where to Look For"),
    );
    expect(fixed(section("Method: the Harness"))).toBe(
      section("Method: The Harness"),
    );
  });

  it("a minor word beside something the reader sees but the rule does not read is left alone", () => {
    expect(findingsOf(section("\\texttt{x} for $y$"))).toEqual([]);
    expect(findingsOf(section("Results for \\texttt{x}"))).toEqual([]);
  });
});

describe("headline style — hyphenated compounds", () => {
  it.each([
    ["Cost-aware Gating", "Cost-Aware Gating"],
    ["cost-aware Gating", "Cost-Aware Gating"],
    ["Peer-to-peer Checks", "Peer-to-Peer Checks"],
    ["State-of-the-art Tools", "State-of-the-Art Tools"],
    ["Up-To-Date Checks", "Up-to-Date Checks"],
    ["Self-supervised Agents", "Self-Supervised Agents"],
    ["multi-turn Agents", "Multi-turn Agents"],
    ["Question-And-Answer Pairs", "Question-and-Answer Pairs"],
    ["GPU-accelerated Agents", "GPU-Accelerated Agents"],
  ])("🔴 %s", (title, want) => {
    expect(fixed(section(title))).toBe(section(want));
  });

  it.each([
    "Built-in Checks",
    "Built-In Checks",
    "Re-use of Results",
    "Co-design for Safety",
    "Post-hoc Analysis",
    "Anti-patterns in Review",
    "Quasi-experiments in Review",
  ])("a bound prefix or an ambiguous second element: %s", (title) => {
    expect(findingsOf(section(title))).toEqual([]);
  });

  it("the prefixes are the documented, small list", () => {
    expect([...BOUND_PREFIXES]).toEqual([
      "anti",
      "co",
      "de",
      "inter",
      "intra",
      "multi",
      "non",
      "post",
      "pre",
      "pseudo",
      "quasi",
      "re",
      "semi",
      "sub",
      "trans",
      "ultra",
      "un",
    ]);
    expect(BOUND_PREFIXES.has("self")).toBe(false);
  });
});

describe("headline style — punctuation, dashes and quotes", () => {
  it("a colon, a question mark and a full stop are read around, not into, the word", () => {
    expect(fixed(section("Threats to validity."))).toBe(
      section("Threats to Validity."),
    );
    expect(fixed(section("is it worth it?"))).toBe(section("Is It Worth It?"));
    expect(fixed(section("(extended abstract)"))).toBe(
      section("(Extended Abstract)"),
    );
  });

  it("TeX quotes and apostrophes stay where they are", () => {
    expect(fixed(section("The ``clean'' room's rules"))).toBe(
      section("The ``Clean'' Room's Rules"),
    );
  });

  it("dashes break the title: the next word is a start, either way for a minor word", () => {
    expect(fixed(section("Fast --- the cost of safety"))).toBe(
      section("Fast --- the Cost of Safety"),
    );
    expect(findingsOf(section("Fast--the Cost of Safety"))).toEqual([]);
    expect(findingsOf(section("Fast - The Cost of Safety"))).toEqual([]);
    expect(findingsOf(section("Fast—the Cost of Safety"))).toEqual([]);
  });

  it("a chunk the rule cannot read as a word is not judged, and is not first or last", () => {
    expect(findingsOf(section("3 Ways to Fix It"))).toEqual([]);
    expect(fixed(section("3 ways to Fix It"))).toBe(
      section("3 Ways to Fix It"),
    );
    expect(findingsOf(section("Caf\\'e and Bar"))).toEqual([]);
    expect(findingsOf(section("pre- and Post-processing"))).toEqual([]);
  });
});

describe("headline style — which headings, which arguments", () => {
  it.each([
    "\\section",
    "\\section*",
    "\\subsection",
    "\\subsection*",
    "\\subsubsection",
    "\\subsubsection*",
    "\\paragraph",
    "\\paragraph*",
  ])("%s", (cmd) => {
    expect(wordsOf(`${cmd}{related work}`)).toEqual(["related", "work"]);
  });

  it("judges the short title as well as the title, and says which", () => {
    const src = "\\subsection[short title]{Long Title}";
    const found = findingsOf(src);
    expect(found.map((f) => f.data["word"])).toEqual(["short", "title"]);
    expect(found.map((f) => f.data["where"])).toEqual([
      "\\subsection[…]",
      "\\subsection[…]",
    ]);
    expect(findingsOf("\\subsection{related}")[0]?.data["where"]).toBe(
      "\\subsection",
    );
    expect(fixed(src)).toBe("\\subsection[Short Title]{Long Title}");
  });

  it("does not read a heading in a comment, a definition or a comment environment", () => {
    const src = [
      "% \\section{related work}",
      "\\newcommand{\\mine}{\\section{related work}}",
      "\\begin{comment}\\section{related work}\\end{comment}",
      "\\section{Related Work}",
    ].join("\n");
    expect(findingsOf(src)).toEqual([]);
  });

  it("does not read other commands: \\caption, \\textbf, \\subparagraph", () => {
    expect(findingsOf("\\caption{related work}")).toEqual([]);
    expect(findingsOf("\\textbf{related work}")).toEqual([]);
    expect(findingsOf("\\subparagraph{related work}")).toEqual([]);
  });

  it("an empty title, or one with only invisible parts, has nothing to judge", () => {
    expect(findingsOf("\\section{}")).toEqual([]);
    expect(findingsOf("\\section{\\label{x}}")).toEqual([]);
    expect(findingsOf("\\section")).toEqual([]);
  });
});

describe("a fix is offered only where the source is the text", () => {
  it("a word split by markup is reported, and not rewritten", () => {
    const [f] = findingsOf(section("Fast \\emph{ca}che"));
    expect(f?.data).toMatchObject({ word: "cache", expected: "Cache" });
    expect(f?.fix).toBeNull();
    expect(fixed(section("Fast \\emph{ca}che"))).toBe(
      section("Fast \\emph{ca}che"),
    );
  });

  it("a minor word beside a command is not first or last, so it is left alone", () => {
    expect(wordsOf(section("the \\texttt{x}"))).toEqual(["the"]);
  });
});

describe("sentence style", () => {
  it("reports a lowercase first word and offers no fix: a brand cannot be told from a word", () => {
    const [f] = findingsOf(section("related Work"), "sentence");
    expect(f?.data).toMatchObject({ word: "related", expected: "Related" });
    expect(f?.fix).toBeNull();
  });

  it("is silent on everything else, because a proper noun cannot be told from a capital", () => {
    expect(findingsOf(section("Related work"), "sentence")).toEqual([]);
    expect(findingsOf(section("Related Work in Python"), "sentence")).toEqual(
      [],
    );
    expect(
      findingsOf(section("\\texttt{grep} and friends"), "sentence"),
    ).toEqual([]);
    expect(findingsOf(section("3 ways to fix it"), "sentence")).toEqual([]);
    expect(findingsOf(section("iOS builds"), "sentence")).toEqual([]);
  });
});

describe("style off", () => {
  it("judges nothing", () => {
    expect(findingsOf(section("related work and more"), "off")).toEqual([]);
  });
});
