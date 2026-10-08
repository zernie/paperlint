/**
 * The schema of `_build/sources.json`: the one text it is parsed from, and every way a file can fail to
 * be a record of this schema — refused by name, never read as a record.
 */
import { describe, expect, it } from "vitest";
import {
  serializeSourcesRecord,
  type SourcesRecord,
} from "../../domain/sources-record.ts";
import { sourcesCodec } from "./index.ts";

const parseSourcesRecord = sourcesCodec.parse;
const A = "a".repeat(64);

const RECORD: SourcesRecord = {
  schema: 1,
  inputs: [
    { path: "paper.tex", role: "body" },
    { path: "macros.tex", role: "preamble" },
  ],
  written: ["refs.bib"],
  bibdata: ["refs"],
  bibtex: {
    ran: true,
    databases: ["refs.bib"],
    keys: ["k1"],
    exit: 2,
    errors: [{ message: "bad", file: "refs.bib", line: 4 }],
  },
  sha256: { "paper.tex": A, "macros.tex": null },
};

describe("parsing a sources.json", () => {
  it("what serialize wrote parses back to the same record, and the text ends with a newline", () => {
    const text = serializeSourcesRecord(RECORD);
    expect(text.endsWith("}\n")).toBe(true);
    expect(parseSourcesRecord(text)).toEqual({ ok: true, record: RECORD });
  });

  it("a build that ran no bibtex parses too", () => {
    const record: SourcesRecord = { ...RECORD, bibtex: { ran: false } };
    expect(parseSourcesRecord(serializeSourcesRecord(record))).toEqual({
      ok: true,
      record,
    });
  });

  it("text that is not JSON is refused by name", () => {
    expect(parseSourcesRecord("{")).toEqual({
      ok: false,
      why: "sources.json is not JSON",
    });
  });

  it("another schema number is refused by name, not read as this one", () => {
    expect(parseSourcesRecord('{"schema":2}')).toEqual({
      ok: false,
      why: "sources.json is schema 2, this paperlint reads schema 1",
    });
    expect(parseSourcesRecord("[]")).toEqual({
      ok: false,
      why: "sources.json is schema unknown, this paperlint reads schema 1",
    });
    expect(parseSourcesRecord('{"schema":"1"}')).toEqual({
      ok: false,
      why: "sources.json is schema unknown, this paperlint reads schema 1",
    });
  });

  it("a record of this schema that is not shaped like one names where", () => {
    const bad = (patch: object): string => {
      const r = parseSourcesRecord(JSON.stringify({ ...RECORD, ...patch }));
      return r.ok ? "accepted" : r.why;
    };
    expect(bad({ inputs: "paper.tex" })).toContain("inputs");
    expect(bad({ sha256: { "paper.tex": "not a digest" } })).toContain(
      "sha256.paper.tex",
    );
    expect(bad({ bibtex: { ran: "yes" } })).toContain("bibtex");
    expect(bad({ inputs: [{ path: "a.tex", role: "main" }] })).toContain(
      "inputs.0.role",
    );
    expect(parseSourcesRecord(JSON.stringify({ schema: 1 }))).toMatchObject({
      ok: false,
    });
  });
});
