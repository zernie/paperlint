import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as R from "remeda";
import { describe, expect, it } from "vitest";
import {
  anyConferenceOf,
  editionName,
  orList,
  parseCatalog,
  venueCount,
} from "./catalog.ts";

const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const real = readFileSync(`${root}presets/catalog.json`, "utf8");

const edition = {
  id: "agent-2027",
  series: "AGENT",
  year: 2027,
  family: "ieee-conference",
  templateLabel: "IEEE IEEEtran, conference",
  blind: false,
  kinds: [{ kind: "full", pagesMax: 8, bodyPagesMax: null, refPagesMax: null }],
};
const conference = {
  ...edition,
  id: "icse-2027",
  series: "ICSE",
  kinds: [],
  workshops: [edition],
};
const field = {
  field: "software-engineering",
  title: "Software engineering",
  conferences: [conference],
};
const SMALL = {
  fields: [field],
  families: [
    { id: "acl-latex", templateLabel: "article", anyConferenceOf: "ACL" },
    { id: "acm-acmsmall", templateLabel: "acmsmall", anyConferenceOf: "ACM" },
    { id: "acm-sigconf", templateLabel: "sigconf", anyConferenceOf: "ACM" },
    { id: "icml-style", templateLabel: "icml", anyConferenceOf: null },
  ],
};
const text = (value: unknown): string => JSON.stringify(value);
const withConference = (c: unknown) => ({
  ...SMALL,
  fields: [{ ...field, conferences: [c] }],
});

describe("parseCatalog", () => {
  it("returns a well-formed catalog unchanged", () => {
    expect(parseCatalog(text(SMALL))).toEqual(SMALL);
  });

  it("reads the real presets/catalog.json: every field, each workshop under its conference", () => {
    const catalog = parseCatalog(real);
    expect(catalog.fields.map((f) => [f.field, f.title])).toEqual([
      ["software-engineering", "Software engineering"],
      ["security", "Security"],
      ["nlp", "Natural language processing"],
      ["ml-ai", "Machine learning and AI"],
    ]);
    const nested = catalog.fields.map((f) =>
      f.conferences.map((c) => [
        editionName(c),
        c.workshops.map((w) => w.series),
      ]),
    );
    expect(nested[0]).toContainEqual([
      "ICSE 2027",
      ["AGENT", "AGENTVERIFY", "NLBSE"],
    ]);
    expect(nested[0]).toContainEqual(["ASE 2026", ["AgenticDev"]]);
    expect(nested[1]).toContainEqual(["ACM CCS 2026", ["AISec"]]);
    expect(nested[1]).toContainEqual(["ACSAC 2026", ["AIDC"]]);
    expect(nested[2]).toContainEqual(["EMNLP 2026", ["REALM"]]);
    expect(nested[2]).toContainEqual(["NAACL 2027", ["LangCode"]]);
  });

  it("fails the build, naming the path, on a conference with no templateLabel", () => {
    const bare = R.omit(conference, ["templateLabel"]);
    expect(() => parseCatalog(text(withConference(bare)))).toThrow(
      "site: presets/catalog.json is not a venue catalog: fields.0.conferences.0.templateLabel:",
    );
  });

  it("fails the build on an unknown field", () => {
    const bad = { ...SMALL, fields: [{ ...field, field: "hci" }] };
    expect(() => parseCatalog(text(bad))).toThrow(
      "site: presets/catalog.json is not a venue catalog: fields.0.field:",
    );
  });

  it("fails the build on a page count given as a string", () => {
    const bad = withConference({
      ...conference,
      workshops: [
        {
          ...edition,
          kinds: [{ ...edition.kinds[0], pagesMax: "8" }],
        },
      ],
    });
    expect(() => parseCatalog(text(bad))).toThrow(
      "site: presets/catalog.json is not a venue catalog: fields.0.conferences.0.workshops.0.kinds.0.pagesMax:",
    );
  });

  it("fails the build on text that is not JSON", () => {
    expect(() => parseCatalog("{")).toThrow(
      "site: presets/catalog.json is not JSON:",
    );
  });
});

describe("anyConferenceOf", () => {
  it("names each organisation once, in catalog order", () => {
    expect(anyConferenceOf(parseCatalog(text(SMALL)))).toEqual(["ACL", "ACM"]);
    expect(anyConferenceOf(parseCatalog(real))).toEqual(["ACL", "ACM", "IEEE"]);
  });

  it("fails the build when no family serves any conference", () => {
    // Guards: the page must never say "And any  conference".
    const none = {
      ...SMALL,
      families: SMALL.families.map((f) => ({ ...f, anyConferenceOf: null })),
    };
    expect(() => anyConferenceOf(parseCatalog(text(none)))).toThrow(
      "site: presets/catalog.json has no family for any conference",
    );
  });
});

describe("venueCount, editionName and orList", () => {
  it("counts each conference and each workshop held at one", () => {
    expect(venueCount(parseCatalog(text(SMALL)))).toBe(2);
    const catalog = parseCatalog(real);
    const shown = catalog.fields
      .flatMap((f) => f.conferences)
      .flatMap((c) => [c.id, ...c.workshops.map((w) => w.id)]);
    expect(venueCount(catalog)).toBe(shown.length);
  });

  it("names an edition by its series and year", () => {
    expect(editionName(edition)).toBe("AGENT 2027");
  });

  it("joins names as a sentence says them", () => {
    expect(orList([])).toBe("");
    expect(orList(["ACM"])).toBe("ACM");
    expect(orList(["ACM", "IEEE", "ACL"])).toBe("ACM, IEEE or ACL");
  });
});
