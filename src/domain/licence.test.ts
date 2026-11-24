/**
 * The licence table (docs/design/venue-corpus.md, decision 3): what a copy's licence permits the
 * corpus to store, for each kind, with and without the project's non-commercial setting.
 */
import { describe, expect, it } from "vitest";
import {
  isLicenceId,
  permits,
  type LicenceSettings,
  type StoredKind,
} from "./licence.ts";

const COMMERCIAL: LicenceSettings = { nonCommercial: false };
const NON_COMMERCIAL: LicenceSettings = { nonCommercial: true };

/** What `id` permits for text and for the PDF, under `settings`. */
const both = (id: string, settings = COMMERCIAL) =>
  Object.fromEntries(
    (["text", "pdf"] as const satisfies readonly StoredKind[]).map((k) => [
      k,
      permits(id, k, settings),
    ]),
  );

const PERMITTED = { kind: "permitted" } as const;
const NC_ONLY = { kind: "non-commercial-only" } as const;
const ARXIV_WHY =
  'it grants arXiv alone the right to distribute: "We are thus unable to grant others the right to distribute arXiv articles"';
const ND_WHY =
  "ND permits reproduction in unmodified form; whether an extracted text is an adaptation is unsettled";

describe("permits — what a copy's licence lets the corpus store", () => {
  it.each(["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0"])(
    "%s permits text and the PDF, whatever the setting",
    (id) => {
      // Guards: the open licences permit both kinds, commercial or not.
      expect([both(id), both(id, NON_COMMERCIAL)]).toEqual([
        { text: PERMITTED, pdf: PERMITTED },
        { text: PERMITTED, pdf: PERMITTED },
      ]);
    },
  );

  it("🔴 CC-BY-NC-4.0 permits both only when the project is declared non-commercial", () => {
    // Guards: NC is never assumed; the setting turns it on.
    expect([
      both("CC-BY-NC-4.0"),
      both("CC-BY-NC-4.0", NON_COMMERCIAL),
    ]).toEqual([
      { text: NC_ONLY, pdf: NC_ONLY },
      { text: PERMITTED, pdf: PERMITTED },
    ]);
  });

  it("CC-BY-ND-4.0 permits the PDF and no extracted text; NC-ND adds the setting to the PDF", () => {
    const noText = { kind: "forbidden", why: ND_WHY };
    // Guards: ND never permits text, even under the setting; its PDF follows the NC rule.
    expect([
      both("CC-BY-ND-4.0"),
      both("CC-BY-NC-ND-4.0"),
      both("CC-BY-NC-ND-4.0", NON_COMMERCIAL),
    ]).toEqual([
      { text: noText, pdf: PERMITTED },
      { text: noText, pdf: NC_ONLY },
      { text: noText, pdf: PERMITTED },
    ]);
  });

  it("🔴 arXiv's non-exclusive licence permits nothing, even under the setting", () => {
    const no = { kind: "forbidden", why: ARXIV_WHY };
    // Guards: the arXiv default grants nothing to a third party.
    expect(both("LicenseRef-arxiv-nonexclusive-1.0", NON_COMMERCIAL)).toEqual({
      text: no,
      pdf: no,
    });
  });

  it("NOASSERTION permits nothing, as its own result: the licence was not read", () => {
    // Guards: an unread licence is not confused with a forbidding one.
    expect(both("NOASSERTION", NON_COMMERCIAL)).toEqual({
      text: { kind: "not-read" },
      pdf: { kind: "not-read" },
    });
  });

  it.each(["CC-BY-3.0", "CC-BY-4.O", "LicenseRef-mine", "constructor"])(
    "🔴 an id outside the table (%s) permits nothing and is named",
    (id) => {
      // Guards: an unlisted id is its own result naming the id, never a permission.
      expect(both(id, NON_COMMERCIAL)).toEqual({
        text: { kind: "unlisted", id },
        pdf: { kind: "unlisted", id },
      });
    },
  );
});

describe("isLicenceId — the shape of an SPDX id or a LicenseRef", () => {
  it("any SPDX-shaped id or LicenseRef- parses, listed or not", () => {
    const ids = [
      "CC-BY-4.0",
      "CC-BY-3.0",
      "GPL-2.0+",
      "NOASSERTION",
      "LicenseRef-arxiv-nonexclusive-1.0",
    ];
    // Guards: the parser accepts what the table may not list; the table judges it.
    expect(ids.filter(isLicenceId)).toEqual(ids);
  });

  it("text that is no id does not", () => {
    const notIds = [
      "",
      "CC BY 4.0",
      "MIT OR Apache-2.0",
      "-x",
      "https://x.org",
    ];
    // Guards: a phrase, an expression or a URL is refused where it is read.
    expect(notIds.filter(isLicenceId)).toEqual([]);
  });
});
