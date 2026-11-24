/** The corpus record's judge: each finding of `corpus/record`, and silence on a corpus that keeps its record. */
import { describe, expect, it } from "vitest";
import {
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
  rebuild: [],
});

const folder = (
  record: CorpusFolder["record"],
  pdf: readonly string[] = [],
  text: readonly string[] = [],
): CorpusFolder => ({ record, stored: { pdf, text } });

const read = (papers: readonly Paper[]): CorpusFolder["record"] => ({
  ok: true,
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

  it("reports a record that does not parse: each of the codec's problems at its path", () => {
    expect(
      judgeCorpus(
        folder({
          ok: false,
          problems: [
            { path: ["papers", 0, "key"], message: "x" },
            { path: [], message: "not JSON" },
          ],
        }),
      ),
    ).toEqual([
      { kind: "unparsed", at: ["papers", 0, "key"], message: "x" },
      { kind: "unparsed", at: [], message: "not JSON" },
    ]);
  });
});

describe("judgeCorpus: a record that does not account for the folder", () => {
  it("reports a claimed PDF that is not there at the stored of the copy that claims it", () => {
    expect(
      judgeCorpus(folder(read([paper("a", [copy([]), copy(["pdf"])])]))),
    ).toEqual([
      {
        kind: "missing",
        at: ["papers", 0, "copies", 1, "stored"],
        key: "a",
        stored: "pdf",
        file: "pdf/a.pdf",
      },
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
      {
        kind: "twice",
        at: ["papers", 0, "copies", 1, "stored"],
        key: "a",
        stored: "pdf",
        copies: [0, 1],
      },
      // A file of a listed paper is reported at that paper's copies; any other, on the record.
      {
        kind: "unclaimed",
        at: ["papers", 1, "copies"],
        file: "pdf/b.pdf",
        key: "b",
      },
      { kind: "unclaimed", at: [], file: "pdf/c.pdf", key: "c" },
      { kind: "unclaimed", at: [], file: "pdf/notes.docx", key: null },
      {
        kind: "missing",
        at: ["papers", 1, "copies", 0, "stored"],
        key: "b",
        stored: "text",
        file: "text/b.txt",
      },
    ]);
  });
});

describe("corpusMessage: every finding names its cure", () => {
  const at = ["papers", 0, "copies", 0, "stored"];
  const findings: readonly CorpusFinding[] = [
    { kind: "unparsed", at: ["papers", 0, "key"], message: "x" },
    { kind: "unparsed", at: [], message: "not JSON" },
    { kind: "unclaimed", at: [], file: "pdf/b.pdf", key: "b" },
    { kind: "unclaimed", at: [], file: "pdf/x.docx", key: null },
    { kind: "missing", at, key: "b", stored: "text", file: "text/b.txt" },
    { kind: "twice", at, key: "a", stored: "pdf", copies: [0, 1] },
  ];
  it.each(findings)("$kind", (f) => {
    // Guards: each message says what to do, after the finding itself.
    expect(corpusMessage(f)).toMatch(/What to do: \S/u);
  });
});
