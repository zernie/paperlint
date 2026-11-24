/**
 * `corpus/record` through `paperlint lint`, the way a consumer runs it: the block that lints a
 * corpus's `papers.json` as JSON and reports at the field, no other JSON file reached, and a
 * `paper.tex` kept in a corpus judged by no paper rule (#215).
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
const RECORD = `${C}/papers.json`;

const copy = (stored: readonly string[]) => ({
  version: "published",
  url: "https://doi.org/10.1/x",
  licence: { id: "NOASSERTION" },
  stored,
  ...(stored.length > 0 ? { fetched_from: "https://doi.org/10.1/x" } : {}),
});
const record = (copies: readonly (readonly string[])[]): string =>
  JSON.stringify(
    {
      venue: "agent",
      editions: [
        {
          edition: 2026,
          listed_from: "https://example.org/accepted",
          read_on: "2026-11-03",
          accepted: 1,
          capped: null,
          proxy: null,
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
      rebuild: [],
    },
    null,
    2,
  );

const Results = z.array(
  z.looseObject({
    filePath: z.string(),
    messages: z.array(
      z.looseObject({
        ruleId: z.string().nullable(),
        messageId: z.string().optional(),
        line: z.number().optional(),
        column: z.number().optional(),
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

/** Every message on a file of the corpus. */
const onCorpus = async (tree: Readonly<Record<string, string>>) =>
  (await lint(tree)).messages.filter((m) => m.file.startsWith(C));

/** The corpus findings: where each is reported and which one it is. */
const corpusFindings = async (tree: Readonly<Record<string, string>>) =>
  (await onCorpus(tree))
    .filter((m) => m.ruleId === "corpus/record")
    .map((m) => ({ file: m.file, line: m.line, messageId: m.messageId }));

/** The line of `text` holding the `nth` occurrence of `needle`, counted from 1. */
const lineOf = (text: string, needle: string, nth = 1): number =>
  text
    .split("\n")
    .flatMap((l, i) => (l.includes(needle) ? [i + 1] : []))
    .at(nth - 1) ?? 0;

describe("corpus/record: silent where nothing is wrong", () => {
  it("🔴 is silent on a project with no venues/ at all", async () => {
    // Guards: most consumers keep no corpus; the rule must cost them nothing.
    expect(await corpusFindings(PAPER)).toEqual([]);
  });

  it("🔴 is silent on a corpus folder with stored files and no papers.json", async () => {
    // Guards: a corpus not migrated yet is corpus/allowed-files-only's to report, not this rule's.
    const r = await lint({
      ...PAPER,
      [`${C}/MANIFEST.md`]: "# agent\n",
      [`${C}/pdf/a.pdf`]: "%PDF",
      [`${C}/text/a.txt`]: "a",
    });
    expect(r.files.filter((f) => f.startsWith("papers/venues/"))).toEqual([]);
    expect(r.messages.filter((m) => m.file.startsWith(C))).toEqual([]);
  });

  it("is silent on a corpus whose stored files are each claimed by one copy", async () => {
    const r = await lint({
      ...PAPER,
      [RECORD]: record([["pdf", "text"], []]),
      [`${C}/pdf/a.pdf`]: "%PDF",
      [`${C}/text/a.txt`]: "a",
      [`${C}/text/a.pdfminer.txt`]: "a",
      [`${C}/measurements.json`]: "[]",
    });
    // Guards: the block reaches the corpus (its papers.json is linted), and finds nothing.
    expect(r.files).toContain(RECORD);
    expect(r.messages.filter((m) => m.file.startsWith(C))).toEqual([]);
  });
});

describe("corpus/record: each finding, at its place in papers.json", () => {
  it("🔴 reports a field that breaks the schema at that field's line", async () => {
    const text = record([["pdf"]]).replace('"fetched_from"', '"fetched"');
    const found = await onCorpus({
      ...PAPER,
      [RECORD]: text,
      [`${C}/pdf/a.pdf`]: "%PDF",
    });
    // Guards: the required key is reported on its copy (the line opening it), the misspelt one where it stands.
    expect(found.map((m) => [m.line, m.column, m.messageId])).toEqual([
      [lineOf(text, '"version"') - 1, 9, "unparsed"],
      [lineOf(text, '"fetched"'), 11, "unparsed"],
    ]);
    expect(found.map((m) => m.message.split(":")[0])).toEqual([
      "`papers.0.copies.0.fetched_from`",
      "`papers.0.copies.0.fetched`",
    ]);
  });

  it("reports a papers.json that is not JSON as ESLint's parse error", async () => {
    const found = await onCorpus({ ...PAPER, [RECORD]: '{ "venue": ' });
    expect(found.map((m) => [m.ruleId, m.line])).toEqual([[null, 1]]);
  });

  it("reports an unclaimed file, a missing file and two copies storing one kind", async () => {
    const text = record([["pdf"], ["pdf", "text"]]);
    // The second copy's `stored` holds both the second "pdf" and the "text" whose file is absent.
    const second = lineOf(text, '"stored"', 2);
    expect(
      await corpusFindings({
        ...PAPER,
        [RECORD]: text,
        [`${C}/pdf/a.pdf`]: "%PDF",
        [`${C}/pdf/b.pdf`]: "%PDF",
      }),
    ).toEqual([
      // A file of no listed paper is reported on the record's first line.
      { file: RECORD, line: 1, messageId: "unclaimed" },
      { file: RECORD, line: second, messageId: "twice" },
      { file: RECORD, line: second, messageId: "missing" },
    ]);
  });

  it("is turned off in the root paperlint.json by one line", async () => {
    expect(
      await corpusFindings({
        ...PAPER,
        "paperlint.json": JSON.stringify({
          rules: { "corpus/record": "off" },
        }),
        [RECORD]: record([]),
        [`${C}/pdf/a.pdf`]: "%PDF",
      }),
    ).toEqual([]);
  });
});

describe("the JSON language reaches papers.json and the root paperlint.json, nothing else", () => {
  it("🔴 lints no other JSON file: a paper's paperlint.json, measurements.json", async () => {
    const r = await lint({
      ...PAPER,
      "paperlint.json": "{}",
      "papers/p/paperlint.json": "{}",
      "papers/p/data.json": "{ broken",
      [RECORD]: record([]),
      [`${C}/measurements.json`]: "{ broken",
      "papers/venues/papers.json": "{ broken",
    });
    // The root file is corpus/allowed-files-only's, for a corpus without papers.json; corpus/record
    // is not registered on it.
    expect(r.files.filter((f) => f.endsWith(".json"))).toEqual([
      "paperlint.json",
      RECORD,
    ]);
    // Guards: no broken JSON is parsed; the one message is the stray papers.json loose in venues/.
    expect(
      r.messages
        .filter((m) => m.file.endsWith(".json"))
        .map((m) => [m.file, m.ruleId, m.messageId]),
    ).toEqual([["paperlint.json", "corpus/allowed-files-only", "loose"]]);
  });
});

describe("a paper.tex kept in a corpus (#215)", () => {
  it("🔴 is judged by no paper rule, and the corpus still is", async () => {
    const r = await lint({
      ...PAPER,
      [RECORD]: record([]),
      [`${C}/paper.tex`]: TEX,
      [`${C}/PIPELINE-STATUS.md`]: "no frontmatter\n",
      [`${C}/sources/x/paper.tex`]: TEX,
    });
    expect(r.files.filter((f) => f.startsWith("papers/venues/"))).toEqual([
      RECORD,
    ]);
  });
});
