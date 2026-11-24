/**
 * `corpus/record` through `paperlint lint`, the way a consumer runs it: the block that reaches a
 * corpus by its `MANIFEST.md`, a corpus without one reported on the first paper's
 * `PIPELINE-STATUS.md`, and a `paper.tex` kept in a corpus judged by no paper rule (#215).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { run } from "./cli.ts";
import { useTempDir, writeTree } from "../test/support.ts";

const STATUS = "---\nstages: []\n---\n# PIPELINE-STATUS\n";
const TEX = "\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n";
const PAPER = {
  "papers/p/PIPELINE-STATUS.md": STATUS,
  "papers/p/paper.tex": TEX,
};
const C = "papers/venues/agent";
const MANIFEST = `${C}/MANIFEST.md`;

const copy = (stored: readonly string[]) => ({
  version: "published",
  url: "https://doi.org/10.1/x",
  licence: { id: "NOASSERTION" },
  stored,
  ...(stored.length > 0 ? { fetched_from: "https://doi.org/10.1/x" } : {}),
});
const record = (copies: readonly (readonly string[])[]): string =>
  JSON.stringify({
    venue: "agent",
    editions: [
      {
        edition: 2026,
        listed_from: "https://example.org/accepted",
        read_on: "2026-11-03",
      },
    ],
    papers: [
      {
        key: "a",
        edition: 2026,
        group: "accepted",
        title: "A",
        ids: { doi: "10.1/x" },
        copies: copies.map(copy),
      },
    ],
  });

const Results = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        messageId: z.string().optional(),
        line: z.number().optional(),
        message: z.string(),
      }),
    ),
  }),
);

/** `paperlint lint --json` over the tree: each linted file, and every message with its file. */
async function lint(tree: Readonly<Record<string, string>>) {
  const dir = writeTree(useTempDir("paperlint-corpus-"), {
    "package.json": '{"name":"consumer","private":true}',
    ...tree,
  });
  const out: string[] = [];
  await run(["lint", "--json"], {
    cwd: dir,
    log: (...a: unknown[]) => out.push(a.join(" ")),
    err: () => undefined,
  });
  const results = Results.parse(JSON.parse(out.join("\n")));
  const rel = (p: string) => p.slice(dir.length + 1);
  return {
    files: results.map((r) => rel(r.filePath)).sort(),
    messages: results.flatMap((r) =>
      r.messages.map((m) => ({ ...m, file: rel(r.filePath) })),
    ),
  };
}

/** The corpus findings: where each is reported and which one it is. */
const corpusFindings = async (tree: Readonly<Record<string, string>>) =>
  (await lint(tree)).messages
    .filter((m) => m.ruleId === "corpus/record")
    .map((m) => ({ file: m.file, line: m.line, messageId: m.messageId }));

describe("corpus/record: silent where nothing is wrong", () => {
  it("🔴 is silent on a project with no venues/ at all", async () => {
    // Guards: most consumers keep no corpus; the rule must cost them nothing.
    expect(await corpusFindings(PAPER)).toEqual([]);
  });

  it("is silent on a corpus whose stored files are each claimed by one copy", async () => {
    const r = await lint({
      ...PAPER,
      [MANIFEST]: "# agent\n",
      [`${C}/papers.json`]: record([["pdf", "text"], []]),
      [`${C}/pdf/a.pdf`]: "%PDF",
      [`${C}/text/a.txt`]: "a",
      [`${C}/text/a.pdfminer.txt`]: "a",
      [`${C}/measurements.json`]: "[]",
    });
    // Guards: the block reaches the corpus (its MANIFEST.md is linted), and finds nothing.
    expect(r.files).toContain(MANIFEST);
    expect(r.messages.filter((m) => m.ruleId === "corpus/record")).toEqual([]);
  });
});

describe("corpus/record: each finding, on the corpus's MANIFEST.md", () => {
  it("reports stored copies with no papers.json, on MANIFEST.md", async () => {
    expect(
      await corpusFindings({
        ...PAPER,
        [MANIFEST]: "# agent\n",
        [`${C}/pdf/a.pdf`]: "%PDF",
      }),
    ).toEqual([{ file: MANIFEST, line: 1, messageId: "no-record" }]);
  });

  it("reports a papers.json that does not parse, naming the field's path", async () => {
    const r = await lint({
      ...PAPER,
      [MANIFEST]: "# agent\n",
      [`${C}/papers.json`]: record([["pdf"]]).replace(
        '"fetched_from"',
        '"fetched"',
      ),
      [`${C}/pdf/a.pdf`]: "%PDF",
    });
    const found = r.messages.filter((m) => m.ruleId === "corpus/record");
    expect(found.map((m) => [m.file, m.messageId])).toEqual([
      [MANIFEST, "unparsed"],
    ]);
    // Guards: the path comes from the codec, so the author finds the field.
    expect(found[0]?.message).toContain("papers.0.copies.0");
  });

  it("reports an unclaimed file, a missing file and two copies storing one kind", async () => {
    expect(
      await corpusFindings({
        ...PAPER,
        [MANIFEST]: "# agent\n",
        [`${C}/papers.json`]: record([["pdf"], ["pdf", "text"]]),
        [`${C}/pdf/a.pdf`]: "%PDF",
        [`${C}/pdf/b.pdf`]: "%PDF",
      }),
    ).toEqual([
      { file: MANIFEST, line: 1, messageId: "twice" },
      { file: MANIFEST, line: 1, messageId: "unclaimed" },
      { file: MANIFEST, line: 1, messageId: "missing" },
    ]);
  });

  it("is turned off in the root paperlint.json by one line", async () => {
    expect(
      await corpusFindings({
        ...PAPER,
        "paperlint.json": JSON.stringify({
          rules: { "corpus/record": "off" },
        }),
        [MANIFEST]: "# agent\n",
        [`${C}/pdf/a.pdf`]: "%PDF",
        "papers/venues/other/pdf/a.pdf": "%PDF",
      }),
    ).toEqual([]);
  });
});

describe("a corpus folder without MANIFEST.md", () => {
  it("is reported once, on the first paper's PIPELINE-STATUS.md", async () => {
    expect(
      await corpusFindings({
        ...PAPER,
        "papers/q/PIPELINE-STATUS.md": STATUS,
        "papers/q/paper.tex": TEX,
        // A paper below a group folder is no root's paper: it anchors nothing.
        "papers/group/r/PIPELINE-STATUS.md": STATUS,
        "papers/group/r/paper.tex": TEX,
        "papers/venues/agent/pdf/a.pdf": "%PDF",
        "papers/venues/notes/README.md": "# not a corpus\n",
      }),
    ).toEqual([
      {
        file: "papers/p/PIPELINE-STATUS.md",
        line: 1,
        messageId: "no-manifest",
      },
    ]);
  });
});

describe("a paper.tex kept in a corpus (#215)", () => {
  it("🔴 is judged by no paper rule, and the corpus still is", async () => {
    const r = await lint({
      ...PAPER,
      [MANIFEST]: "# agent\n",
      [`${C}/paper.tex`]: TEX,
      [`${C}/PIPELINE-STATUS.md`]: "no frontmatter\n",
      [`${C}/sources/x/paper.tex`]: TEX,
    });
    expect(r.files.filter((f) => f.startsWith("papers/venues/"))).toEqual([
      MANIFEST,
    ]);
  });
});
