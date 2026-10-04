/**
 * `tex/heading-case` through the whole CLI, on small paper trees: what turns it on and what it says
 * once it is on, the configurations it refuses when ESLint loads it, the fixes `--fix` writes, a
 * title or heading in an included file, and the escape hatch. The words the judge asks for are
 * tested where it lives (`src/domain/heading-case.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { run } from "./cli.ts";
import { headingCaseRule } from "./heading-case.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const Results = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        severity: z.number(),
        line: z.number().optional(),
        message: z.string(),
      }),
    ),
  }),
);

const ACM = "\\documentclass[sigconf]{acmart}";
const doc = (body: string): string =>
  `${ACM}\n\\begin{document}\n${body}\n\\end{document}\n`;

const paper = (
  tex: string,
  settings: Record<string, unknown> | null,
  extra: Record<string, string> = {},
): Record<string, string> => ({
  "package.json": '{"name":"consumer","private":true}',
  "papers/p/PIPELINE-STATUS.md": "---\nstages: []\n---\n# PIPELINE-STATUS\n",
  "papers/p/paper.tex": tex,
  ...(settings === null
    ? {}
    : { "papers/p/paperlint.json": JSON.stringify(settings) }),
  ...extra,
});

/** Lint the tree; the messages of `tex/heading-case` as `file:line:severity message`, and the project dir. */
async function lint(
  tree: Record<string, string>,
  args: readonly string[] = [],
): Promise<{ found: string[]; dir: string }> {
  const dir = writeTree(useTempDir("paperlint-heading-case-"), tree);
  const out: string[] = [];
  await run(["lint", "--json", ...args], {
    cwd: dir,
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: () => undefined,
  });
  const found = Results.parse(JSON.parse(out.join("\n"))).flatMap((r) =>
    r.messages
      .filter((m) => m.ruleId === "tex/heading-case")
      .map(
        (m) =>
          `${r.filePath.slice(dir.length + 1)}:${String(m.line)}:${String(m.severity)} ${m.message}`,
      ),
  );
  return { found, dir };
}

/**
 * What a lint run threw when ESLint loaded the rule with `entry`: its message, whole, with the
 * temporary project directory written `<project>`.
 */
async function refusal(entry: unknown): Promise<string> {
  const settings = { rules: { "tex/heading-case": entry } };
  return lint(paper(doc("\\section{Related Work}"), settings)).then(
    () => "no error",
    (e: unknown) =>
      (e instanceof Error ? e.message : String(e)).replace(
        /\S*paperlint-heading-case-[^/]+/gu,
        "<project>",
      ),
  );
}

const PRESET = { extends: "paperlint:agenticdev", kind: "short" };
const CHICAGO = { title: "chicago-headline", headings: "chicago-headline" };
const SENTENCE_CASE = [
  "\\section{Related work}",
  "\\subsection{The advertised savings don't show up}",
  "\\section{Method: a cost-aware, correctness-gated harness}",
  "\\subsection{A ceiling for any output-trimming tool}",
].join("\n");
const HEADLINE_CASE = [
  "\\section{Related Work}",
  "\\subsection{The Advertised Savings Don't Show Up}",
  "\\section{Method: A Cost-Aware, Correctness-Gated Harness}",
  "\\subsection{A Ceiling for Any Output-Trimming Tool}",
].join("\n");
/** A paper whose preamble holds `title` (a whole `\\title…` command). */
const titled = (title: string, body = "\\section{Introduction}"): string =>
  `${ACM}\n${title}\n\\begin{document}\n\\maketitle\n${body}\n\\end{document}\n`;

describe("tex/heading-case on a paper that extends the AgenticDev preset", () => {
  it("🔴 reports every sentence-case heading, as an error, on its line", async () => {
    const { found } = await lint(paper(doc(SENTENCE_CASE), PRESET));
    expect(found.map((f) => f.slice(0, f.indexOf(" ")))).toEqual([
      "papers/p/paper.tex:3:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:4:2",
      "papers/p/paper.tex:5:2",
      "papers/p/paper.tex:5:2",
      "papers/p/paper.tex:5:2",
      "papers/p/paper.tex:5:2",
      "papers/p/paper.tex:6:2",
      "papers/p/paper.tex:6:2",
      "papers/p/paper.tex:6:2",
      "papers/p/paper.tex:6:2",
    ]);
    expect(found[0]).toBe(
      "papers/p/paper.tex:3:2 \\section: capitalize «work» → «Work» — the last word of a heading is capitalized (chicago-headline)",
    );
  });

  it("🔴 stays silent on the corrected headings", async () => {
    expect((await lint(paper(doc(HEADLINE_CASE), PRESET))).found).toEqual([]);
  });

  it("--fix writes the corrected headings, and a second run is clean", async () => {
    const tree = paper(doc(SENTENCE_CASE), PRESET);
    const { dir } = await lint(tree, ["--fix"]);
    expect(readFileSync(join(dir, "papers/p/paper.tex"), "utf8")).toBe(
      doc(HEADLINE_CASE),
    );
    const again: string[] = [];
    await run(["lint", "--json"], {
      cwd: dir,
      log: (...a: unknown[]) => again.push(a.join(" ")),
      err: () => undefined,
    });
    expect(again.join("\n")).not.toContain("tex/heading-case");
  });
});

describe("tex/heading-case on an AgenticDev paper — its \\title, and the paper's own choices", () => {
  it("🔴 judges the paper's \\title too, short and long, at the line each stands on", async () => {
    const tex = titled(
      "\\title[the short\n  one]{Measuring the wrong\n  thing}",
    );
    const { found } = await lint(paper(tex, PRESET));
    expect(found).toEqual([
      "papers/p/paper.tex:2:2 \\title[…]: capitalize «the» → «The» — the first word of a title is capitalized (chicago-headline)",
      "papers/p/paper.tex:2:2 \\title[…]: capitalize «short» → «Short» — nouns, pronouns, verbs, adjectives and adverbs are capitalized (chicago-headline)",
      "papers/p/paper.tex:3:2 \\title[…]: capitalize «one» → «One» — the last word of a title is capitalized (chicago-headline)",
      "papers/p/paper.tex:3:2 \\title: capitalize «wrong» → «Wrong» — nouns, pronouns, verbs, adjectives and adverbs are capitalized (chicago-headline)",
      "papers/p/paper.tex:4:2 \\title: capitalize «thing» → «Thing» — the last word of a title is capitalized (chicago-headline)",
    ]);
  });

  it("--fix writes the corrected \\title, and leaves code and math in it alone", async () => {
    const tree = paper(
      titled("\\title{Why \\texttt{grep} fails for $k$ in practice}"),
      PRESET,
    );
    const { dir } = await lint(tree, ["--fix"]);
    expect(readFileSync(join(dir, "papers/p/paper.tex"), "utf8")).toBe(
      titled("\\title{Why \\texttt{grep} Fails for $k$ in Practice}"),
    );
  });
});

describe("tex/heading-case on an AgenticDev paper — what the paper changes for itself", () => {
  it("the paper turns it off in its own paperlint.json", async () => {
    const off = { ...PRESET, rules: { "tex/heading-case": "off" } };
    expect((await lint(paper(doc(SENTENCE_CASE), off))).found).toEqual([]);
  });

  it("the paper chooses its own styles: sentence asks only for the first word", async () => {
    const own = {
      ...PRESET,
      rules: {
        "tex/heading-case": ["error", { title: "any", headings: "sentence" }],
      },
    };
    expect((await lint(paper(doc(SENTENCE_CASE), own))).found).toEqual([]);
    const { found } = await lint(paper(doc("\\section{related work}"), own));
    expect(found).toEqual([
      "papers/p/paper.tex:3:2 \\section: capitalize the first word, «related» → «Related» (sentence; not fixed: a product name written in lowercase looks the same)",
    ]);
  });

  it("a level the paper names follows its own style, the others follow `headings`", async () => {
    const own = {
      ...PRESET,
      rules: {
        "tex/heading-case": [
          "error",
          { ...CHICAGO, levels: { paragraph: "sentence" } },
        ],
      },
    };
    const body = "\\section{Related Work}\n\\paragraph{Threats to validity.}";
    expect((await lint(paper(doc(body), own))).found).toEqual([]);
    const loose = "\\section{Related work}\n\\paragraph{threats to validity.}";
    expect((await lint(paper(doc(loose), own))).found).toEqual([
      "papers/p/paper.tex:3:2 \\section: capitalize «work» → «Work» — the last word of a heading is capitalized (chicago-headline)",
      "papers/p/paper.tex:4:2 \\paragraph: capitalize the first word, «threats» → «Threats» (sentence; not fixed: a product name written in lowercase looks the same)",
    ]);
  });
});

describe("tex/heading-case on an AgenticDev paper — where a finding stands, and the directive", () => {
  it("🔴 a heading over several lines: each word on its own line, and a directive below it still applies (LF and CRLF)", async () => {
    for (const nl of ["\n", "\r\n"]) {
      const body = [
        "\\section{Related",
        "work in the field}",
        "% eslint-disable-next-line tex/heading-case -- the tool's own name is lowercase",
        "\\section{Evaluating vigiles}",
      ].join(nl);
      const { found } = await lint(paper(doc(body), PRESET));
      expect(found.map((f) => f.slice(0, f.indexOf(" ")))).toEqual([
        "papers/p/paper.tex:4:2",
        "papers/p/paper.tex:4:2",
      ]);
      expect(
        found.map((f) => f.slice(f.indexOf("«"), f.indexOf("»") + 1)),
      ).toEqual(["«work»", "«field»"]);
    }
  });

  it("a disable directive with its reason silences one heading", async () => {
    const body = [
      "% eslint-disable-next-line tex/heading-case -- the tool's own name is lowercase",
      "\\section{Evaluating vigiles}",
    ].join("\n");
    expect((await lint(paper(doc(body), PRESET))).found).toEqual([]);
  });
});

describe("tex/heading-case on a paper whose preset does not turn it on", () => {
  const SENTENCE_TITLED = titled(
    "\\title{Measuring the wrong thing}",
    SENTENCE_CASE,
  );

  it("🔴 is silent with no preset", async () => {
    expect((await lint(paper(SENTENCE_TITLED, null))).found).toEqual([]);
  });

  it.each([
    ["acm-sigconf", undefined],
    ["aisec", "research"],
    ["ieee-conference", undefined],
    ["aidc", "short"],
    ["realm", "short"],
  ])(
    "🔴 is silent on paperlint:%s: its venue's case rule was not read, or is a variant not built",
    async (venue, kind) => {
      const settings = {
        extends: `paperlint:${venue}`,
        ...(kind === undefined ? {} : { kind }),
      };
      expect((await lint(paper(SENTENCE_TITLED, settings))).found).toEqual([]);
    },
  );

  it("a paper turns it on for itself", async () => {
    const own = { rules: { "tex/heading-case": ["error", CHICAGO] } };
    const { found } = await lint(paper(doc("\\section{Related work}"), own));
    expect(found).toHaveLength(1);
  });

  it("🔴 turned on with no options it says so once, and does not pass as a check that ran", async () => {
    const own = { rules: { "tex/heading-case": "error" } };
    const { found } = await lint(paper(doc("\\section{related work}"), own));
    expect(found).toEqual([
      'papers/p/paper.tex:1:2 tex/heading-case is on with no options, so it judged nothing: give it the styles the venue asks, e.g. ["error", {"title": "chicago-headline", "headings": "chicago-headline"}] (styles: "chicago-headline", "sentence", "any")',
    ]);
  });
});

const LOADING = "Error while loading rule 'tex/heading-case': ";
const DOCS_URL =
  "https://github.com/zernie/paperlint/blob/main/docs/rules/tex/heading-case.md";
/** Where a refusal ends: the rule's page, and the file ESLint was linting when it loaded the rule. */
const REFUSED_AT = `${DOCS_URL}\nOccurred while linting <project>/papers/p/paper.tex`;

describe("tex/heading-case refuses a style value when ESLint loads it", () => {
  it("🔴 the bare word «headline», naming the style it meant and why the word is gone", async () => {
    expect(
      await refusal(["error", { title: "headline", headings: "headline" }]),
    ).toBe(
      `${LOADING}"title" is "headline", which names no single style: write "chicago-headline" for the Chicago Manual of Style headline style. Other headline variants (APA title case, IEEE, Springer) are not implemented yet, and they disagree with Chicago on words such as With, Between and From — ${REFUSED_AT}`,
    );
  });

  it("🔴 «off» as a style", async () => {
    expect(await refusal(["error", { ...CHICAGO, headings: "off" }])).toBe(
      `${LOADING}"headings" is "off", which is not a style: write "any" to leave this scope unconstrained, or turn the whole rule off with "tex/heading-case": "off" — ${REFUSED_AT}`,
    );
  });

  it("🔴 a misspelt style, naming the ones there are", async () => {
    expect(
      await refusal(["error", { ...CHICAGO, title: "chicago-headlin" }]),
    ).toBe(
      `${LOADING}"title" is "chicago-headlin", which is not a style: one of "chicago-headline", "sentence", "any" — ${REFUSED_AT}`,
    );
  });

  it("🔴 a misspelt style at a level names the level", async () => {
    expect(
      await refusal([
        "error",
        { ...CHICAGO, levels: { paragraph: "Sentence" } },
      ]),
    ).toBe(
      `${LOADING}"levels.paragraph" is "Sentence", which is not a style: one of "chicago-headline", "sentence", "any" — ${REFUSED_AT}`,
    );
  });
});

describe("tex/heading-case refuses, when ESLint loads it, a configuration that asks nothing or has the wrong shape", () => {
  it("🔴 «any» for the title and for every heading: the rule turned off, said another way", async () => {
    expect(await refusal(["error", { title: "any", headings: "any" }])).toBe(
      `${LOADING}"title" and "headings" are both "any" and no level asks for more: that is the rule turned off — remove it from "rules", or set it to "off" — ${REFUSED_AT}`,
    );
    expect(
      await refusal([
        "error",
        { title: "any", headings: "any", levels: { section: "any" } },
      ]),
    ).toBe(
      `${LOADING}"title" and "headings" are both "any" and no level asks for more: that is the rule turned off — remove it from "rules", or set it to "off" — ${REFUSED_AT}`,
    );
    // Guards: a level that asks for more makes the same pair a real configuration.
    expect(
      await refusal([
        "error",
        { title: "any", headings: "any", levels: { section: "sentence" } },
      ]),
    ).toBe("no error");
  });

  it("🔴 the old `style` key, an unknown key, a missing scope and an unknown level, in ESLint's words", async () => {
    expect(await refusal(["error", { style: "headline" }])).toBe(
      'Key "rules": Key "tex/heading-case":\n\tValue {"style":"headline"} should NOT have additional properties.\n\t\tUnexpected property "style". Expected properties: "title", "headings", "levels".\n',
    );
    expect(await refusal(["error", { ...CHICAGO, captions: "sentence" }])).toBe(
      'Key "rules": Key "tex/heading-case":\n\tValue {"title":"chicago-headline","headings":"chicago-headline","captions":"sentence"} should NOT have additional properties.\n\t\tUnexpected property "captions". Expected properties: "title", "headings", "levels".\n',
    );
    expect(await refusal(["error", { title: "chicago-headline" }])).toBe(
      'Key "rules": Key "tex/heading-case":\n\tValue {"title":"chicago-headline"} should have required property \'headings\'.\n',
    );
    expect(await refusal(["error", { headings: "chicago-headline" }])).toBe(
      'Key "rules": Key "tex/heading-case":\n\tValue {"headings":"chicago-headline"} should have required property \'title\'.\n',
    );
    expect(
      await refusal(["error", { ...CHICAGO, levels: { chapter: "sentence" } }]),
    ).toBe(
      'Key "rules": Key "tex/heading-case":\n\tValue {"chapter":"sentence"} should NOT have additional properties.\n\t\tUnexpected property "chapter". Expected properties: "section", "subsection", "subsubsection", "paragraph", "subparagraph".\n',
    );
  });
});

describe("tex/heading-case in the files a paper includes", () => {
  const tree = paper(
    doc("\\section{Introduction}\n\\input{sections/results}"),
    PRESET,
    { "papers/p/sections/results.tex": "\\section{Results and discussion}\n" },
  );

  it("reports a heading at its own file and line, and --fix edits that file", async () => {
    const { found, dir } = await lint(tree, ["--fix"]);
    expect(found).toEqual([]);
    expect(
      readFileSync(join(dir, "papers/p/sections/results.tex"), "utf8"),
    ).toBe("\\section{Results and Discussion}\n");
  });

  it("reports without --fix", async () => {
    const { found } = await lint(tree);
    expect(found.map((f) => f.slice(0, f.indexOf(" ")))).toEqual([
      "papers/p/sections/results.tex:1:2",
    ]);
  });

  it("🔴 reads a \\title kept in a file the body includes, where it stands", async () => {
    const withTitle = paper(
      `${ACM}\n\\begin{document}\n\\input{front}\n\\maketitle\n\\end{document}\n`,
      PRESET,
      {
        "papers/p/front.tex": "% the front matter\n\\title{Measuring things}\n",
      },
    );
    const { found } = await lint(withTitle);
    expect(found).toEqual([
      "papers/p/front.tex:2:2 \\title: capitalize «things» → «Things» — the last word of a title is capitalized (chicago-headline)",
    ]);
  });
});

const rule = headingCaseRule({ latex: latexReader });

describe("the rule's own contract", () => {
  const STYLE = { type: "string" };

  it("takes a style for the title and for the headings, and optionally per level", () => {
    expect(rule.meta.schema).toEqual([
      {
        type: "object",
        properties: {
          title: STYLE,
          headings: STYLE,
          levels: {
            type: "object",
            properties: {
              section: STYLE,
              subsection: STYLE,
              subsubsection: STYLE,
              paragraph: STYLE,
              subparagraph: STYLE,
            },
            additionalProperties: false,
          },
        },
        required: ["title", "headings"],
        additionalProperties: false,
      },
    ]);
    expect(rule.meta.fixable).toBe("code");
  });
});

describe("the rule's create, called without ESLint", () => {
  /** What `create` does with `options` on `raw`: the message ids it reported, or what it threw. */
  function created(
    options: readonly unknown[],
    raw = "\\section{related}",
  ): string[] {
    const reported: string[] = [];
    try {
      rule
        .create({
          options,
          sourceCode: {
            text: raw,
            getLocFromIndex: (i: number) => ({ line: 1, column: i }),
          },
          report: (d) => reported.push(d.messageId),
        })
        .root?.();
    } catch (e) {
      return [e instanceof Error ? e.message : String(e)];
    }
    return reported;
  }

  it("reads the file's text when the language gives no raw source", () => {
    expect(created([CHICAGO])).toEqual(["capitalize"]);
  });

  it("refuses what ESLint's schema would have stopped, when called without it", () => {
    expect(created(["headline"])).toEqual([
      `the options are "headline", not an object such as {"title": "chicago-headline", "headings": "chicago-headline"} — ${DOCS_URL}`,
    ]);
    expect(created([{ headings: "sentence" }])).toEqual([
      `"title" is missing, which is not a style: one of "chicago-headline", "sentence", "any" — ${DOCS_URL}`,
    ]);
    expect(created([{ ...CHICAGO, levels: "sentence" }])).toEqual([
      `"levels" is "sentence", not an object such as {"paragraph": "sentence"} — ${DOCS_URL}`,
    ]);
    expect(created([{ ...CHICAGO, levels: { section: 3 } }])).toEqual([
      `"levels.section" is 3, which is not a style: one of "chicago-headline", "sentence", "any" — ${DOCS_URL}`,
    ]);
  });

  it("a word split by markup is reported, and without a fix", () => {
    const reported: { readonly messageId: string; readonly fix?: unknown }[] =
      [];
    const sourceCode = {
      text: "",
      getLocFromIndex: (i: number) => ({ line: 1, column: i }),
    };
    rule
      .create({
        options: [CHICAGO],
        sourceCode: { ...sourceCode, raw: "\\section{a\\emph{b}c}" },
        report: (d) => reported.push(d),
      })
      .root?.();
    expect(reported.map((d) => d.messageId)).toEqual(["capitalize"]);
    expect(reported[0]?.fix).toBeUndefined();
  });
});
