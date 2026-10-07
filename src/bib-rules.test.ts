/**
 * The `bib` rules through real ESLint on the `tex/latex` language: `bib/reachable-entry` fires, stays
 * silent, and reports where the entry is (on its line in paper.tex, or at the `\bibliography` naming
 * the `.bib` that holds it). On the planted papers of fixtures/paper-sources too.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";
import { describe, expect, it } from "vitest";
import { texLanguage } from "../eslint-rules/latex-language.ts";
import { bibReader } from "./adapters/bibtex/index.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { BIB_RULE_LEVELS, bibRules } from "./bib-rules.ts";
import { eslintConfig } from "./cli.ts";
import { present } from "../test/support.ts";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PAPER = "/work/papers/p";

/** Lint `tex` as the paper's paper.tex (or `file`), beside `others`, every file committed. */
async function lint(
  tex: string,
  others: Readonly<Record<string, string>> = {},
  { file = "paper.tex" } = {},
): Promise<{ messages: Linter.LintMessage[] }> {
  const files = memoryFiles({ [`${PAPER}/paper.tex`]: tex, ...others });
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
              latex: latexReader,
              committed: { isCommitted: () => true },
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
  const [res] = await eslint.lintText(tex, { filePath: join(PAPER, file) });
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

/** A paper whose bibliography is a block. */
const inline = (entries: string): string =>
  `\\documentclass{acmart}\n\\begin{filecontents*}[overwrite]{refs.bib}\n${entries}\n\\end{filecontents*}\n\\begin{document}\nx\n\\bibliography{refs}\n\\end{document}\n`;
/** A paper whose bibliography is `refs.bib` on disk. */
const declaring =
  "\\documentclass{acmart}\n\\begin{document}\nx\n\\bibliography{refs}\n\\end{document}\n";

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

describe("bib/reachable-entry — keys and links", () => {
  it("an entry written with no key is named `?`", async () => {
    const { messages } = await lint(inline("@article{, title = {x}}"));
    expect(
      found(messages, "reachable-entry").map((m) => m[2].slice(0, 3)),
    ).toEqual(["`?`"]);
  });

  it("an entry in the block is reported on its own line, naming its key", async () => {
    const { messages } = await lint(
      inline("@misc{ok, url = {https://x.org}}\n@article{lost, title = {x}}"),
    );
    expect(found(messages, "reachable-entry")).toEqual([
      [4, 1, expect.stringMatching(/^`lost` has no doi/)],
    ]);
  });

  it("🔴 an entry in refs.bib — never read before — is reported at the \\bibliography, with its file and line", async () => {
    const { messages } = await lint(declaring, {
      [`${PAPER}/refs.bib`]:
        "@misc{ok, url = {https://x.org}}\n\n@article{lost, title = {x}}\n",
    });
    expect(found(messages, "reachable-entry")).toEqual([
      [4, 1, expect.stringMatching(/^refs\.bib:3:1: `lost` has no doi/)],
    ]);
  });

  it("in a .bib, the directive on the line above the entry keeps the exception where the entry is", async () => {
    const { messages } = await lint(declaring, {
      [`${PAPER}/refs.bib`]:
        "% eslint-disable-next-line bib/reachable-entry -- an invited talk, no recording exists\n@misc{talk, title = {x}}\n" +
        "% eslint-disable-next-line bib/other-rule\n@misc{lost, title = {y}}\n",
    });
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

describe("bib/reachable-entry — which bibliography, and which file", () => {
  it("every candidate of an undecided bibliography is judged; a block nothing declares, none", async () => {
    const switched =
      "\\documentclass{acmart}\n\\newif\\ifanon\n\\begin{document}\n\\ifanon\\bibliography{anon}\\else\\bibliography{refs}\\fi\n\\end{document}\n";
    const both = await lint(switched, {
      [`${PAPER}/anon.bib`]: "@misc{a1, title = {x}}\n",
      [`${PAPER}/refs.bib`]: "@misc{r1, title = {x}}\n",
    });
    expect(
      found(both.messages, "reachable-entry").map((m) => m[2].slice(0, 16)),
    ).toEqual(["anon.bib:1:1: `a", "refs.bib:1:1: `r"]);
    const stray = inline("@article{lost, title = {x}}").replace(
      "\\bibliography{refs}\n",
      "",
    );
    expect(found((await lint(stray)).messages, "reachable-entry")).toEqual([]);
  });

  it("a \\bibliography in an included file: the finding names the entry, at the start of paper.tex", async () => {
    const tex =
      "\\documentclass{acmart}\n\\begin{document}\nx\n\\input{back}\n\\end{document}\n";
    const { messages } = await lint(tex, {
      [`${PAPER}/back.tex`]: "\\bibliography{refs}\n",
      [`${PAPER}/refs.bib`]: "@article{lost, title = {x}}",
    });
    expect(found(messages, "reachable-entry")).toEqual([
      [1, 1, expect.stringMatching(/^refs\.bib:1:1: `lost`/)],
    ]);
  });

  it("a declared database on no disk, and a remote one, hold no entries to judge", async () => {
    const tex =
      "\\documentclass{acmart}\n\\addbibresource[location=remote]{https://example.org/r.bib}\n\\begin{document}\nx\n\\bibliography{gone,refs}\n\\end{document}\n";
    const { messages } = await lint(tex, {
      [`${PAPER}/refs.bib`]: "@article{lost, title = {x}}",
    });
    expect(
      found(messages, "reachable-entry").map((m) => m[2].slice(0, 16)),
    ).toEqual(["refs.bib:1:1: `l"]);
  });

  it("only paper.tex is judged", async () => {
    const { messages } = await lint(
      inline("@article{lost, title = {x}}"),
      {},
      { file: "sections/a.tex" },
    );
    expect(messages).toEqual([]);
  });
});

// ── the planted papers ─────────────────────────────────────────────────────────────────────

const PLANTED = join(ROOT, "fixtures", "paper-sources");

/** A planted paper's files other than paper.tex, under PAPER; and its paper.tex. */
function planted(paper: string): {
  tex: string;
  others: Record<string, string>;
} {
  const dir = join(PLANTED, paper);
  const all = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name));
  return {
    tex: readFileSync(join(dir, "paper.tex"), "utf8"),
    others: Object.fromEntries(
      all.map((f) => [join(PAPER, relative(dir, f)), readFileSync(f, "utf8")]),
    ),
  };
}

describe("on the planted papers (fixtures/paper-sources, TeX's answer in tex-truth.json)", () => {
  // The entries of the bibliography TeX reads that carry no doi, url or arXiv id. An entry only
  // bibtex reads (v5, v6: malformed or behind `%`) is the post-build check's, not this rule's.
  it.each([
    ["v1-stale", []],
    ["v5-percent-entry", []],
    ["v6-unclosed", ["a3"]],
    ["v8-jobname", ["jkey"]],
    ["v16-included-block", ["stale"]],
    ["v24-quoted-fields", ["q2", "q3", "q4", "q5"]],
    ["v25-string-differs", ["k1"]],
  ])("%s: %j", async (paper, keys) => {
    const { tex, others } = planted(paper);
    const { messages } = await lint(tex, others);
    expect(
      messages.map((m) => [m.ruleId, /`([^`]+)`/.exec(m.message)?.[1]]),
    ).toEqual(keys.map((k) => ["bib/reachable-entry", k]));
  });
});
