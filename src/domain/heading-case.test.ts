/**
 * Heading case, judged on real parses of the paper's `\title` and its `\section`-family headings:
 * what each style asks of each word, and — as much — what it does not, because a finding at error
 * level that is wrong is worse than a miss. Every title is parsed by the LaTeX adapter, judged, and
 * the fixes are applied to the source, so what is asserted is the text an author would end up with.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "../adapters/latex/index.ts";
import {
  BOUND_PREFIXES,
  judgeHeadingCase,
  type CaseStyle,
  type HeadingCaseOptions,
} from "./heading-case.ts";

/** One style for the title and every heading: the shape most venues state. */
const everywhere = (style: CaseStyle): HeadingCaseOptions => ({
  title: style,
  headings: style,
});

type Asked = CaseStyle | HeadingCaseOptions;
const optionsOf = (asked: Asked): HeadingCaseOptions =>
  typeof asked === "string" ? everywhere(asked) : asked;

const findingsOf = (src: string, asked: Asked = "chicago-headline") =>
  judgeHeadingCase(latexReader.headings(src), optionsOf(asked), src);

/** The words a source's findings name, in order. */
const wordsOf = (src: string, asked: Asked = "chicago-headline"): string[] =>
  findingsOf(src, asked).map((f) => String(f.data["word"]));

/** The source after every fix is applied, last first so offsets stay true. */
function fixed(src: string, asked: Asked = "chicago-headline"): string {
  const fixes = findingsOf(src, asked)
    .flatMap((f) => (f.fix === null ? [] : [f.fix]))
    .toSorted((a, b) => b.span.start - a.span.start);
  return fixes.reduce(
    (text, f) => text.slice(0, f.span.start) + f.text + text.slice(f.span.end),
    src,
  );
}

const section = (title: string): string => `\\section{${title}}`;

describe("chicago-headline — sentence-case headings are reported and fixed", () => {
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

describe("chicago-headline — the corrected forms are silent", () => {
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
});

describe("chicago-headline — what the rule does not read", () => {
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

  it("a comment inside a title says nothing, and a group may open it", () => {
    expect(findingsOf("\\section{Related % note\nWork}")).toEqual([]);
    expect(findingsOf(section("{GitHub} and Friends"))).toEqual([]);
  });

  it("emphasis commands are read as the words they wrap", () => {
    expect(wordsOf(section("A \\emph{very} Good Idea"))).toEqual(["very"]);
    expect(fixed(section("A \\emph{very} Good Idea"))).toBe(
      section("A \\emph{Very} Good Idea"),
    );
  });
});

describe("chicago-headline — words whose class is ambiguous are never reported", () => {
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

describe("chicago-headline — what the publisher asks lowercase stays lowercase", () => {
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

describe("chicago-headline — hyphenated compounds", () => {
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

describe("chicago-headline — punctuation, dashes and quotes", () => {
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

describe("chicago-headline — which headings, which arguments", () => {
  it.each([
    "\\section",
    "\\section*",
    "\\subsection",
    "\\subsection*",
    "\\subsubsection",
    "\\subsubsection*",
    "\\paragraph",
    "\\paragraph*",
    "\\subparagraph",
    "\\subparagraph*",
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
      "\\newcommand{\\ours}{\\section{related work}}",
      "\\begin{comment}\\section{related work}\\end{comment}",
      "\\section{Related Work}",
    ].join("\n");
    expect(findingsOf(src)).toEqual([]);
  });

  it("does not read other commands: \\caption, \\textbf, \\subtitle", () => {
    expect(findingsOf("\\caption{related work}")).toEqual([]);
    expect(findingsOf("\\textbf{related work}")).toEqual([]);
    expect(findingsOf("\\subtitle{related work}")).toEqual([]);
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

describe("any", () => {
  it("judges nothing in the scope it is given", () => {
    expect(findingsOf(section("related work and more"), "any")).toEqual([]);
    expect(findingsOf("\\title{related work and more}", "any")).toEqual([]);
  });
});

describe("the paper's title, \\title[short]{long}", () => {
  const preamble = (title: string): string =>
    `\\documentclass[sigconf]{acmart}\n${title}\n\\begin{document}\n\\maketitle\n\\end{document}\n`;

  it("🔴 is judged in the preamble, at the place each word stands", () => {
    const src = preamble("\\title{Measuring the wrong thing}");
    const found = findingsOf(src);
    expect(found.map((f) => f.data)).toEqual([
      {
        word: "wrong",
        expected: "Wrong",
        why: "nouns, pronouns, verbs, adjectives and adverbs are capitalized",
        where: "\\title",
      },
      {
        word: "thing",
        expected: "Thing",
        why: "the last word of a title is capitalized",
        where: "\\title",
      },
    ]);
    // Guards: the span is the word in the preamble, not an offset into the body.
    expect(found[0]?.at).toEqual({
      start: src.indexOf("wrong"),
      end: src.indexOf("wrong") + "wrong".length,
    });
    expect(fixed(src)).toBe(preamble("\\title{Measuring the Wrong Thing}"));
  });

  it("🔴 judges the short title and the long one, each saying which it is", () => {
    const src = preamble("\\title[short form]{The Long Form}");
    expect(
      findingsOf(src).map((f) => [f.data["where"], f.data["word"]]),
    ).toEqual([
      ["\\title[…]", "short"],
      ["\\title[…]", "form"],
    ]);
    expect(fixed(src)).toBe(preamble("\\title[Short Form]{The Long Form}"));
    expect(wordsOf(preamble("\\title[Short Form]{the long form}"))).toEqual([
      "the",
      "long",
      "form",
    ]);
  });

  it("reads a title written over several lines, and fixes each word where it is", () => {
    const src = preamble("\\title{Efficiency claims\n  in agentic\n  coding}");
    expect(wordsOf(src)).toEqual(["claims", "agentic", "coding"]);
    expect(fixed(src)).toBe(
      preamble("\\title{Efficiency Claims\n  in Agentic\n  Coding}"),
    );
  });
});

describe("the paper's title — what it does not read", () => {
  const preamble = (title: string): string =>
    `\\documentclass[sigconf]{acmart}\n${title}\n\\begin{document}\n\\maketitle\n\\end{document}\n`;

  it("does not read code, math or a footnote in a title, as in a heading", () => {
    expect(
      findingsOf(preamble("\\title{Why \\texttt{grep} Fails for $k=3$}")),
    ).toEqual([]);
    expect(
      findingsOf(preamble("\\title{Measuring It Right\\thanks{a note}}")),
    ).toEqual([]);
    expect(wordsOf(preamble("\\title{\\texttt{grep}: the tool}"))).toEqual([
      "the",
      "tool",
    ]);
  });

  it("an empty title has nothing to judge", () => {
    expect(findingsOf(preamble("\\title{}"))).toEqual([]);
  });

  it("a title in sentence style asks for its first word only, and is never fixed", () => {
    const asked = { title: "sentence", headings: "any" } as const;
    const [f] = findingsOf(preamble("\\title{measuring things}"), asked);
    expect(f?.data).toEqual({
      word: "measuring",
      expected: "Measuring",
      where: "\\title",
    });
    expect(f?.fix).toBeNull();
  });
});

describe("which style each title and heading gets", () => {
  const src = [
    "\\title{measuring the thing}",
    "\\section{related work}",
    "\\subsection{related work}",
    "\\paragraph{related work}",
    "\\subparagraph{related work}",
  ].join("\n");
  const judged = (asked: HeadingCaseOptions): string[] =>
    findingsOf(src, asked).map(
      (f) => `${String(f.data["where"])} ${String(f.data["word"])}`,
    );

  it("🔴 the title follows `title`, every heading follows `headings`", () => {
    expect(judged({ title: "chicago-headline", headings: "any" })).toEqual([
      "\\title measuring",
      "\\title thing",
    ]);
    expect(judged({ title: "any", headings: "sentence" })).toEqual([
      "\\section related",
      "\\subsection related",
      "\\paragraph related",
      "\\subparagraph related",
    ]);
  });

  it("🔴 a level named in `levels` follows its own style instead of `headings`", () => {
    expect(
      judged({
        title: "any",
        headings: "chicago-headline",
        levels: { paragraph: "sentence", subparagraph: "any" },
      }),
    ).toEqual([
      "\\section related",
      "\\section work",
      "\\subsection related",
      "\\subsection work",
      "\\paragraph related",
    ]);
    expect(
      judged({
        title: "any",
        headings: "any",
        levels: { section: "chicago-headline" },
      }),
    ).toEqual(["\\section related", "\\section work"]);
  });

  it("`levels` does not reach the title", () => {
    expect(
      judged({ title: "any", headings: "any", levels: { section: "any" } }),
    ).toEqual([]);
  });
});

describe("chicago-headline — a title in parts: a line break, a colon, a question, a dash", () => {
  it.each([
    "Agents and Tools:\\\\ The Empirical Study",
    "Agents and Tools: \\\\ An Empirical Study",
    "Agents and Tools:\\newline The Study",
    "People \\\\[1ex] For the People",
    "Main Title\\\\ The Subtitle",
    "Main Title \\linebreak[3] The Subtitle",
  ])(
    "🔴 a minor word after a line break is a start, not reported: %s",
    (title) => {
      expect(findingsOf(section(title))).toEqual([]);
    },
  );

  it("…and a lowercase major word after it still is", () => {
    expect(
      wordsOf(section("Agents and Tools:\\\\ the empirical Study")),
    ).toEqual(["empirical"]);
  });

  it.each([
    "What Is It Good For: An Analysis",
    "What Is It Good for: An Analysis",
    "Something to Look Out For: Bugs in CI",
    "Agents to Talk To --- A Study",
    "Agents to Talk to --- A Study",
    "Who Are We Talking To? A Study",
    "Who Are We Talking to? A Study",
    "Worth Fighting For! A Study",
  ])(
    "🔴 the last word of a part (before : ? ! or a dash) is not asked either way: %s",
    (title) => {
      expect(findingsOf(section(title))).toEqual([]);
    },
  );

  it("a minor word right beside something the rule does not read is left as it is", () => {
    expect(findingsOf(section("Fast And \\cite{x} Safe"))).toEqual([]);
    expect(findingsOf(section("Fast \\cite{x} And Safe"))).toEqual([]);
    expect(findingsOf(section("Speed With Safety"))).toHaveLength(1);
  });
});

describe("chicago-headline — abbreviations, comments, ligatures", () => {
  it.each([
    "Replicating Smith et al. on New Data",
    "Replicating Smith et al on New Data",
    "Tools, etc. and More",
    "Results, cf. Prior Work",
    "Results, i.e. Prior Work",
    "Speed vs. Safety",
    "An approx. Answer",
    "Tools, Fonts, etc.",
  ])("🔴 never read, never fixed: %s", (title) => {
    expect(findingsOf(section(title))).toEqual([]);
    expect(fixed(section(title))).toBe(section(title));
  });

  it("a word followed by a full stop inside the title is not read; the last word still is", () => {
    expect(findingsOf(section("Fast. Then Slow"))).toEqual([]);
    expect(fixed(section("Threats to validity."))).toBe(
      section("Threats to Validity."),
    );
  });

  it("🔴 a % comment inside a title separates the words around it", () => {
    const src = "\\title{Agents for % a comment\nthe Masses}";
    expect(wordsOf(src)).toEqual([]);
    expect(wordsOf("\\title{Agents for % a comment\nthe masses}")).toEqual([
      "masses",
    ]);
  });

  it("🔴 a word starting with a ligature is not read: its capital is two letters", () => {
    expect(findingsOf(section("The \uFB01nding"))).toEqual([]);
    expect(fixed(section("The \uFB01nding"))).toBe(section("The \uFB01nding"));
  });
});

describe("\\iffalse … \\fi", () => {
  it("🔴 a title or heading TeX never reads is not judged", () => {
    expect(
      findingsOf(
        "\\iffalse\n\\title{old dead title}\n\\section{old dead}\n\\fi",
      ),
    ).toEqual([]);
  });
});
