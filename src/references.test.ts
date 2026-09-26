/**
 * The references a build checked, end to end without a network: the `references` build step
 * records what a (fake) checker answers, and the offline rules judge that record.
 *
 *   a pass is recorded, with the hash of the bibliography checked
 *   one mismatched entry → paper/author-list on THAT entry's line
 *   the bibliography edited after the build → paper/refs-fresh, and the per-entry rules go quiet
 *   offline → the step still succeeds (the build is not failed) and paper/refs-checked warns
 */
import { describe, expect, it } from "vitest";
import { ESLint, type Linter } from "eslint";
import { join } from "node:path";
import { memoryFiles } from "./adapters/memory/index.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import type {
  CheckReferences,
  EntryVerdict,
} from "./ports/check-references.ts";
import { referencesStep } from "./build.ts";
import {
  bibHash,
  bibliographyOf,
  readReferences,
  referencesPath,
} from "./references.ts";
import { referenceRules, REFERENCE_RULE_LEVELS } from "./reference-rules.ts";
// @ts-expect-error — an ESLint language in .mjs, it has no types
import { texLanguage } from "../eslint-rules/latex-language.mjs";

const PAPER = "/work/papers/p";
const TEX = (entries: string) =>
  [
    "\\documentclass{acmart}",
    "\\begin{filecontents*}{refs.bib}",
    entries,
    "\\end{filecontents*}",
    "\\begin{document}",
    "x",
    "\\end{document}",
    "",
  ].join("\n");
const ENTRIES =
  "@inproceedings{schick2023,\n  title = {Toolformer},\n  author = {Schick, Timo},\n  booktitle = {NeurIPS}\n}\n@misc{other,\n  title = {Other},\n  url = {https://x.org}\n}";

const verdict = (
  key: string,
  authors: EntryVerdict["authors"] = "match",
  exists: EntryVerdict["exists"] = "true",
): EntryVerdict => ({
  key,
  exists,
  authors,
  ...(authors === "mismatch" ? { why: "missing hambro" } : {}),
});

const checker =
  (entries: readonly EntryVerdict[]): CheckReferences =>
  async () => ({ kind: "checked", entries });
const offline: CheckReferences = async () => ({
  kind: "not-checked",
  why: "the citation services cannot be reached (fetch failed)",
});

/** Run the build step on a paper held in memory; returns the files and the step's outcome. */
async function build(tex: string, check: CheckReferences) {
  const files = memoryFiles({ [`${PAPER}/paper.tex`]: tex });
  const out = await referencesStep.run({
    paperDir: PAPER,
    env: {},
    run: (() => ({})) as never,
    readPdf: (() => null) as never,
    measure: (() => null) as never,
    files,
    checkReferences: check,
  });
  return { files, out };
}

/** Lint `tex` as the paper's paper.tex against what `files` recorded. */
async function lint(files: ReturnType<typeof memoryFiles>, tex: string) {
  files.writeAtomic(
    `${PAPER}/paper.tex` as AbsolutePath,
    new TextEncoder().encode(tex),
  );
  const eslint = new ESLint({
    cwd: "/work",
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/paper.tex"],
        plugins: {
          tex: { languages: { latex: texLanguage } },
          paper: { rules: referenceRules({ files }) },
        },
        language: "tex/latex",
        rules: REFERENCE_RULE_LEVELS,
      },
    ] as unknown as Linter.Config[],
  });
  const [res] = await eslint.lintText(tex, {
    filePath: join(PAPER, "paper.tex"),
  });
  return res!.messages;
}

describe("the references build step", () => {
  it("records a pass, with the hash of the bibliography it checked", async () => {
    const tex = TEX(ENTRIES);
    const { files, out } = await build(
      tex,
      checker([verdict("schick2023"), verdict("other")]),
    );
    expect(out.ok).toBe(true);
    const doc = readReferences(files, PAPER);
    expect(doc?.status).toBe("checked");
    expect(doc?.bib.sha256).toBe(bibHash(bibliographyOf(files, PAPER)!));
    expect(await lint(files, tex)).toEqual([]);
  });

  it("🔴 offline: the step succeeds — the build is not failed — and lint warns once", async () => {
    const tex = TEX(ENTRIES);
    const { files, out } = await build(tex, offline);
    expect(out.ok).toBe(true);
    expect(readReferences(files, PAPER)?.status).toBe("not-checked");
    const msgs = await lint(files, tex);
    expect(msgs.map((m) => [m.ruleId, m.severity])).toEqual([
      ["paper/refs-checked", 1],
    ]);
    expect(msgs[0]!.message).toMatch(/cannot be reached/);
  });

  it("a checker that throws is recorded as not checked, not as a failed build", async () => {
    const { files, out } = await build(TEX(ENTRIES), async () => {
      throw new Error("DBLP exploded");
    });
    expect(out.ok).toBe(true);
    expect(readReferences(files, PAPER)?.why).toMatch(/DBLP exploded/);
  });
});

describe("the reference rules", () => {
  it("one mismatched entry → paper/author-list on that entry's own line", async () => {
    const tex = TEX(ENTRIES);
    const { files } = await build(
      tex,
      checker([verdict("schick2023", "mismatch"), verdict("other")]),
    );
    const msgs = await lint(files, tex);
    expect(msgs.map((m) => m.ruleId)).toEqual(["paper/author-list"]);
    expect(msgs[0]!.line).toBe(3);
    expect(msgs[0]!.message).toMatch(/`schick2023`.*missing hambro/);
  });

  it("an identifier that provably fails → paper/cite-exists on that entry", async () => {
    const tex = TEX(ENTRIES);
    const { files } = await build(
      tex,
      checker([verdict("schick2023"), verdict("other", "skipped", "false")]),
    );
    const msgs = await lint(files, tex);
    expect(msgs.map((m) => [m.ruleId, m.line])).toEqual([
      ["paper/cite-exists", 8],
    ]);
  });

  it("🔴 the bibliography edited after the build → refs-fresh, and the stale verdicts are not judged", async () => {
    const { files } = await build(
      TEX(ENTRIES),
      checker([verdict("schick2023", "mismatch"), verdict("other")]),
    );
    const edited = TEX(
      ENTRIES.replace("Schick, Timo", "Schick, Timo and Hambro, Eric"),
    );
    const msgs = await lint(files, edited);
    expect(msgs.map((m) => [m.ruleId, m.severity])).toEqual([
      ["paper/refs-fresh", 2],
    ]);
  });

  it("the same bibliography, unchanged → silent", async () => {
    const tex = TEX(ENTRIES);
    const { files } = await build(tex, checker([verdict("schick2023")]));
    expect(await lint(files, tex)).toEqual([]);
  });

  it("never built → one warning naming the command", async () => {
    const files = memoryFiles({});
    const msgs = await lint(files, TEX(ENTRIES));
    expect(msgs.map((m) => m.ruleId)).toEqual(["paper/refs-checked"]);
    expect(msgs[0]!.message).toMatch(/npx paperlint build/);
  });

  it("a paper with no bibliography gets nothing", async () => {
    const files = memoryFiles({});
    expect(
      await lint(
        files,
        "\\documentclass{article}\n\\begin{document}x\\end{document}\n",
      ),
    ).toEqual([]);
    expect(referencesPath(PAPER)).toBe(`${PAPER}/_build/references.json`);
  });
});
