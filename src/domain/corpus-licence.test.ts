/** The licence judge: each refusal of the table reaches a finding at its copy's `stored`, a permitted kind none. */
import { describe, expect, it } from "vitest";
import { judgeLicences, licenceMessage } from "./corpus-licence.ts";
import type { Copy, Paper, VenueCorpus } from "./venue-corpus.ts";

const copy = (id: string, stored: Copy["stored"]): Copy => ({
  version: "published",
  url: "https://doi.org/10.1/x",
  licence: { id, read_from: "https://example.org", read_on: "2026-11-03" },
  stored,
  fetched_from: "https://doi.org/10.1/x",
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

const OFF = { nonCommercial: false };

describe("judgeLicences", () => {
  it("is silent on a permitted licence and on a copy that stores nothing", () => {
    expect(
      judgeLicences(
        corpus([
          paper("a", [
            copy("CC-BY-4.0", ["pdf", "text"]),
            { ...copy("LicenseRef-publisher", []), fetched_from: undefined },
          ]),
        ]),
        OFF,
      ),
    ).toEqual([]);
  });

  it("reports each refused kind of each copy at that copy's stored, in the record's order", () => {
    const found = judgeLicences(
      corpus([
        paper("a", [copy("CC-BY-4.0", ["pdf"])]),
        paper("b", [
          copy("CC-BY-4.0", ["text"]),
          copy("CC-BY-ND-4.0", ["pdf", "text"]),
          copy("CC-BY-3.0", ["pdf"]),
        ]),
      ]),
      OFF,
    );
    expect(found.map((f) => [f.at, f.stored, f.refusal.kind])).toEqual([
      [["papers", 1, "copies", 1, "stored"], ["text"], "forbidden"],
      [["papers", 1, "copies", 2, "stored"], ["pdf"], "unlisted"],
    ]);
  });

  it("gives a copy one finding per reason, naming every kind it stands against", () => {
    // Guards: two kinds refused for the same reason are one finding, not one per kind.
    const found = judgeLicences(
      corpus([
        paper("a", [
          copy("NOASSERTION", ["pdf", "text"]),
          copy("CC-BY-NC-ND-4.0", ["pdf", "text"]),
        ]),
      ]),
      OFF,
    );
    expect(found.map((f) => [f.at, f.stored, f.refusal.kind])).toEqual([
      [["papers", 0, "copies", 0, "stored"], ["pdf", "text"], "not-read"],
      [["papers", 0, "copies", 1, "stored"], ["pdf"], "non-commercial-only"],
      [["papers", 0, "copies", 1, "stored"], ["text"], "forbidden"],
    ]);
  });

  it("asks the table with the project's setting", () => {
    const nc = corpus([paper("a", [copy("CC-BY-NC-4.0", ["pdf"])])]);
    expect(judgeLicences(nc, OFF).map((f) => f.refusal.kind)).toEqual([
      "non-commercial-only",
    ]);
    expect(judgeLicences(nc, { nonCommercial: true })).toEqual([]);
  });
});

describe("licenceMessage: each refusal names its cure", () => {
  const messageOf = (id: string, stored: Copy["stored"]) => {
    const [f] = judgeLicences(corpus([paper("k", [copy(id, stored)])]), OFF);
    return f === undefined ? "" : licenceMessage(f);
  };

  it.each([
    [
      "NOASSERTION",
      "a copy of `k` stores `pdf` (`pdf/<key>.pdf`), and no licence was read for that copy (`NOASSERTION`). What to do: record the licence and where it was read (`licence.id`, `read_from`, `read_on`), or remove the file and `\"pdf\"` from that copy's `stored`, and keep the paper's ids",
    ],
    [
      "CC-BY-3.0",
      "a copy of `k` stores `pdf` (`pdf/<key>.pdf`) under `CC-BY-3.0`, and the licence table does not list that id, so it permits nothing. What to do: correct the id if it is misspelt; otherwise remove the file and `\"pdf\"` from that copy's `stored`, and keep the paper's ids",
    ],
    [
      "LicenseRef-publisher",
      "a copy of `k` stores `pdf` (`pdf/<key>.pdf`) under `LicenseRef-publisher`, which does not permit it: the publisher grants no right to third parties. What to do: remove the file and `\"pdf\"` from that copy's `stored`, and keep the paper's ids",
    ],
    [
      "CC-BY-NC-4.0",
      'a copy of `k` stores `pdf` (`pdf/<key>.pdf`) under `CC-BY-NC-4.0`, which permits it only in a non-commercial project, and this one has not declared itself one. What to do: if it is one, set `"corpus/licence": ["warn", { "nonCommercial": true }]` in the root `paperlint.json`; otherwise remove the file and `"pdf"` from that copy\'s `stored`, and keep the paper\'s ids',
    ],
  ])("%s", (id, text) => {
    expect(messageOf(id, ["pdf"])).toBe(text);
  });

  it("names every kind and file of a finding", () => {
    expect(messageOf("LicenseRef-publisher", ["pdf", "text"])).toBe(
      'a copy of `k` stores `pdf` and `text` (`pdf/<key>.pdf`, `text/<key>.txt`) under `LicenseRef-publisher`, which does not permit them: the publisher grants no right to third parties. What to do: remove the files and `"pdf"` and `"text"` from that copy\'s `stored`, and keep the paper\'s ids',
    );
  });

  it("names the text file for a stored text", () => {
    expect(messageOf("NOASSERTION", ["text"])).toContain("(`text/<key>.txt`)");
  });
});
