/**
 * Terms against their definitions, on real parses: what is read as a definition, what as a use,
 * and the two findings — a use before the first definition, a definition set again.
 */
import { describe, expect, it } from "vitest";
import { latexReader } from "../adapters/latex/index.ts";
import { bodySentences } from "./register.ts";
import {
  DEFAULT_TERM_OPTIONS,
  definedAgain,
  definitionsOf,
  isDefinition,
  usedBefore,
  usePattern,
  usesOf,
  type TermOptions,
} from "./term-definitions.ts";

const doc = (body: string, abstract = ""): string =>
  `\\documentclass{article}\n\\begin{document}\n${
    abstract === "" ? "" : `\\begin{abstract}\n${abstract}\n\\end{abstract}\n`
  }${body}\n\\end{document}\n`;

/** The paper as the rules read it: definitions, sentences, the abstract's span. */
const read = (src: string, opts: TermOptions = DEFAULT_TERM_OPTIONS) => {
  const abstract = latexReader.abstractSpan(src);
  return {
    abstract,
    defs: definitionsOf(latexReader.bodyEmphasis(src), opts, abstract),
    sentences: bodySentences(latexReader.bodyProse(src)),
  };
};

/** The terms the body defines, as written. */
const defined = (src: string, opts?: TermOptions): readonly string[] =>
  read(src, opts).defs.map((d) => d.text);

/** Each term used before its definition: `term: first use … definition (count)`, as source text. */
const before = (src: string, opts?: TermOptions): readonly string[] => {
  const r = read(src, opts);
  return usedBefore(r.defs, r.sentences, r.abstract).map(
    (u) =>
      `${u.term}: ${src.slice(u.firstUse.start, u.firstUse.end)} @${String(u.firstUse.start < u.definition.span.start)} ×${String(u.count)}`,
  );
};

/** Each later definition, as its source text and the first's. */
const again = (src: string, opts?: TermOptions): readonly string[] =>
  definedAgain(read(src, opts).defs).map(
    (d) =>
      `${src.slice(d.again.span.start, d.again.span.end)} after ${src.slice(d.first.span.start, d.first.span.end)}`,
  );

describe("a definition: a phrase set with the commands, 1–maxWords words, a word that names something", () => {
  it("🔴 \\emph by default; \\textit, \\textbf and a {\\em …} group only when the option names them", () => {
    const src = doc(
      "A \\emph{witness} is a file. A \\textit{gate} blocks. A {\\em probe} asks. A \\textbf{guard} stops.",
    );
    expect(defined(src)).toEqual(["witness"]);
    // Guards: \textit sets titles and variable names too, so it is read only on request.
    expect(
      defined(src, { commands: ["textit", "em", "textbf"], maxWords: 4 }),
    ).toEqual(["gate", "probe", "guard"]);
  });

  it("🔴 not a phrase longer than maxWords, holding a digit, ending on a stop, or of function words only", () => {
    expect(
      defined(
        doc(
          "We define \\emph{a long phrase of five words}, \\emph{run 2}, \\emph{gain:} and \\emph{not}. We did \\emph{not all} of it. A \\emph{read set} is kept.",
        ),
      ),
    ).toEqual(["read set"]);
    expect(
      defined(doc("We define \\emph{a long phrase of five words}."), {
        commands: ["emph"],
        maxWords: 6,
      }),
    ).toEqual(["a long phrase of five words"]);
  });

  it("🔴 not one in the abstract; not a run-in heading; an item's label counts", () => {
    expect(
      defined(
        doc(
          "\\emph{Scope.} The scope is narrow.\n\\begin{itemize}\n\\item \\emph{Gate}: blocks a call.\n\\end{itemize}",
          "We study \\emph{witness} files.",
        ),
      ),
    ).toEqual(["Gate"]);
  });

  it("an emphasised phrase of no word at all is none", () => {
    expect(
      isDefinition(
        {
          style: "italic",
          command: "emph",
          place: "inline",
          text: "",
          span: { start: 0, end: 1 },
        },
        DEFAULT_TERM_OPTIONS,
        null,
      ),
    ).toBe(false);
  });
});

describe("a use: whole words, the term's forms, case ignored unless the term is in capitals", () => {
  const matches = (term: string, text: string): readonly string[] =>
    [...text.matchAll(usePattern(term))].map((m) => m[0]);

  it("🔴 the forms: as written, +s, +es, y→ies, and without a final s; never inside a longer word", () => {
    expect(matches("witness", "Witness witnesses witnessed")).toEqual([
      "Witness",
      "witnesses",
    ]);
    expect(matches("query", "queries query querying")).toEqual([
      "queries",
      "query",
    ]);
    expect(matches("gate", "gates gate gated")).toEqual(["gates", "gate"]);
    expect(matches("rules", "a rule, two rules")).toEqual(["rule", "rules"]);
  });

  it("a term of several words matches across any spacing; one in capitals keeps its case", () => {
    expect(matches("read set", "the read\n  set and the Read Set")).toEqual([
      "read\n  set",
      "Read Set",
    ]);
    expect(matches("CI", "CI runs; ci is not it")).toEqual(["CI"]);
    expect(matches("c++", "in c++ and c")).toEqual(["c++"]);
  });
});

describe("tex/term-before-definition's finding: the first use before the first definition", () => {
  it("🔴 reports the first earlier use once, with how many there are", () => {
    expect(
      before(
        doc(
          "A gate runs. Every gate blocks.\n\nA \\emph{gate} is a check that blocks a call. The gate holds.",
        ),
      ),
    ).toEqual(["gate: gate @true ×2"]);
  });

  it("🔴 silent when the first use is the definition, and for a use in the defining sentence", () => {
    expect(
      before(
        doc(
          "A file the two readings disagree on, the witness, is a \\emph{witness}. The witness is kept.",
        ),
      ),
    ).toEqual([]);
  });

  it("🔴 a use in the abstract is no use", () => {
    expect(
      before(
        doc(
          "A \\emph{witness} is a file. The witness is kept.",
          "We find a witness in each repository.",
        ),
      ),
    ).toEqual([]);
  });

  it("silent for a term used only after it, a \\textit use is still a use, a table cell is no use", () => {
    expect(
      before(
        doc(
          "\\begin{tabular}{l}witness\\end{tabular}\nA \\emph{witness} is a file. The witness is kept.",
        ),
      ),
    ).toEqual([]);
    expect(
      before(
        doc("The \\textit{witness} came first. A \\emph{witness} is a file."),
      ),
    ).toEqual(["witness: witness @true ×1"]);
  });
});

describe("tex/term-defined-twice's finding: each later definition", () => {
  it("🔴 every definition after the first, in document order, against the first", () => {
    expect(
      again(
        doc(
          "A \\emph{witness} is a file. A \\emph{gate} blocks. Again, a \\emph{gate} is a check. A \\emph{Witness} is that file.",
        ),
      ),
    ).toEqual([
      "\\emph{gate} after \\emph{gate}",
      "\\emph{Witness} after \\emph{witness}",
    ]);
  });

  it("silent for one definition, a run-in heading after it, and a \\textit setting", () => {
    expect(
      again(
        doc(
          "A \\emph{witness} is a file.\n\n\\emph{Witness.} A witness is kept. The \\textit{witness} again.",
        ),
      ),
    ).toEqual([]);
  });
});

describe("a sentence or a match the parser gave no place is never a use", () => {
  it("reports nothing it cannot place", () => {
    const run = { segments: [{ text: "witness", at: 10 }] } as const;
    // A sentence reaching past its run, as no parse yields: no span, so no use.
    const lost = {
      text: "witness here",
      raw: "witness here",
      words: 2,
      first: "witness",
      run,
      from: 0,
    };
    expect(usesOf("witness", [lost], [], null)).toEqual([]);
    const fits = { ...lost, text: "witness", raw: "witness" };
    expect(usesOf("witness", [fits], [], null)).toEqual([
      { start: 10, end: 17 },
    ]);
  });
});
