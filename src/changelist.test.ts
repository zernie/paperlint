/**
 * The changelist since the approved version (EXPERIMENTAL): its shape, what a text holds that a change
 * can remove, and the two comparisons — both halves for each: a planted defect fires, a declared one
 * stays quiet.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { latexReader } from "./adapters/latex/index.ts";
import { parseYaml } from "./adapters/yaml/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import { changesRules } from "./changes-rule.ts";
import {
  covers,
  factsOf,
  parseChanges,
  removedFrom,
  uncovered,
  undeclared,
} from "./changelist.ts";
import { presetsDir } from "./package-dirs.ts";

const facts = (body: string) => {
  const src = `\\begin{document}\n${body}\n\\end{document}\n`;
  return factsOf(src, latexReader.bodyProse(src));
};

const OLD = facts(
  "We measured 63 repositories \\cite{smith24, lee23} (see \\url{https://x.example}).\n\nThe second paragraph stays.",
);
const NEW = facts("The second paragraph stays.");

describe("changes.yaml shape", () => {
  const good = {
    type: "cut",
    before: "x",
    why: "y",
    reader_loses: "z",
    drops: ["63"],
  };

  it("a well-formed list reads, with optional drops", () => {
    expect(
      parseChanges([good, { type: "add", before: "a", why: "b" }]),
    ).toEqual({
      ok: true,
      value: [
        { type: "cut", before: "x", why: "y", drops: ["63"], readerLoses: "z" },
        { type: "add", before: "a", why: "b", drops: [], readerLoses: null },
      ],
    });
  });

  it.each<[string, unknown, string]>([
    ["not a list", {}, "is a list of entries"],
    ["an entry that is no mapping", ["x"], "entry 1: is not a mapping"],
    ["an unknown type", [{ ...good, type: "trim" }], "`type` is one of"],
    ["no why", [{ ...good, why: "" }], "`before` and `why`"],
    ["drops of the wrong kind", [{ ...good, drops: [1] }], "`drops` is a list"],
    ["drops not a list", [{ ...good, drops: "63" }], "`drops` is a list"],
    [
      "a cut that does not say what the reader loses",
      [{ ...good, reader_loses: undefined }],
      "what the reader loses",
    ],
  ])("refused: %s", (_, doc, says) => {
    const r = parseChanges(doc);
    expect(!r.ok && r.error.join().includes(says)).toBe(true);
  });
});

describe("what the draft lost", () => {
  const removed = removedFrom(OLD, NEW);

  it("numbers and cite keys the approved text had, and the paragraph that is gone", () => {
    expect(removed.tokens).toEqual(["63", "smith24", "lee23"]);
    expect(removed.paragraphs).toHaveLength(1);
    expect(removed.paragraphs[0]?.seen).toContain(
      "We measured 63 repositories",
    );
  });

  it("🔴 a token no entry names is undeclared; one named in `drops` is not", () => {
    const entry = (drops: string[]) => ({
      type: "cut" as const,
      before: "We measured 63 repositories",
      why: "w",
      drops,
      readerLoses: "l",
    });
    expect(undeclared(removed, [entry(["63"])])).toEqual(["smith24", "lee23"]);
    expect(undeclared(removed, [entry(["63", "smith24", "lee23"])])).toEqual(
      [],
    );
  });

  it("a paragraph is covered by a `before` inside it or one that holds it", () => {
    const c = (before: string) => ({
      type: "raw" as const,
      before,
      why: "w",
      drops: [],
      readerLoses: null,
    });
    const holding =
      "Before. We measured 63 repositories \\cite{smith24, lee23} (see \\url{https://x.example}). After.";
    expect(
      removed.paragraphs.flatMap((p) => [
        covers(c("measured 63"), p),
        covers(c(holding), p),
        covers(c("something else"), p),
      ]),
    ).toEqual([true, true, false]);
    expect(uncovered(removed, [c("something else")])).toHaveLength(1);
    expect(uncovered(removed, [c("measured 63")])).toEqual([]);
  });
});

const CYCLE = {
  id: "beta-2027",
  venue: { kind: "named", name: "Beta", url: "https://beta.example" },
  opened: "2026-09-09",
  deadlines: [],
};
const DIR = "/w/p";
const tex = (b: string) => `\\begin{document}\n${b}\n\\end{document}\n`;

function lint(
  tree: Record<string, string>,
  which: "changes-since-approved" | "changes-since-approved-coverage",
  file = "paper.tex",
) {
  const rule = changesRules({
    files: memoryFiles(tree),
    venuesDir: presetsDir(),
    latex: latexReader,
    codec: sourcesCodec,
    yaml: parseYaml,
  })[which];
  const out: string[] = [];
  const text = tex("The second paragraph stays.");
  const v = rule.create({
    filename: `${DIR}/${file}`,
    sourceCode: { text, getLocFromIndex: () => ({ line: 1, column: 1 }) },
    report: (d) => {
      out.push(
        "messageId" in d
          ? `${d.messageId} ${JSON.stringify(d.data)}`
          : d.message,
      );
    },
  });
  v.root?.();
  return out;
}
const base = {
  [`${DIR}/paperlint.json`]: JSON.stringify({ cycles: [CYCLE] }),
  [`${DIR}/paper.tex`]: tex("The second paragraph stays."),
  [`${DIR}/versions/beta-2027/approved.tex`]: OLD_TEX(),
};
function OLD_TEX() {
  return tex("We measured 63 repositories.\n\nThe second paragraph stays.");
}

describe("the two rules over a paper in memory", () => {
  it("errors: a bad YAML, a bad shape, an undeclared drop; quiet when declared", () => {
    const at = `${DIR}/versions/beta-2027/changes.yaml`;
    const run = (changes?: string) =>
      lint(
        changes === undefined ? base : { ...base, [at]: changes },
        "changes-since-approved",
      );
    expect(run()).toEqual(['dropped {"token":"63","cycle":"beta-2027"}']);
    expect(run("")).toEqual(['dropped {"token":"63","cycle":"beta-2027"}']);
    expect(run("- [unclosed")[0]).toContain("does not parse as YAML");
    expect(run("- type: nope\n")[0]).toContain("`type` is one of");
    expect(
      run(
        "- type: cut\n  before: We measured\n  why: w\n  reader_loses: l\n  drops: ['63']\n",
      ),
    ).toEqual([]);
  });
});

describe("the two rules, coverage and silence", () => {
  it("coverage: a paragraph gone with no entry; quiet when an entry covers it", () => {
    const at = `${DIR}/versions/beta-2027/changes.yaml`;
    expect(lint(base, "changes-since-approved-coverage")).toHaveLength(1);
    expect(
      lint(
        {
          ...base,
          [at]: "- type: raw\n  before: We measured 63 repositories.\n  why: w\n",
        },
        "changes-since-approved-coverage",
      ),
    ).toEqual([]);
  });

  it("silent without an approved copy, without cycles, and on another file", () => {
    const noApproved = Object.fromEntries(
      Object.entries(base).filter(([k]) => !k.endsWith("approved.tex")),
    );
    expect(lint(noApproved, "changes-since-approved")).toEqual([]);
    expect(
      lint({ [`${DIR}/paper.tex`]: "x" }, "changes-since-approved"),
    ).toEqual([]);
    expect(lint(base, "changes-since-approved", "notes.tex")).toEqual([]);
  });
});
