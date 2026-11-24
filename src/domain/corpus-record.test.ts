/** The corpus record's judge: each finding of `corpus/record`, and silence on a corpus that keeps its record. */
import { describe, expect, it } from "vitest";
import {
  corpusMarkers,
  corpusMessage,
  judgeCorpus,
  storedKey,
  type CorpusFinding,
  type CorpusFolder,
} from "./corpus-record.ts";
import type { Copy, Paper, VenueCorpus } from "./venue-corpus.ts";

const copy = (stored: Copy["stored"]): Copy => ({
  version: "published",
  url: "https://doi.org/10.1/x",
  licence: { id: "NOASSERTION" },
  stored,
  ...(stored.length > 0 ? { fetched_from: "https://doi.org/10.1/x" } : {}),
});

const paper = (key: string, copies: readonly Copy[]): Paper => ({
  key,
  title: "A title",
  group: "accepted",
  edition: 2026,
  ids: { doi: "10.1/x" },
  copies,
});

const corpus = (papers: readonly Paper[]): VenueCorpus => ({
  venue: "agent",
  editions: [],
  papers,
});

const folder = (
  record: CorpusFolder["record"],
  pdf: readonly string[] = [],
  text: readonly string[] = [],
): CorpusFolder => ({ record, stored: { pdf, text } });

const read = (papers: readonly Paper[]): CorpusFolder["record"] => ({
  kind: "read",
  corpus: corpus(papers),
});

describe("storedKey: the paper a stored file's name belongs to", () => {
  it.each([
    ["pdf", "2026-01.pdf", "2026-01"],
    ["text", "2026-01.txt", "2026-01"],
    ["text", "2026-01.pdfminer.txt", "2026-01"],
    ["pdf", "2026-01.txt", null],
    ["pdf", "a.b.pdf", null],
    ["text", "2026-01.pdf", null],
    ["text", "2026-01..txt", null],
    ["text", ".txt", null],
  ] as const)("%s/%s → %s", (kind, name, key) => {
    // Guards: a name outside `<key>.pdf` / `<key>[.<variant>].txt` belongs to no paper.
    expect(storedKey(kind, name)).toBe(key);
  });
});

describe("judgeCorpus", () => {
  it("is silent on a corpus that stores nothing and has no record", () => {
    expect(judgeCorpus(folder({ kind: "absent" }))).toEqual([]);
  });

  it("is silent when every stored file is claimed by exactly one copy and exists", () => {
    expect(
      judgeCorpus(
        folder(
          read([paper("a", [copy(["pdf", "text"]), copy([])])]),
          ["a.pdf"],
          ["a.txt", "a.pdfminer.txt"],
        ),
      ),
    ).toEqual([]);
  });

  it("reports stored copies with no record, naming every file", () => {
    expect(
      judgeCorpus(folder({ kind: "absent" }, ["a.pdf"], ["a.txt"])),
    ).toEqual([{ kind: "no-record", files: ["text/a.txt", "pdf/a.pdf"] }]);
  });

  it("reports a record that does not parse with the codec's reasons", () => {
    expect(
      judgeCorpus(folder({ kind: "unreadable", why: "papers.json: x: y" })),
    ).toEqual([{ kind: "unparsed", why: "papers.json: x: y" }]);
  });

  it("reports a claimed PDF that is not there, under the name its key gives", () => {
    expect(judgeCorpus(folder(read([paper("a", [copy(["pdf"])])])))).toEqual([
      { kind: "missing", key: "a", stored: "pdf", file: "pdf/a.pdf" },
    ]);
  });

  it("reports an unclaimed file, a missing file and two copies storing one kind", () => {
    expect(
      judgeCorpus(
        folder(
          read([
            paper("a", [copy(["pdf"]), copy(["pdf"])]),
            paper("b", [copy(["text"])]),
          ]),
          ["a.pdf", "b.pdf", "c.pdf", "notes.docx"],
          [],
        ),
      ),
    ).toEqual([
      { kind: "twice", key: "a", stored: "pdf", copies: [0, 1] },
      { kind: "unclaimed", file: "pdf/b.pdf", key: "b" },
      { kind: "unclaimed", file: "pdf/c.pdf", key: "c" },
      { kind: "unclaimed", file: "pdf/notes.docx", key: null },
      { kind: "missing", key: "b", stored: "text", file: "text/b.txt" },
    ]);
  });
});

describe("corpusMarkers: what makes a folder under venues/ a corpus", () => {
  it("names papers.json, pdf/ and text/ when present, of the right kind", () => {
    expect(
      corpusMarkers([
        { name: "papers.json", kind: "file" },
        { name: "pdf", kind: "dir" },
        { name: "text", kind: "file" },
        { name: "README.md", kind: "file" },
      ]),
    ).toEqual(["papers.json", "pdf/"]);
  });

  it("names nothing for a folder with none of them", () => {
    expect(corpusMarkers([{ name: "notes.md", kind: "file" }])).toEqual([]);
  });
});

describe("corpusMessage: every finding names its cure", () => {
  const findings: readonly CorpusFinding[] = [
    { kind: "no-record", files: ["pdf/a.pdf"] },
    { kind: "unparsed", why: "papers.json is not JSON" },
    { kind: "unclaimed", file: "pdf/b.pdf", key: "b" },
    { kind: "unclaimed", file: "pdf/x.docx", key: null },
    { kind: "missing", key: "b", stored: "text", file: "text/b.txt" },
    { kind: "twice", key: "a", stored: "pdf", copies: [0, 1] },
    {
      kind: "no-manifest",
      folder: "venues/agent",
      markers: ["papers.json", "pdf/"],
    },
  ];
  it.each(findings)("$kind", (f) => {
    // Guards: each message says what to do, after the finding itself.
    expect(corpusMessage(f)).toMatch(/What to do: \S/u);
  });
});
