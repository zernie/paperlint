/**
 * What a kept paper becomes: the preset it is linted as, its files, its manifest entry and its note.
 */
import * as R from "remeda";
import { describe, expect, test } from "vitest";
import { recordOf, stagingPlan, type StagingPlan } from "./archive.ts";
import { keptPaper, type Kept } from "./paper.ts";
import { slug } from "./preset.ts";
import { preambleOf, type Slot } from "./rules.ts";
import { file, mainTex } from "./testkit.ts";

const slot: Slot = {
  field: "nlp",
  series: "ACL",
  year: 2025,
  cap: 1,
  queries: [],
  max_results: 50,
  venue: "acl",
  classSpec: "acl",
};
const main = mainTex("Hi.", "\\documentclass[11pt]{article}");
const plan = (files = [file("sub/main.tex", main)]): StagingPlan => {
  const p = stagingPlan(files);
  if (!p.ok) throw new Error(p.reason);
  return p;
};
const base: Kept = {
  c: {
    id: "2501.00001v2",
    updated: "2025-05-20",
    title: "A Title",
    comment: "Accepted at ACL 2025",
    journal_ref: "",
    category: "cs.CL",
    authors: ["Ann", "Bo"],
    rank: 3,
    query: 'co:"ACL 2025"',
  },
  slot,
  track: null,
  licence: {
    key: "http://creativecommons.org/licenses/by/4.0/",
    name: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  plan: plan(),
  preamble: preambleOf(main),
  style: "acl",
  styleOptions: [],
  sourceSha: "abc",
  shipped: new Set(),
};

/** The README of `base`, whole. */
const README = `# A Title

- **Authors:** Ann, Bo
- **Source:** arXiv [2501.00001v2](https://arxiv.org/abs/2501.00001v2), e-print \`https://arxiv.org/src/2501.00001v2\` (sha256 \`abc\`)
- **Category:** cs.CL; **document class:** \`[11pt]{article}\`, **style package:** \`acl\`
- **Licence:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), as the arXiv abstract page states. The files are redistributed under it.
- **Accepted at:** ACL 2025. The arXiv comment of [2501.00001v2](https://arxiv.org/abs/2501.00001v2) says: «Accepted at ACL 2025»
- **Linted as:** \`paperlint:acl-latex\`, the camera-ready of an accepted attempt (the ACL style family as no preset ships for this edition)
- **Text sources only, figures omitted.** Kept: \`.tex\`, \`.bib\`, \`.bbl\`, \`.cls\`, \`.sty\`, \`.bst\`, \`.cfg\`, \`.def\`, each at its path from the archive's root, where arXiv compiles. Dropped: images, PDFs, data.
- **Renamed, nothing inside changed:** \`sub/main.tex\` to \`paper.tex\`.
- **Ours:** \`paperlint.json\`, \`PIPELINE-STATUS.md\`, \`record-by-hand.json\`, \`baseline.json\`, \`README.md\`.

\`paperlint.json\` records one attempt, accepted, whose evidence is this file. Its dates are those of the arXiv version that states the acceptance: the real decision day is earlier and not known here. \`record-by-hand.json\` is NOT TeX's answer: it lists \`paper.tex\`, the class and style files at the root, then the \`\\input\`/\`\\include\` files in the order the source names them, hashed over the bytes here. See [\`../README.md\`](../README.md).
`;

describe("a kept paper", () => {
  test("its files: the sources, the record, the status, the cycle and the README", () => {
    const k = keptPaper(base);
    // Guards: what lands in the paper's directory.
    expect([...k.files.keys()]).toEqual([
      "paper.tex",
      "record-by-hand.json",
      "PIPELINE-STATUS.md",
      "paperlint.json",
      "README.md",
    ]);
    // Guards: the record is the staged sources' record.
    expect(k.files.get("record-by-hand.json")).toBe(
      `${JSON.stringify(recordOf(base.plan.staged), null, 2)}\n`,
    );
    // Guards: the cycle a lint run reads.
    expect(JSON.parse(String(k.files.get("paperlint.json")))).toEqual({
      cycles: [
        {
          id: "acl-2025",
          venue: { kind: "preset", extends: "paperlint:acl-latex" },
          opened: "2025-05-20",
          outcome: {
            kind: "accepted",
            date: "2025-05-20",
            evidence: "README.md",
          },
        },
      ],
    });
    // Guards: the generated README, whole (it is the output, every paper's from one template).
    expect(k.files.get("README.md")).toBe(README);
  });
});

describe("a kept paper's entry", () => {
  test("its manifest entry and note, from a comment", () => {
    const k = keptPaper({
      ...base,
      track: "Findings",
      c: { ...base.c, journal_ref: "Findings of ACL 2025" },
    });
    // Guards: every field balance.ts and the baselines read.
    expect(k.entry).toEqual({
      arxiv_id: "2501.00001v2",
      license: "http://creativecommons.org/licenses/by/4.0/",
      source_sha256: "abc",
      main_tex: "./sub/main.tex",
      class: "article",
      category: "cs.CL",
      size_bytes: main.length,
      dir: "2501.00001v2",
      accepted: {
        quote: "Accepted at ACL 2025 | journal-ref: Findings of ACL 2025",
        url: "https://arxiv.org/abs/2501.00001v2",
        venue: "ACL 2025 (Findings)",
      },
      preset: "paperlint:acl-latex",
      kind: null,
      field: "nlp",
      series: "ACL",
      year: 2025,
      track: "Findings",
      source: "arxiv-comment",
      acceptance: "arxiv-comment",
    });
    // Guards: the staging note a reviewer audits.
    expect(k.note).toEqual({
      clsOpts: "11pt",
      style: "acl",
      styleOpts: "",
      mainCandidates: 1,
      presetWhy: "the ACL style family as no preset ships for this edition",
      edits: [],
      renames: ["sub/main.tex to paper.tex"],
      title: "A Title",
    });
  });
});

/** A paper kept from a Semantic Scholar listing, with no style. */
const listed = (publicationDate: string | null, comment: string) =>
  keptPaper({
    ...R.omit(base, ["style", "styleOptions"]),
    c: { ...base.c, comment, s2: { venue: "OSDI", publicationDate } },
    preamble: preambleOf("\\documentclass{article}"),
    plan: plan([file("ms.tex", mainTex("")), file("w.tex", "\\input{ms}")]),
  });

describe("a kept paper from a listing", () => {
  test("from a Semantic Scholar listing, without a style or preset", () => {
    const late = listed("2025-07-01", "");
    const early = listed(null, "OSDI 2025");
    // Guards: the listing is the evidence, and a version older than the venue date is said.
    expect([
      late.entry.accepted,
      late.note.versionNote,
      late.entry.source,
    ]).toEqual([
      {
        quote:
          'Semantic Scholar venue listing: venue "OSDI", year 2025, publication date 2025-07-01',
        url: "https://arxiv.org/abs/2501.00001v2",
        venue: "ACL 2025",
      },
      "latest arXiv version (2025-05-20) predates the venue date (2025-07-01); kept the latest version",
      "semantic-scholar",
    ]);
    // Guards: no date, and the comment appended to the quote.
    expect([early.entry.accepted, early.note.versionNote]).toEqual([
      {
        quote:
          'Semantic Scholar venue listing: venue "OSDI", year 2025, publication date not given; arXiv comment: OSDI 2025',
        url: "https://arxiv.org/abs/2501.00001v2",
        venue: "ACL 2025",
      },
      "latest arXiv version 2025-05-20; venue date not given",
    ]);
  });
});

describe("a listed paper's files", () => {
  test("a listed paper's README and cycle", () => {
    const early = listed(null, "OSDI 2025");
    const readme = String(early.files.get("README.md")).split("\n");
    // Guards: the lines that differ for a listed paper with no preset and a rewritten wrapper.
    expect([readme[4], readme[6], readme[7], readme[9]]).toEqual([
      "- **Category:** cs.CL; **document class:** `[]{article}`",
      '- **Accepted at:** ACL 2025. Semantic Scholar\'s venue listing (the proceedings) holds [2501.00001v2](https://arxiv.org/abs/2501.00001v2) — acceptance evidence without comment wording — query `co:"ACL 2025"`: «Semantic Scholar venue listing: venue "OSDI", year 2025, publication date not given; arXiv comment: OSDI 2025»',
      "- **Linted as:** no preset (`extends` left out), the camera-ready of an accepted attempt (no preset ships for this edition and no template family matches the class: no `extends`, as arxiv-papers does for such papers, but with the accepted cycle)",
      "- **Renamed, one thing changed inside:** `ms.tex` to `paper.tex`; `\\input{ms}` to `\\input{paper}`.",
    ]);
    // Guards: a named venue in the cycle, and the style left null in the note.
    expect([
      JSON.parse(String(early.files.get("paperlint.json"))),
      early.note.style,
    ]).toEqual([
      {
        cycles: [
          {
            id: "acl-2025",
            venue: {
              kind: "named",
              name: "ACL 2025",
              url: "https://arxiv.org/abs/2501.00001v2",
            },
            opened: "2025-05-20",
            outcome: {
              kind: "accepted",
              date: "2025-05-20",
              evidence: "README.md",
            },
          },
        ],
      },
      null,
    ]);
  });
});

describe("the README's variants", () => {
  test("a style with options, and a main file already named paper.tex", () => {
    const k = keptPaper({
      ...base,
      styleOptions: ["final"],
      plan: plan([file("paper.tex", main)]),
    });
    const readme = String(k.files.get("README.md")).split("\n");
    // Guards: the options shown, and nothing renamed.
    expect([readme[4], readme[9]]).toEqual([
      "- **Category:** cs.CL; **document class:** `[11pt]{article}`, **style package:** `acl[final]`",
      "- **Nothing renamed, nothing inside changed:** the main file was already paper.tex.",
    ]);
    // Guards: a slug of a series.
    expect(slug("IEEE S&P")).toBe("ieee-s-p");
  });
});
