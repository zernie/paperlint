/**
 * corpus-licences-core.ts: for each paper of a corpus's `papers.json` and each kind a corpus stores,
 * the copy whose licence permits keeping it, or every copy's reason it may not be kept — and the
 * command that prints it. No model, no network.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "#src/adapters/memory/index";
import { venueCorpusCodec } from "#src/adapters/venue-corpus/index";
import type { VenueCorpus } from "#src/domain/venue-corpus";
import { runNode, useTempDir, writeTree } from "../../../test/support.ts";
import { listing, main, verdicts } from "./corpus-licences-core.ts";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "corpus-licences.ts",
);
const CORPUS = "/work/papers/venues/agent";

const read = (id: string) => ({
  id,
  read_from: "https://api.crossref.org/works/10.1145/1",
  read_on: "2026-11-03",
});
const published = (id: string) => ({
  version: "published",
  url: "https://doi.org/10.1145/1",
  licence: read(id),
  stored: [],
});
const preprint = (id: string) => ({
  version: "preprint",
  url: "https://arxiv.org/abs/2601.00001",
  licence: read(id),
  stored: [],
});
const notRead = {
  version: "preprint",
  url: "https://arxiv.org/abs/2601.00002",
  licence: { id: "NOASSERTION" },
  stored: [],
};
const unknownCopy = {
  version: "unknown",
  licence: { id: "NOASSERTION" },
  stored: ["pdf"],
  fetched_from: "https://example.org/a.pdf",
};

const row = (key: string, copies: readonly object[]) => ({
  key,
  edition: 2026,
  group: "accepted",
  title: `Paper ${key}`,
  ids: { doi: `10.1145/${key}` },
  copies,
});

const record = (papers: readonly object[]) => ({
  venue: "agent",
  editions: [
    {
      edition: 2026,
      listed_from: "https://conf.researchr.org/home/icse-2026/agent-2026",
      read_on: "2026-11-03",
    },
  ],
  papers,
});

/** The record parsed by the real codec, as the command reads it. */
const corpus = (papers: readonly object[]): VenueCorpus => {
  const parsed = venueCorpusCodec.parse(JSON.stringify(record(papers)));
  if (!parsed.ok) throw new Error(parsed.why);
  return parsed.corpus;
};

const COMMERCIAL = { nonCommercial: false };

const ARXIV_WHY =
  'it grants arXiv alone the right to distribute: "We are thus unable to grant others the right to distribute arXiv articles"';
const ND_WHY =
  "ND permits reproduction in unmodified form; whether an extracted text is an adaptation is unsettled";

describe("verdicts — one per paper and kind, from the copies' licences", () => {
  it("🔴 the first copy that permits a kind is the one to keep, per kind", () => {
    // The preprint is arXiv's (permits nothing); the published copy is CC BY-ND: its PDF may be
    // kept, its extracted text may not.
    const c = corpus([
      row("a1", [
        preprint("LicenseRef-arxiv-nonexclusive-1.0"),
        published("CC-BY-ND-4.0"),
      ]),
    ]);
    expect(verdicts(c, COMMERCIAL)).toEqual([
      {
        key: "a1",
        stored: "text",
        outcome: "none",
        refusals: [
          {
            version: "preprint",
            licence: "LicenseRef-arxiv-nonexclusive-1.0",
            permission: { kind: "forbidden", why: ARXIV_WHY },
          },
          {
            version: "published",
            licence: "CC-BY-ND-4.0",
            permission: { kind: "forbidden", why: ND_WHY },
          },
        ],
      },
      {
        key: "a1",
        stored: "pdf",
        outcome: "keep",
        version: "published",
        licence: "CC-BY-ND-4.0",
        url: "https://doi.org/10.1145/1",
      },
    ]);
  });
});

describe("verdicts — what keeps nothing", () => {
  it("🔴 a licence not read, an unknown copy, an unlisted id and no copy at all keep nothing", () => {
    const c = corpus([
      row("b1", [notRead, unknownCopy, published("CC-BY-3.0")]),
      row("b2", []),
    ]);
    const refusals = [
      {
        version: "preprint",
        licence: "NOASSERTION",
        permission: { kind: "not-read" },
      },
      {
        version: "unknown",
        licence: "NOASSERTION",
        permission: { kind: "not-read" },
      },
      {
        version: "published",
        licence: "CC-BY-3.0",
        permission: { kind: "unlisted", id: "CC-BY-3.0" },
      },
    ];
    expect(verdicts(c, COMMERCIAL)).toEqual([
      { key: "b1", stored: "text", outcome: "none", refusals },
      { key: "b1", stored: "pdf", outcome: "none", refusals },
      { key: "b2", stored: "text", outcome: "none", refusals: [] },
      { key: "b2", stored: "pdf", outcome: "none", refusals: [] },
    ]);
  });
});

describe("verdicts — the non-commercial setting, and an empty record", () => {
  it("🔴 a non-commercial copy is kept only in a project declared non-commercial", () => {
    const c = corpus([row("c1", [published("CC-BY-NC-4.0")])]);
    const refused = {
      outcome: "none",
      refusals: [
        {
          version: "published",
          licence: "CC-BY-NC-4.0",
          permission: { kind: "non-commercial-only" },
        },
      ],
    };
    const kept = {
      outcome: "keep",
      version: "published",
      licence: "CC-BY-NC-4.0",
      url: "https://doi.org/10.1145/1",
    };
    expect({
      commercial: verdicts(c, COMMERCIAL),
      nonCommercial: verdicts(c, { nonCommercial: true }),
    }).toEqual({
      commercial: [
        { key: "c1", stored: "text", ...refused },
        { key: "c1", stored: "pdf", ...refused },
      ],
      nonCommercial: [
        { key: "c1", stored: "text", ...kept },
        { key: "c1", stored: "pdf", ...kept },
      ],
    });
  });

  it("an empty record has no verdict", () => {
    expect(verdicts(corpus([]), COMMERCIAL)).toEqual([]);
  });
});

describe("listing — one line per paper and kind", () => {
  it("🔴 names the copy to keep, or each copy's reason, or that no copy is recorded", () => {
    const c = corpus([
      row("a1", [
        preprint("LicenseRef-arxiv-nonexclusive-1.0"),
        published("CC-BY-ND-4.0"),
      ]),
      row("b1", [notRead, unknownCopy, published("CC-BY-3.0")]),
      row("b2", []),
      row("c1", [published("CC-BY-NC-4.0")]),
    ]);
    const b1 =
      "none: preprint: its licence was not read (NOASSERTION); unknown: its licence was not read (NOASSERTION); published: CC-BY-3.0 is not in the licence table, so it permits nothing";
    const c1 =
      "none: published: CC-BY-NC-4.0 permits it only in a project declared non-commercial";
    expect(listing(verdicts(c, COMMERCIAL)).split("\n")).toEqual([
      `a1 text: none: preprint: LicenseRef-arxiv-nonexclusive-1.0: ${ARXIV_WHY}; published: CC-BY-ND-4.0: ${ND_WHY}`,
      "a1 pdf: keep the published copy (CC-BY-ND-4.0), https://doi.org/10.1145/1",
      `b1 text: ${b1}`,
      `b1 pdf: ${b1}`,
      "b2 text: none: no copy recorded",
      "b2 pdf: none: no copy recorded",
      `c1 text: ${c1}`,
      `c1 pdf: ${c1}`,
      "",
    ]);
  });

  it("an empty record lists that it holds no paper", () => {
    expect(listing([])).toBe("papers.json holds no paper\n");
  });
});

describe("main — the command, on a memory disk", () => {
  const run = (argv: readonly string[], files: Record<string, string>) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = main(
      argv,
      { files: memoryFiles(files), codec: venueCorpusCodec },
      { out: (s) => out.push(s), err: (s) => err.push(s) },
    );
    return { code, out: out.join(""), err: err.join("") };
  };

  it("🔴 a record that parses: its listing on stdout, exit 0", () => {
    const papers = [row("c1", [published("CC-BY-4.0")])];
    expect(
      run([CORPUS], {
        [`${CORPUS}/papers.json`]: JSON.stringify(record(papers)),
      }),
    ).toEqual({
      code: 0,
      out: "c1 text: keep the published copy (CC-BY-4.0), https://doi.org/10.1145/1\nc1 pdf: keep the published copy (CC-BY-4.0), https://doi.org/10.1145/1\n",
      err: "",
    });
  });

  it("🔴 a record that does not parse: the codec's reasons on stderr, exit 1", () => {
    const papers = [{ ...row("bad.key", []), ids: {} }];
    expect(
      run([CORPUS], {
        [`${CORPUS}/papers.json`]: JSON.stringify(record(papers)),
      }),
    ).toEqual({
      code: 1,
      out: "",
      err: "corpus-licences: papers.json: papers.0.key: a letter or digit, then letters, digits, '_' or '-'; papers.0.ids: at least one of doi, arxiv, dblp, s2, url\n",
    });
  });

  it("🔴 no papers.json in the folder: said, exit 1", () => {
    expect(run([CORPUS], {})).toEqual({
      code: 1,
      out: "",
      err: `corpus-licences: no papers.json in ${CORPUS}: write the record first\n`,
    });
  });

  it("no folder named: the usage on stderr, exit 2", () => {
    expect(run([], {})).toEqual({
      code: 2,
      out: "",
      err: "usage: node corpus-licences.js <corpus-dir>\n",
    });
  });
});

describe("corpus-licences.ts — the runner on a real folder", () => {
  const dir = useTempDir();

  it("🔴 lists the corpus from any cwd", () => {
    writeTree(dir, {
      "papers.json": JSON.stringify(
        record([row("a1", [preprint("LicenseRef-arxiv-nonexclusive-1.0")])]),
      ),
    });
    const line = `none: preprint: LicenseRef-arxiv-nonexclusive-1.0: ${ARXIV_WHY}`;
    expect(runNode(SCRIPT, [dir], { cwd: "/" })).toEqual({
      status: 0,
      stdout: `a1 text: ${line}\na1 pdf: ${line}\n`,
      stderr: "",
    });
  });

  it("no argument: the usage on stderr, exit 2", () => {
    expect(runNode(SCRIPT, [], { cwd: "/" })).toEqual({
      status: 2,
      stdout: "",
      stderr: "usage: node corpus-licences.js <corpus-dir>\n",
    });
  });
});
