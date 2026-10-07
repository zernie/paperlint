/**
 * The `bib` rules through real ESLint on the `tex/latex` language: `bib/reachable-entry` judges the
 * entries of the databases the build's bibtex OPENED (`_build/sources.json`), fires, stays silent, and
 * reports where the entry is — on its line in `paper.tex` for a `.bib` TeX wrote from a block there,
 * at the top of `paper.tex` with `refs.bib:3:1:` first for any other. A paper with no record, or one
 * that changed since, gets nothing from this rule (`paper/sources-fresh` speaks once instead).
 * On the planted papers of fixtures/paper-sources too, with the record TeX wrote for each.
 */
import { join } from "node:path";
import { ESLint, type Linter } from "eslint";
import { describe, expect, it } from "vitest";
import { texLanguage } from "../eslint-rules/latex-language.ts";
import { bibReader } from "./adapters/bibtex/index.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { BIB_RULE_LEVELS, bibRules } from "./bib-rules.ts";
import { eslintConfig } from "./cli.ts";
import {
  leftByTeX,
  planted,
  recordText,
  type Shape,
} from "../test/recorded-paper.ts";
import { present } from "../test/support.ts";

const PAPER = "/work/papers/p";

/** A paper in memory: its files by relative path, and the record its build wrote (none: not built). */
interface Paper {
  readonly tex: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly record?: string | Shape | null;
}

/** Lint `paper.tex` (or `file`) of a paper laid out as TeX leaves it. */
async function lint(
  p: Paper,
  { file = "paper.tex", buffer = p.tex } = {},
): Promise<{ messages: Linter.LintMessage[] }> {
  const all = { "paper.tex": p.tex, ...p.files };
  const record =
    p.record === undefined || p.record === null
      ? null
      : typeof p.record === "string"
        ? p.record
        : recordText(all, p.record);
  const files = memoryFiles({
    ...Object.fromEntries(
      Object.entries(all).map(([rel, text]) => [`${PAPER}/${rel}`, text]),
    ),
    ...(record === null ? {} : { [`${PAPER}/_build/sources.json`]: record }),
  });
  const eslint = new ESLint({
    cwd: "/work",
    overrideConfigFile: true,
    overrideConfig: eslintConfig([
      {
        files: ["**/*.tex"],
        plugins: {
          tex: { languages: { latex: texLanguage } },
          bib: {
            rules: bibRules({
              files,
              codec: sourcesCodec,
              latex: latexReader,
              bib: bibReader,
            }),
          },
        },
        language: "tex/latex",
        linterOptions: { reportUnusedDisableDirectives: "error" },
        rules: BIB_RULE_LEVELS,
      },
    ]),
  });
  const [res] = await eslint.lintText(buffer, {
    filePath: join(PAPER, file),
  });
  const r = present(res, "one lint result");
  expect(r.messages.filter((m) => m.fatal)).toEqual([]);
  return { messages: r.messages };
}

const found = (
  messages: readonly Linter.LintMessage[],
  rule: string,
): readonly (readonly [number, number, string])[] =>
  messages
    .filter((m) => m.ruleId === `bib/${rule}`)
    .map((m) => [m.line, m.column, m.message] as const);

/** A paper whose bibliography is a block, and the `.bib` TeX wrote from it, as a build leaves them. */
const inline = (entries: string): Paper => ({
  tex: `\\documentclass{acmart}\n\\begin{filecontents*}[overwrite]{refs.bib}\n${entries}\n\\end{filecontents*}\n\\begin{document}\nx\n\\bibliography{refs}\n\\end{document}\n`,
  files: { "refs.bib": `${entries}\n` },
  record: {
    inputs: [["paper.tex", "body"]],
    written: ["refs.bib"],
    databases: ["refs.bib"],
  },
});

const DECLARING =
  "\\documentclass{acmart}\n\\begin{document}\nx\n\\bibliography{refs}\n\\end{document}\n";
const KEPT: Shape = {
  inputs: [
    ["paper.tex", "body"],
    ["refs.bib", "preamble"],
  ],
  databases: ["refs.bib"],
};
/** A paper whose bibliography is the `refs.bib` the author keeps. */
const declaring = (bib: string): Paper => ({
  tex: DECLARING,
  files: { "refs.bib": bib },
  record: KEPT,
});

describe("bib/reachable-entry", () => {
  it("a doi, a url or an arXiv id each make an entry reachable; @string is not an entry", async () => {
    const { messages } = await lint(
      inline(
        "@article{a, doi = {10.1/x}}\n@misc{b, url = {https://x.org}}\n@misc{c, note = {arXiv:2310.05736}}\n@string{v = {x}}",
      ),
    );
    expect(found(messages, "reachable-entry")).toEqual([]);
  });

  // Measured on the accepted corpus: 89 entries carry their only link as `howpublished = {\url{…}}`,
  // which the bibliography style typesets — a link the reader has.
  it("a \\url or \\href in any field is a link the reader has; a bare address in a field the style drops is not", async () => {
    const { messages } = await lint(
      inline(
        "@misc{web, howpublished = {\\url{https://x.org}}}\n@misc{ref, note = {see \\href{https://x.org}{here}}}\n@techreport{src, source = {http://x.org}}",
      ),
    );
    expect(
      found(messages, "reachable-entry").map((m) => m[2].slice(0, 5)),
    ).toEqual(["`src`"]);
  });
});

describe("bib/reachable-entry — keys and where a finding goes", () => {
  it("an entry written with no key is named `?`", async () => {
    const { messages } = await lint(inline("@article{, title = {x}}"));
    expect(
      found(messages, "reachable-entry").map((m) => m[2].slice(0, 3)),
    ).toEqual(["`?`"]);
  });

  it("an entry of a `.bib` TeX wrote from a block of paper.tex is reported on its own line there", async () => {
    const { messages } = await lint(
      inline("@misc{ok, url = {https://x.org}}\n@article{lost, title = {x}}"),
    );
    expect(found(messages, "reachable-entry")).toEqual([
      [4, 1, expect.stringMatching(/^`lost` has no doi/)],
    ]);
  });

  it("🔴 an entry in refs.bib — a file the author keeps — is reported at the top of paper.tex, with its file and line", async () => {
    const { messages } = await lint(
      declaring(
        "@misc{ok, url = {https://x.org}}\n\n@article{lost, title = {x}}\n",
      ),
    );
    expect(found(messages, "reachable-entry")).toEqual([
      [1, 1, expect.stringMatching(/^refs\.bib:3:1: `lost` has no doi/)],
    ]);
  });

  it("in a .bib, the directive on the line above the entry keeps the exception where the entry is", async () => {
    const { messages } = await lint(
      declaring(
        "% eslint-disable-next-line bib/reachable-entry -- an invited talk, no recording exists\n@misc{talk, title = {x}}\n" +
          "% eslint-disable-next-line bib/other-rule\n@misc{lost, title = {y}}\n",
      ),
    );
    expect(found(messages, "reachable-entry").map((m) => m[2])).toEqual([
      expect.stringMatching(/^refs\.bib:4:1: `lost`/),
    ]);
  });

  it("🔴 inside the block, a disable directive silences exactly the next entry", async () => {
    const { messages } = await lint(
      inline(
        "% eslint-disable-next-line bib/reachable-entry -- an invited talk, no recording exists\n@misc{talk, title = {x}}\n@misc{lost, title = {y}}",
      ),
    );
    expect(found(messages, "reachable-entry").map((m) => m[2])).toEqual([
      expect.stringMatching(/^`lost`/),
    ]);
  });
});

describe("bib/reachable-entry — a block is only a lookup of where the text stands", () => {
  it("🔴 the block is a lookup of where the text stands: when paper.tex no longer holds what TeX read, the finding is at the top, naming the .bib", async () => {
    const p = inline("@article{lost, title = {x}}");
    const { messages } = await lint(p, {
      buffer: p.tex.replace("{x}", "{edited since the build}"),
    });
    expect(found(messages, "reachable-entry")).toEqual([
      [1, 1, expect.stringMatching(/^refs\.bib:1:1: `lost`/)],
    ]);
  });

  it("a block in an included file: the finding is at the top of paper.tex, naming the entry in the file that holds the block", async () => {
    const entries =
      "@misc{ok, url = {https://x.org}}\n@article{lost, title = {x}}";
    const { messages } = await lint({
      tex: "\\documentclass{acmart}\n\\input{bibblock}\n\\begin{document}\nx\n\\bibliography{refs}\n\\end{document}\n",
      files: {
        "bibblock.tex": `\\begin{filecontents*}{refs.bib}\n${entries}\n\\end{filecontents*}\n`,
        "refs.bib": `${entries}\n`,
      },
      record: {
        inputs: [
          ["paper.tex", "body"],
          ["bibblock.tex", "preamble"],
        ],
        written: ["refs.bib"],
        databases: ["refs.bib"],
      },
    });
    expect(found(messages, "reachable-entry")).toEqual([
      [1, 1, expect.stringMatching(/^bibblock\.tex:3:1: `lost`/)],
    ]);
  });
});

describe("bib/reachable-entry — which bibliography: the one bibtex opened", () => {
  it("only the databases the build's bibtex opened are judged, not every .bib that lies in the folder", async () => {
    const { messages } = await lint({
      ...declaring("@misc{r1, title = {x}}\n"),
      files: {
        "refs.bib": "@misc{r1, title = {x}}\n",
        "anon.bib": "@misc{a1, title = {x}}\n",
      },
    });
    expect(
      found(messages, "reachable-entry").map((m) => m[2].slice(0, 16)),
    ).toEqual(["refs.bib:1:1: `r"]);
  });

  it("a paper with no record is not judged: paper/sources-fresh says it was not built", async () => {
    const p = declaring("@misc{lost, title = {x}}\n");
    expect(
      found((await lint({ ...p, record: null })).messages, "reachable-entry"),
    ).toEqual([]);
  });

  it("🔴 a record the paper has changed since is not judged either — the entries it names may be gone", async () => {
    const p = declaring("@misc{lost, title = {x}}\n");
    const record = recordText({ "paper.tex": p.tex, ...p.files }, KEPT);
    expect(
      found(
        (
          await lint({
            ...p,
            files: {
              "refs.bib": "@misc{lost, title = {x}, note = {edited}}\n",
            },
            record,
          })
        ).messages,
        "reachable-entry",
      ),
    ).toEqual([]);
  });

  it("a build whose bibtex ran none, and a database that is not on disk now, hold no entries to judge", async () => {
    const none = declaring("@misc{lost, title = {x}}\n");
    expect(
      found(
        (await lint({ ...none, record: { inputs: [["paper.tex", "body"]] } }))
          .messages,
        "reachable-entry",
      ),
    ).toEqual([]);
    const gone = await lint({
      tex: DECLARING,
      files: {},
      record: {
        inputs: [["paper.tex", "body"]],
        databases: ["refs.bib"],
      },
    });
    expect(found(gone.messages, "reachable-entry")).toEqual([]);
  });
});

describe("bib/reachable-entry — which file", () => {
  it("only paper.tex is judged", async () => {
    const { messages } = await lint(inline("@article{lost, title = {x}}"), {
      file: "sections/a.tex",
    });
    expect(messages).toEqual([]);
  });
});

// ── the planted papers ─────────────────────────────────────────────────────────────────────

describe("on the planted papers (fixtures/paper-sources, the record TeX wrote in tex-truth.json)", () => {
  // The entries of the databases bibtex opened that carry no doi, url or arXiv id. A `.bib` TeX
  // wrote is on disk after a build (`written`), holding the lines of its block. An entry only
  // bibtex reads (v5: behind `%`) is the post-build check's, not this rule's.
  it.each([
    ["v1-stale", []],
    ["v5-percent-entry", []],
    ["v6-unclosed", ["a3"]],
    ["v8-jobname", ["jkey"]],
    ["v16-included-block", ["stale"]],
    ["v24-quoted-fields", ["q2", "q3", "q4", "q5"]],
    ["v25-string-differs", ["k1"]],
  ])("%s: %j", async (name, keys) => {
    const p = planted(name);
    const { messages } = await lint({
      tex: p.files["paper.tex"] ?? "",
      files: leftByTeX(p),
      record: p.record,
    });
    expect(
      messages.map((m) => [m.ruleId, /`([^`]+)`/.exec(m.message)?.[1]]),
    ).toEqual(keys.map((k) => ["bib/reachable-entry", k]));
  });

  it("v8-jobname: the entry of the paper.bib TeX wrote is at its line in the block that wrote it", async () => {
    const p = planted("v8-jobname");
    const { messages } = await lint({
      tex: p.files["paper.tex"] ?? "",
      files: leftByTeX(p),
      record: p.record,
    });
    expect(found(messages, "reachable-entry")).toEqual([
      [3, 1, expect.stringMatching(/^`jkey` has no doi/)],
    ]);
  });
});
