/**
 * The balance of `accepted/`, held mechanically (accepted/README.md, «Growing this set without
 * bias»): the pure check `balanceProblems` fires on planted defects built here, and is quiet on the
 * real `venue-manifest.json`, `sampling/queries.json` and directory listing. No network.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { balanceProblems, type Entry, EntrySchema } from "./balance.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACCEPTED = join(HERE, "accepted");

const BY = "http://creativecommons.org/licenses/by/4.0/";

/** One well-formed sampled entry; each case below changes one thing. */
const entry = (id: string, over: Partial<Entry> = {}): Entry => ({
  arxiv_id: id,
  dir: id,
  license: BY,
  accepted: { quote: "Accepted at X 2025" },
  acceptance: "arxiv-comment",
  field: "ml",
  series: "X",
  year: 2025,
  ...over,
});

const ids = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `2501.0000${String(i)}v1`);

describe("balanceProblems — editions", () => {
  it("is quiet on five papers of one edition, each with a directory", () => {
    const five = ids(5).map((id) => entry(id));
    expect(balanceProblems(five, { ml: 5 }, ids(5))).toEqual([]);
  });

  it("reports a sixth paper of a full edition", () => {
    const six = ids(6).map((id) => entry(id));
    expect(balanceProblems(six, { ml: 10 }, ids(6))).toEqual([
      "edition X 2025: 6 papers, at most 5",
    ]);
  });

  it("counts an edition across fields and batches, by series and year", () => {
    const mixed = [
      ...ids(3).map((id) => entry(id)),
      ...["2502.00001v1", "2502.00002v1", "2502.00003v1"].map((id) =>
        entry(id, { field: undefined }),
      ),
    ];
    expect(
      balanceProblems(mixed, { ml: 5 }, mixed.map((e) => e.dir)),
    ).toEqual(["edition X 2025: 6 papers, at most 5"]);
  });

});

describe("balanceProblems — licence and acceptance evidence", () => {
  it("reports a missing or non-CC licence", () => {
    const bad = [
      entry("2501.00001v1", { license: undefined }),
      entry("2501.00002v1", {
        license: "http://creativecommons.org/licenses/by-nc/4.0/",
      }),
      entry("2501.00003v1", {
        license: "http://creativecommons.org/licenses/by-sa/4.0/",
      }),
      entry("2501.00004v1", {
        license: "http://creativecommons.org/publicdomain/zero/1.0/",
      }),
    ];
    expect(balanceProblems(bad, { ml: 5 }, bad.map((e) => e.dir))).toEqual([
      "2501.00001v1: licence missing, not CC BY 4.0, CC BY-SA 4.0 or CC0",
      "2501.00002v1: licence http://creativecommons.org/licenses/by-nc/4.0/, not CC BY 4.0, CC BY-SA 4.0 or CC0",
    ]);
  });

  it("reports an entry with no acceptance evidence, and takes the venue listing as evidence", () => {
    const bad = [
      entry("2501.00001v1", { accepted: { quote: "" } }),
      entry("2501.00002v1", { accepted: undefined }),
      entry("2501.00003v1", {
        accepted: { quote: "" },
        acceptance: "s2-venue-listing",
      }),
    ];
    expect(balanceProblems(bad, { ml: 5 }, bad.map((e) => e.dir))).toEqual([
      "2501.00001v1: no acceptance evidence (a quote, or acceptance s2-venue-listing)",
      "2501.00002v1: no acceptance evidence (a quote, or acceptance s2-venue-listing)",
    ]);
  });

});

describe("balanceProblems — quotas, editions named, directories", () => {
  it("reports a field over its quota, and a field with no quota", () => {
    const over = [
      entry("2501.00001v1"),
      entry("2501.00002v1"),
      entry("2501.00003v1", { field: "astro" }),
    ];
    expect(balanceProblems(over, { ml: 1 }, over.map((e) => e.dir))).toEqual([
      "field ml: 2 papers, quota 1",
      "field astro: 1 papers, quota 0",
    ]);
  });

  it("reports an entry without series or year, which no edition could count", () => {
    const bad = [entry("2501.00001v1", { series: undefined })];
    expect(balanceProblems(bad, { ml: 5 }, ["2501.00001v1"])).toEqual([
      "2501.00001v1: no series or year",
    ]);
  });

  it("reports an entry with no directory and an arXiv-id directory with no entry, and ignores named ones", () => {
    const one = [entry("2501.00001v1")];
    expect(
      balanceProblems(one, { ml: 5 }, [
        "2501.00002v1",
        "barovox-acsac24",
        "sampling",
      ]),
    ).toEqual([
      "2501.00001v1: no directory accepted/2501.00001v1",
      "accepted/2501.00002v1: no entry in venue-manifest.json",
    ]);
  });
});

describe("the real accepted set", () => {
  const manifest = z
    .array(EntrySchema)
    .parse(
      JSON.parse(readFileSync(join(HERE, "..", "venue-manifest.json"), "utf8")),
    );
  const { quotas } = z
    .object({ quotas: z.record(z.string(), z.number()) })
    .parse(
      JSON.parse(
        readFileSync(join(ACCEPTED, "sampling", "queries.json"), "utf8"),
      ),
    );
  const dirs = readdirSync(ACCEPTED).filter((name) =>
    statSync(join(ACCEPTED, name)).isDirectory(),
  );

  it("holds sampled entries and earlier ones — an empty listing would make the check below vacuous", () => {
    const sampled = manifest.filter((e) => e.field !== undefined).length;
    expect(sampled).toBeGreaterThan(0);
    expect(manifest.length).toBeGreaterThan(sampled);
  });

  it("is balanced: no edition over five, evidence and licence on every entry, fields within quota, entries and directories one to one", () => {
    expect(balanceProblems(manifest, quotas, dirs)).toEqual([]);
  });
});
