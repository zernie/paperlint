/**
 * The preprints of `real-papers/preprints/` are redistributed here, so each must be under a licence
 * that allows it: the same three the collector takes for the accepted papers (`LICENCES`), and every
 * preprint directory has its manifest entry, so none is in the repository without a recorded licence.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { committedLicenceProblems } from "../scripts/grow-real-papers/rules.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

const Manifest = z.array(z.object({ arxiv_id: z.string(), license: z.string() }));

/** Each way the preprints break the licence rule: an entry's licence, or a directory with no entry. */
const licenceProblems = (
  entries: z.infer<typeof Manifest>,
  dirs: readonly string[],
): readonly string[] => {
  const ids = new Set(entries.map((e) => e.arxiv_id));
  return [
    ...entries.flatMap((e) => committedLicenceProblems(e.arxiv_id, e.license)),
    ...dirs.filter((d) => !ids.has(d)).map((d) => `${d}: no entry in arxiv-manifest.json`),
  ];
};

const BY = "http://creativecommons.org/licenses/by/4.0/";

describe("the preprints' licences", () => {
  it("every committed preprint is under CC BY, CC BY-SA or CC0, and recorded", () => {
    const entries = Manifest.parse(
      JSON.parse(readFileSync(join(HERE, "arxiv-manifest.json"), "utf8")),
    );
    const dirs = readdirSync(join(HERE, "real-papers", "preprints"), {
      withFileTypes: true,
    })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    // Guards: the listing is not empty, so the check below is not vacuous.
    expect(dirs.length).toBeGreaterThan(0);
    // Guards: no preprint under a licence that forbids redistribution, none unrecorded.
    expect(licenceProblems(entries, dirs)).toEqual([]);
  });

  it("names a non-redistributable licence and an unrecorded directory", () => {
    const nc = "http://creativecommons.org/licenses/by-nc/4.0/";
    // Guards: both halves of the check fire on planted defects, and a clean entry stays quiet.
    expect(
      licenceProblems(
        [
          { arxiv_id: "2601.00001v1", license: BY },
          { arxiv_id: "2601.00002v1", license: nc },
        ],
        ["2601.00001v1", "2601.00003v1"],
      ),
    ).toEqual([
      `2601.00002v1: licence ${nc}, not CC BY 4.0, CC BY-SA 4.0 or CC0`,
      "2601.00003v1: no entry in arxiv-manifest.json",
    ]);
  });
});
