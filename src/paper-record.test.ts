/**
 * `paperRecord(dir)` — the one answer to "what did the last build read, and is that still the paper?",
 * over files held in memory — and the two things the rules take from a fresh record: the files of a
 * role, and the databases bibtex opened as the bibtex reader reads them.
 */
import { describe, expect, it } from "vitest";
import { bibReader } from "./adapters/bibtex/index.ts";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sourcesCodec } from "./adapters/sources-record/index.ts";
import type { BibText } from "./domain/paper-sources.ts";
import { sha256Hex } from "./domain/sha256.ts";
import {
  serializeSourcesRecord,
  type SourcesRecord,
} from "./domain/sources-record.ts";
import { paperRecord, recordedFiles } from "./paper-record.ts";
import { recordedBibliography } from "./recorded-bibliography.ts";

const DIR = "/work/paper";
const bytes = (s: string) => new TextEncoder().encode(s);
const digest = (s: string) => sha256Hex(bytes(s));

const TEX = "\\documentclass{article}\n";
const BIB = "@misc{a, title={A}, author={Doe, Jane}, year={2020}}\n";

const RECORD: SourcesRecord = {
  schema: 1,
  inputs: [
    { path: "paper.tex", role: "body" },
    { path: "macros.tex", role: "preamble" },
    { path: "sections/intro.tex", role: "body" },
  ],
  written: [],
  bibdata: ["refs"],
  bibtex: {
    ran: true,
    databases: ["refs.bib"],
    keys: ["a"],
    exit: 0,
    errors: [],
  },
  sha256: {
    "paper.tex": digest(TEX),
    "macros.tex": digest("m"),
    "sections/intro.tex": digest("i"),
    "refs.bib": digest(BIB),
  },
};

/** The paper directory after a build wrote `record`: every file as it was hashed. */
const built = (record: SourcesRecord = RECORD) =>
  memoryFiles({
    [`${DIR}/_build/sources.json`]: serializeSourcesRecord(record),
    [`${DIR}/paper.tex`]: TEX,
    [`${DIR}/macros.tex`]: "m",
    [`${DIR}/sections/intro.tex`]: "i",
    [`${DIR}/refs.bib`]: BIB,
  });

describe("paperRecord", () => {
  it("a paper no build has recorded has none", () => {
    expect(
      paperRecord(DIR, {
        files: memoryFiles({ [`${DIR}/paper.tex`]: TEX }),
        codec: sourcesCodec,
      }),
    ).toEqual({ kind: "none", unreadable: null });
  });

  it("a record that cannot be read has none, and says why", () => {
    const files = built();
    files.map.set(`${DIR}/_build/sources.json`, bytes("{"));
    expect(paperRecord(DIR, { files, codec: sourcesCodec })).toEqual({
      kind: "none",
      unreadable: "sources.json is not JSON",
    });
    files.map.set(`${DIR}/_build/sources.json`, bytes('{"schema":2}'));
    expect(paperRecord(DIR, { files, codec: sourcesCodec })).toEqual({
      kind: "none",
      unreadable: "sources.json is schema 2, this paperlint reads schema 1",
    });
  });

  it("a record whose every file is as hashed is fresh", () => {
    expect(paperRecord(DIR, { files: built(), codec: sourcesCodec })).toEqual({
      kind: "fresh",
      record: RECORD,
    });
  });

  it("a file edited since the build makes it stale, and names the file", () => {
    const files = built();
    files.map.set(`${DIR}/sections/intro.tex`, bytes("edited"));
    expect(paperRecord(DIR, { files, codec: sourcesCodec })).toEqual({
      kind: "stale",
      changed: [{ path: "sections/intro.tex", change: "edited" }],
    });
  });

  it("a file deleted, a database edited: every change is named, in the record's order", () => {
    const files = built();
    files.map.delete(`${DIR}/macros.tex`);
    files.map.set(`${DIR}/refs.bib`, bytes("@misc{b}"));
    expect(paperRecord(DIR, { files, codec: sourcesCodec })).toEqual({
      kind: "stale",
      changed: [
        { path: "macros.tex", change: "deleted" },
        { path: "refs.bib", change: "edited" },
      ],
    });
  });
});

const keysOf = (bib: BibText): readonly string[] =>
  bib.entries.map((e) => e.key);

const DEPS = { codec: sourcesCodec, bib: bibReader };

describe("what a rule takes from a record", () => {
  it("the files of a role, as absolute paths, in the order TeX first read them", () => {
    expect(recordedFiles(DIR, RECORD, "body")).toEqual([
      `${DIR}/paper.tex`,
      `${DIR}/sections/intro.tex`,
    ]);
    expect(recordedFiles(DIR, RECORD, "preamble")).toEqual([
      `${DIR}/macros.tex`,
    ]);
  });

  it("the databases bibtex opened, read as the bibtex reader reads them, a block's copy marked written, a missing one named", () => {
    const record: SourcesRecord = {
      ...RECORD,
      written: ["gen.bib"],
      bibtex: {
        ran: true,
        databases: ["refs.bib", "gen.bib", "gone.bib", "./refs.bib"],
        keys: [],
        exit: 0,
        errors: [],
      },
    };
    const files = built(record);
    files.map.set(`${DIR}/gen.bib`, bytes("@misc{g, title={G}}"));
    const r = recordedBibliography(DIR, { ...DEPS, files });
    expect(
      r.kind === "recorded"
        ? {
            databases: r.databases.map((d) => [
              d.name,
              d.written,
              keysOf(d.bib),
            ]),
            unread: r.unread,
            path: r.databases[0]?.bib.path,
          }
        : r,
    ).toEqual({
      databases: [
        ["refs.bib", false, ["a"]],
        ["gen.bib", true, ["g"]],
      ],
      unread: ["gone.bib"],
      path: `${DIR}/refs.bib`,
    });
  });

  it("a build that ran no bibtex opened no database", () => {
    const record: SourcesRecord = { ...RECORD, bibtex: { ran: false } };
    expect(
      recordedBibliography(DIR, { ...DEPS, files: built(record) }),
    ).toMatchObject({ kind: "recorded", databases: [], unread: [] });
  });
});
