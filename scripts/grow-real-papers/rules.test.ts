/**
 * The four selection rules, each on a planted defect and on a clean case.
 */
import { describe, expect, test } from "vitest";
import {
  judgeClass,
  judgeComment,
  judgeLicence,
  committedLicenceProblems,
  judgeListedVenue,
  judgeSize,
  MAX_BYTES,
  preambleOf,
  stripComments,
} from "./rules.ts";

const neurips = {
  venue: "neur\\s?ips|nips",
  series: "NeurIPS",
  year: 2025,
  allowPoster: true,
};
const acl = { venue: "acl", series: "ACL", year: 2025 };
const say = (comment: string, journal_ref = "") => ({ comment, journal_ref });

describe("rule 1: the acceptance wording", () => {
  test.each([
    [
      "the edition is not named",
      say("Accepted at NeurIPS 2024"),
      "comment does not state NeurIPS 2025",
    ],
    [
      "a workshop title naming the venue",
      say("Accepted: Workshop on Safe Agents at NeurIPS 2025"),
      'not accepted wording: reads as a workshop title (": Workshop on Safe Agents at NeurIPS")',
    ],
    [
      "a negative word",
      say("Submitted to NeurIPS 2025"),
      'not accepted wording: comment says "Submitted"',
    ],
    [
      "an «@ venue», which names a workshop or a track",
      say("Accepted, SafeML @ NeurIPS 2025"),
      'not accepted wording: comment says "@ NeurIPS"',
    ],
    [
      "no positive word",
      say("NeurIPS 2025, 9 pages"),
      "not accepted wording: no acceptance statement",
    ],
  ])("rejects %s", (_, c, reason) => {
    // Guards: each reason the probe log records, as a whole verdict.
    expect(judgeComment(c, neurips)).toEqual({ ok: false, reason });
  });

  test("a poster passes where the slot allows posters, and not elsewhere", () => {
    const c = say("Accepted as a poster at NeurIPS 2025");
    // Guards: allowPoster lets a poster through.
    expect(judgeComment(c, neurips)).toEqual({ ok: true, track: null });
    // Guards: without allowPoster the same comment is rejected.
    expect(judgeComment(c, { ...neurips, allowPoster: false })).toEqual({
      ok: false,
      reason: 'not accepted wording: comment says "poster"',
    });
  });

  test("the journal-ref counts, and Findings is a track of the ACL family only", () => {
    const findings = say("", "Findings of ACL 2025, accepted");
    // Guards: an ACL Findings paper is kept with its track.
    expect(judgeComment(findings, acl)).toEqual({
      ok: true,
      track: "Findings",
    });
    // Guards: "findings" in another series is no track.
    expect(
      judgeComment(say("Accepted at NeurIPS 2025, findings"), neurips),
    ).toEqual({ ok: true, track: null });
  });
});

describe("rule 1 on a Semantic Scholar listing", () => {
  test("a Semantic Scholar venue string must be the main proceedings", () => {
    // Guards: a workshop venue string is rejected.
    expect(
      judgeListedVenue("NeurIPS Workshop on X", {
        comment: "",
        slot: { venue: "NeurIPS", series: "NeurIPS", year: 2025 },
      }),
    ).toEqual({
      ok: false,
      reason:
        'S2 venue string is not the main proceedings: "NeurIPS Workshop on X"',
    });
    // Guards: the proceedings pass.
    expect(
      judgeListedVenue("OSDI", {
        comment: "",
        slot: { venue: "OSDI", series: "OSDI", year: 2025 },
      }),
    ).toEqual({ ok: true, track: null });
  });
  test("a listed paper whose own comment names another edition is rejected", () => {
    const eurosys = { venue: "EuroSys", series: "EuroSys", year: 2025 };
    // Guards: the listing's year is not the edition when the comment names a later one.
    expect(
      judgeListedVenue("European Conference on Computer Systems", {
        comment: "Accepted by EuroSys 2026",
        slot: eurosys,
      }),
    ).toEqual({
      ok: false,
      reason: "the arXiv comment names EuroSys 2026, not EuroSys 2025",
    });
    // Guards: a two-digit year after an apostrophe is read too.
    expect(
      judgeListedVenue("OSDI", {
        comment: "OSDI'26",
        slot: { venue: "OSDI", series: "OSDI", year: 2025 },
      }),
    ).toEqual({
      ok: false,
      reason: "the arXiv comment names OSDI 2026, not OSDI 2025",
    });
    // Guards: the same edition, another venue's year, or no year at all pass.
    expect(
      [
        "Accepted by EuroSys 2025",
        "Extends our SOSP 2024 paper",
        "13 pages, 10 figures",
      ].map((comment) =>
        judgeListedVenue("EuroSys", { comment, slot: eurosys }),
      ),
    ).toEqual([
      { ok: true, track: null },
      { ok: true, track: null },
      { ok: true, track: null },
    ]);
  });
});

describe("a committed paper's recorded licence", () => {
  test("one of LICENCES passes; any other, or none, is named", () => {
    // Guards: the one check balance.ts and arxiv-manifest.test.ts both run, on both halves.
    expect([
      committedLicenceProblems(
        "2601.00001v1",
        "http://creativecommons.org/licenses/by/4.0/",
      ),
      committedLicenceProblems(
        "2601.00002v1",
        "http://creativecommons.org/licenses/by-nc/4.0/",
      ),
      committedLicenceProblems("2601.00003v1", undefined),
    ]).toEqual([
      [],
      [
        "2601.00002v1: licence http://creativecommons.org/licenses/by-nc/4.0/, not CC BY 4.0, CC BY-SA 4.0 or CC0",
      ],
      ["2601.00003v1: licence missing, not CC BY 4.0, CC BY-SA 4.0 or CC0"],
    ]);
  });
});

describe("rule 2: the licence", () => {
  test("only the redistributable licences pass", () => {
    // Guards: arXiv's default licence (no <license>) is rejected.
    expect(judgeLicence(undefined)).toEqual({
      ok: false,
      reason: "licence arXiv default (none)",
    });
    // Guards: a non-commercial licence is rejected, named without its host.
    expect(
      judgeLicence("http://creativecommons.org/licenses/by-nc-nd/4.0/"),
    ).toEqual({ ok: false, reason: "licence licenses/by-nc-nd/4.0/" });
    // Guards: CC BY passes with its name and https URL.
    expect(judgeLicence("http://creativecommons.org/licenses/by/4.0/")).toEqual(
      {
        ok: true,
        key: "http://creativecommons.org/licenses/by/4.0/",
        name: "CC BY 4.0",
        url: "https://creativecommons.org/licenses/by/4.0/",
      },
    );
  });
});

const CLASS_REJECTED: readonly (readonly [string, string, string, string])[] = [
  ["a missing class", "neurips", "", "template: class null, not article"],
  [
    "no class where a class decides",
    "ieee",
    "",
    "template: class null, not IEEEtran",
  ],
  [
    "the class without the style package",
    "neurips",
    "\\documentclass{article}",
    "template: class article without the venue style package (/^(neurips|nips)_20\\d\\d$/)",
  ],
  [
    "the style in review mode",
    "acl",
    "\\documentclass{article}\\usepackage[review]{acl}",
    "template: style acl in review/submission mode [review]",
  ],
  [
    "the class in review mode",
    "acm",
    "\\documentclass[sigconf,review]{acmart}",
    "template: class acmart in review mode [sigconf,review]",
  ],
  [
    "a class neither alternative takes",
    "acm_or_ieee",
    "\\documentclass{article}",
    "template: class article, not acmart",
  ],
];

const CLASS_KEPT: readonly (readonly [string, string, object])[] = [
  [
    "neurips",
    "\\documentclass{article}\\usepackage[final]{neurips_2025}",
    { ok: true, style: "neurips_2025", styleOpts: "final" },
  ],
  ["ieee", "\\documentclass[conference]{IEEEtran}", { ok: true }],
  ["acm_or_ieee", "\\documentclass[conference]{IEEEtran}", { ok: true }],
  ["acm_or_ieee", "\\documentclass[sigconf]{acmart}", { ok: true }],
  [
    "usenix",
    "\\documentclass{article}\\usepackage{usenix2019_v3}",
    {
      ok: true,
      style: "usenix2019_v3",
      styleOpts: "",
    },
  ],
];

describe("rule 3: the class and style", () => {
  test("the preamble: class, options and packages, comments ignored", () => {
    const main = [
      "% \\documentclass{acmart}",
      "\\documentclass[sigconf,review]{tmpl/acmart.cls}",
      "\\usepackage[final]{neurips_2025} 100\\% sure",
      "\\RequirePackage{amsmath, amssymb}",
    ].join("\n");
    // Guards: the first uncommented class, its path and extension dropped, every package.
    expect(preambleOf(main)).toEqual({
      cls: "acmart",
      clsOpts: "sigconf,review",
      pkgs: [
        { name: "neurips_2025", opts: "final" },
        { name: "amsmath", opts: "" },
        { name: "amssymb", opts: "" },
      ],
    });
    // Guards: no class at all.
    expect(preambleOf("text")).toEqual({ cls: null, clsOpts: "", pkgs: [] });
    // Guards: an escaped percent stays.
    expect(stripComments("a\\% b % c")).toBe("a\\% b ");
  });

  test.each(CLASS_REJECTED)("rejects %s", (_, spec, main, reason) => {
    // Guards: each class reason, prefixed as the log records it.
    expect(judgeClass(spec, preambleOf(main))).toEqual({ ok: false, reason });
  });

  test.each(CLASS_KEPT)("keeps a camera-ready of %s", (spec, main, verdict) => {
    // Guards: the clean case of each kind of spec (style, class, either side of an either).
    expect(judgeClass(spec, preambleOf(main))).toEqual(verdict);
  });

  test("an unknown classSpec is a broken queries.json", () => {
    // Guards: a typo in queries.json stops the run instead of rejecting every paper.
    expect(() => judgeClass("neurps", preambleOf(""))).toThrow(
      "queries.json: unknown classSpec neurps",
    );
  });
});

describe("rule 4: the size", () => {
  test("at most MAX_BYTES of text", () => {
    // Guards: the limit itself passes.
    expect(judgeSize(MAX_BYTES)).toEqual({ ok: true });
    // Guards: one byte more is rejected, with the count.
    expect(judgeSize(MAX_BYTES + 1)).toEqual({
      ok: false,
      reason: ">300KB of text sources (300001 bytes)",
    });
  });
});
