/**
 * Venue presets: what `"extends"` in a paper's `paperlint.json` resolves to. Two spec forms —
 * `paperlint:<name>` (shipped) and a relative path (the project's own) — a chain of at most four
 * presets, merged block by block, and a display label derived from the spec.
 *
 * The shipped presets are read from the package's venues directory, so a shipped file that stops
 * resolving shows here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { frozenText } from "../test/frozen-presets.ts";
import { presetsDir } from "./package-dirs.ts";
import { parsePreset } from "./tex-requirements.ts";
import {
  deadlineYearProblems,
  editionOf,
  idProblem,
} from "./domain/edition.ts";
import {
  MAX_PRESET_DEPTH,
  SHIPPED_PREFIX,
  shippedPresets,
  shippedSpec,
  shippedVenueNames,
  labelOf,
  presetProblemText,
  resolvePreset,
} from "./presets.ts";

const VENUES = presetsDir();
const live = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f))]),
);
// The shipped msr-2027.jsonc's deadlines are rewritten by the scheduled refresh, so the tests of LOGIC
// read it FROZEN (test/frozen-presets.ts); only the shape test below reads the shipped file.
const shipped = {
  ...live,
  [join(VENUES, "msr-2027.jsonc")]: frozenText("msr-2027.jsonc"),
};
const PAPER_FILE = "/work/papers/p/paperlint.json";
const deps = (extra: Record<string, string> = {}, base = shipped) => ({
  files: memoryFiles({ ...base, ...extra }),
  venuesDir: VENUES,
});
const resolve = (
  spec: string,
  extra: Record<string, string> = {},
  base = shipped,
) => resolvePreset(spec, PAPER_FILE, deps(extra, base));
/** A venue preset of a project's own: the identity every venue declares, then `body`. */
const venue = (body: Record<string, unknown>, name = "Our Workshop"): string =>
  JSON.stringify({
    type: "venue",
    name,
    url: "https://example.org/cfp",
    ...body,
  });
/** A template family of a project's own. */
const family = (body: Record<string, unknown>): string =>
  JSON.stringify({ type: "family", ...body });

describe("shipped presets", () => {
  it("paperlint:agenticdev-2026 → agenticdev over acm-sigconf: the family's format, the venue's kinds", () => {
    const r = resolve("paperlint:agenticdev-2026");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.chain.map((f) => f.split("/").pop())).toEqual([
      "acm-sigconf.jsonc",
      "agenticdev-2026.jsonc",
    ]);
    expect(r.value.format.columns).toBe(2);
    expect(r.value.format.fontsText).toBe("LinLibertine");
    expect([...r.value.format.kinds.keys()]).toEqual(["short", "full", "demo"]);
    // The family's template, as its file spells it: the child names none.
    expect(r.value.template).toEqual({
      text: "\\documentclass[sigconf]{acmart}",
      file: join(VENUES, "acm-sigconf.jsonc"),
      forbids: [],
    });
    expect("acmart" in r.value.tex.packages).toBe(true);
    // The label is the venue's own name, from its file's `name`; the id stays the file name — the
    // stable key the facts file and the build plan carry.
    expect(r.value.label).toBe("AgenticDev");
    expect(r.value.id).toBe("agenticdev-2026");
    expect(r.value.identity).toEqual({
      type: "venue",
      name: "AgenticDev",
      url: "https://conf.researchr.org/home/ase-2026/agenticdev-2026",
    });
  });
});

describe("shipped presets: paperlint:msr-2027", () => {
  it("paperlint:msr-2027 → msr over ieee-conference: one kind, appendices counted as body, compsoc forbidden", () => {
    const r = resolve("paperlint:msr-2027", {}, live);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.chain.map((f) => f.split("/").pop())).toEqual([
      "ieee-conference.jsonc",
      "msr-2027.jsonc",
    ]);
    expect([...r.value.format.kinds]).toEqual([
      ["technical", { pagesMax: null, bodyPagesMax: 10, refPagesMax: 2 }],
    ]);
    expect(r.value.format.bodyEndsAt).toBe("references");
    expect(r.value.format.appendixInBody).toBe(true);
    expect(r.value.format.pageWidthIn).toBe(8.5);
    expect(r.value.template).toEqual({
      text: "\\documentclass[10pt,conference]{IEEEtran}",
      file: join(VENUES, "msr-2027.jsonc"),
      forbids: ["compsoc", "compsocconf"],
    });
    expect(r.value.blind).toBe(true);
    expect(r.value.portal).toEqual({
      kind: "hotcrp",
      url: "https://msr2027.hotcrp.com",
    });
    // The deadlines' SHAPE, never their dates: the scheduled refresh rewrites those whenever the
    // portal moves them (deadlines.yml), and a date asserted here turns its pull request red.
    // Guards: the shipped preset keeps a submission deadline, every reading is the portal's own
    // from the venue's deadlines page, with a read day and an instant that carries its zone.
    expect(r.value.deadlines.map((d) => d.what)).toContain("submission");
    expect(
      r.value.deadlines.map((d) => ({
        source: d.source,
        url: d.url,
        read: /^\d{4}-\d{2}-\d{2}$/.test(d.read),
        at: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(d.at),
      })),
    ).toEqual(
      r.value.deadlines.map(() => ({
        source: "portal",
        url: "https://msr2027.hotcrp.com/deadlines",
        read: true,
        at: true,
      })),
    );
    // No rule turned on: the IEEE capitalization rule has not been read and quoted.
    expect(r.value.rules).toEqual({});
    expect(r.value.registerAnchors).toEqual([]);
  });
});

describe("shipped presets: paperlint:fse-2027", () => {
  it("paperlint:fse-2027 → fse over acm-acmsmall: one column, the family's template, two kinds, both readings of the deadline", () => {
    const r = resolve("paperlint:fse-2027");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.chain.map((f) => f.split("/").pop())).toEqual([
      "acm-acmsmall.jsonc",
      "fse-2027.jsonc",
    ]);
    expect(r.value.format.columns).toBe(1);
    expect(r.value.format.pageWidthIn).toBe(6.75);
    expect(r.value.format.pageHeightIn).toBe(10);
    expect(r.value.format.fontsText).toBe("LinLibertine");
    expect(r.value.format.fontsTitle).toBe("LinBiolinum");
    expect([...r.value.format.kinds]).toEqual([
      ["research", { pagesMax: null, bodyPagesMax: 18, refPagesMax: 4 }],
      ["major-revision", { pagesMax: null, bodyPagesMax: 20, refPagesMax: 4 }],
    ]);
    // The call only encourages review, screen and anonymous, so the family's line stands.
    expect(r.value.template).toEqual({
      text: "\\documentclass[acmsmall]{acmart}",
      file: join(VENUES, "acm-acmsmall.jsonc"),
      forbids: [],
    });
    expect("acmart" in r.value.tex.packages).toBe(true);
    expect(r.value.blind).toBe(true);
    expect(r.value.portal).toEqual({
      kind: "hotcrp",
      url: "https://fse2027.hotcrp.com",
    });
    // One submission deadline, read twice: the portal's and the call's extended day, both kept.
    expect(r.value.deadlines.map((d) => [d.what, d.source])).toEqual([
      ["submission", "portal"],
      ["submission", "call"],
    ]);
    expect(r.value.label).toBe("FSE");
    expect(r.value.year).toBe(2027);
    expect(r.value.rules).toEqual({});
  });
});

describe("shipped presets: a family, and a venue that stands alone", () => {
  it("a paper may extend a family directly: format and fonts, and no kinds", () => {
    const r = resolve("paperlint:acm-sigconf");
    expect(r.ok && r.value.format.kinds.size).toBe(0);
    expect(r.ok && r.value.format.pageWidthIn).toBe(8.5);
  });

  it("realm (ACL) extends the acl-latex family: its class line from the family, A4 from its own measurement", () => {
    const r = resolve("paperlint:realm-2026");
    expect(r.ok && r.value.chain).toEqual([
      join(VENUES, "acl-latex.jsonc"),
      join(VENUES, "realm-2026.jsonc"),
    ]);
    expect(r.ok && r.value.template?.text).toBe(
      "\\documentclass[11pt]{article}",
    );
    expect(r.ok && r.value.format.pageWidthIn).toBe(8.27);
  });

  it("agenticdev turns pdf/last-page-balance on — its producer asks for balanced columns", () => {
    const r = resolve("paperlint:agenticdev-2026");
    expect(r.ok && r.value.rules["pdf/last-page-balance"]).toEqual([
      "error",
      { tolerancePt: 120 },
    ]);
  });
});

// Each shipped preset, parsed: its file name and what it extends. The families are DERIVED — a
// shipped preset another shipped preset extends — so a new family is checked the day it ships.
const PARSED = shippedPresets(VENUES).map((name) => {
  const file = join(VENUES, `${name}.jsonc`);
  return {
    name,
    preset: parsePreset(readFileSync(file, "utf8"), file, VENUES),
  };
});
const FAMILIES = PARSED.filter((p) =>
  PARSED.some((q) => q.preset.extends === `${SHIPPED_PREFIX}${p.name}`),
);

// What each shipped preset declares itself to be; a new preset adds its row here.
const DECLARED = {
  "acl-latex.jsonc": { type: "family" },
  "acm-acmsmall.jsonc": { type: "family" },
  "acm-sigconf.jsonc": { type: "family" },
  "agenticdev-2026.jsonc": {
    type: "venue",
    name: "AgenticDev",
    url: "https://conf.researchr.org/home/ase-2026/agenticdev-2026",
  },
  "acsac-2026.jsonc": {
    type: "venue",
    name: "ACSAC",
    url: "https://www.acsac.org/2026/submissions/papers/",
  },
  "agent-2027.jsonc": {
    type: "venue",
    name: "AGENT",
    url: "https://conf.researchr.org/home/icse-2027/agent-2027",
  },
  "agentverify-2027.jsonc": {
    type: "venue",
    name: "AGENTVERIFY",
    url: "https://agentverify2027.github.io/cfp.html",
  },
  "aidc-2026.jsonc": {
    type: "venue",
    name: "AIDC",
    url: "https://aidcworkshop.github.io/",
  },
  "aisec-2026.jsonc": {
    type: "venue",
    name: "AISec",
    url: "https://aisec.cc/",
  },
  "ase-2026.jsonc": {
    type: "venue",
    name: "ASE",
    url: "https://conf.researchr.org/track/ase-2026/ase-2026-research-track",
  },
  "ccs-2026.jsonc": {
    type: "venue",
    name: "ACM CCS",
    url: "https://www.sigsac.org/ccs/CCS2026/call-for/call-for-papers.html",
  },
  "emnlp-2026.jsonc": {
    type: "venue",
    name: "EMNLP",
    url: "https://2026.emnlp.org/calls/main_conference_papers/",
  },
  "fse-2027.jsonc": {
    type: "venue",
    name: "FSE",
    url: "https://conf.researchr.org/track/fse-2027/fse-2027-papers",
  },
  "icse-2027.jsonc": {
    type: "venue",
    name: "ICSE",
    url: "https://conf.researchr.org/track/icse-2027/icse-2027-research-track",
  },
  "icse-2028.jsonc": {
    type: "venue",
    name: "ICSE",
    url: "https://conf.researchr.org/track/icse-2028/icse-2028-papers",
  },
  "ieee-conference.jsonc": { type: "family" },
  "msr-2027.jsonc": {
    type: "venue",
    name: "MSR",
    url: "https://2027.msrconf.org/track/msr-2027-technical-papers",
  },
  "nlbse-2027.jsonc": {
    type: "venue",
    name: "NLBSE",
    url: "https://conf.researchr.org/home/icse-2027/nlbse-2027",
  },
  "realm-2026.jsonc": {
    type: "venue",
    name: "REALM",
    url: "https://realm-workshop.github.io/call_for_papers",
  },
  "sp-2027.jsonc": {
    type: "venue",
    name: "IEEE S&P",
    url: "https://sp2027.ieee-security.org/cfpapers.html",
  },
  "tex-base.jsonc": { type: "base" },
};

describe("what each shipped preset declares itself to be", () => {
  it("every shipped preset loads and declares what it is; a venue links its call", () => {
    const declared = Object.fromEntries(
      readdirSync(VENUES)
        .filter((f) => f.endsWith(".jsonc"))
        .map((f) => [
          f,
          parsePreset(readFileSync(join(VENUES, f), "utf8"), f, VENUES)
            .identity,
        ]),
    );
    expect(declared).toEqual(DECLARED);
  });

  it("the families another preset extends are exactly the ones that declare `family`", () => {
    expect(
      PARSED.filter((p) => p.preset.identity.type === "family").map(
        (p) => p.name,
      ),
    ).toEqual(FAMILIES.map((f) => f.name));
  });
});

describe("the naming convention of shipped presets (docs/rules.md)", () => {
  const families = FAMILIES;
  const presets = PARSED.map((p) => ({
    name: p.name,
    extends: p.preset.extends,
  }));
  const publishers = families.map((f) => f.name.slice(0, f.name.indexOf("-")));

  it("there are families to check (else the checks below see nothing)", () => {
    expect(families.map((f) => f.name).sort()).toEqual([
      "acl-latex",
      "acm-acmsmall",
      "acm-sigconf",
      "ieee-conference",
    ]);
  });

  it.each(families.map((f) => [f.name]))(
    "the family %s is <publisher>-<template variant>",
    (name) => {
      expect(name).toMatch(/^[a-z0-9]+-[a-z0-9-]+$/);
    },
  );

  it.each(presets.filter((p) => p.extends !== null).map((p) => [p.name]))(
    "the venue %s carries no publisher prefix — its template is said by `extends`",
    (name) => {
      // The series, not the id: ACL's own conference is `acl-<year>`, a series named after its publisher.
      const series = editionOf(name)?.series ?? name;
      expect(publishers.filter((pub) => series.startsWith(`${pub}-`))).toEqual(
        [],
      );
    },
  );
});

describe("a project's own preset, by relative path", () => {
  const usenix = venue(
    {
      extends: "paperlint:acm-sigconf",
      format: {
        columns: 1,
        kinds: { full: { body_pages_max: 13, ref_pages_max: 0 } },
      },
      tex: { packages: { usenix: ["usenix.sty"] } },
      rules: { "pdf/body-size": "off" },
    },
    "USENIX Security",
  );

  it("./ is relative to the file that says it; merged per block, child wins", () => {
    const r = resolve("../../venues/usenix-sec.jsonc", {
      "/work/venues/usenix-sec.jsonc": usenix,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // format: per key, child wins; the rest comes from the family
    expect(r.value.format.columns).toBe(1);
    expect(r.value.format.pageWidthIn).toBe(8.5);
    // tex: union, never subtract
    expect("usenix" in r.value.tex.packages).toBe(true);
    expect("acmart" in r.value.tex.packages).toBe(true);
    // rules: per id
    expect(r.value.rules["pdf/body-size"]).toBe("off");
    // label: the preset's `name` wins over the file name
    expect(r.value.label).toBe("USENIX Security");
  });

  it("a family names no venue: its label is the file name without its extension", () => {
    const r = resolve("./venues/usenix-sec.jsonc", {
      "/work/papers/p/venues/usenix-sec.jsonc": family({
        extends: "paperlint:acm-sigconf",
      }),
    });
    expect(r.ok && r.value.label).toBe("usenix-sec");
    expect(r.ok && r.value.identity).toEqual({ type: "family" });
  });
});

describe("a project's own preset: what its children replace", () => {
  it("a child kind replaces that kind wholesale; other kinds are kept", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:agenticdev-2026",
        format: { kinds: { short: { body_pages_max: 6, ref_pages_max: 2 } } },
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.format.kinds.get("short")).toEqual({
      pagesMax: null,
      bodyPagesMax: 6,
      refPagesMax: 2,
    });
    expect(r.value.format.kinds.get("full")?.bodyPagesMax).toBe(10);
  });

  it("rules: the leaf wins over its parent, per rule id", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:agenticdev-2026",
        rules: { "pdf/last-page-balance": "off" },
      }),
    });
    expect(r.ok && r.value.rules["pdf/last-page-balance"]).toBe("off");
  });

  it("ruleOrigins: each rule's entry names the file of the chain that set it", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:agenticdev-2026",
        rules: { "pdf/body-size": "off" },
      }),
    });
    // Guards: an own rule is the leaf's, an inherited one names the parent that set it.
    expect(r.ok && r.value.ruleOrigins).toEqual({
      "pdf/last-page-balance": join(VENUES, "agenticdev-2026.jsonc"),
      "tex/heading-case": join(VENUES, "agenticdev-2026.jsonc"),
      "pdf/body-size": "/work/papers/p/mine.jsonc",
    });
  });

  it("ruleOrigins: a rule the leaf sets again is the leaf's, not its parent's", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:agenticdev-2026",
        rules: { "tex/heading-case": "off" },
      }),
    });
    expect(r.ok && r.value.ruleOrigins["tex/heading-case"]).toBe(
      "/work/papers/p/mine.jsonc",
    );
  });
});

describe("a project's own preset: its deadlines", () => {
  const reading = (what: string, at: string, source = "portal") => ({
    what,
    at,
    source,
    url: "https://example.org/deadlines",
    read: "2026-10-05",
  });

  it("a child's deadlines replace its parent's whole; none named keeps the parent's", () => {
    const own = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:msr-2027",
        deadlines: [reading("submission", "2026-10-21T04:00:00Z")],
      }),
    });
    expect(own.ok && own.value.deadlines).toEqual([
      reading("submission", "2026-10-21T04:00:00Z"),
    ]);
    const inherited = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({ extends: "paperlint:msr-2027" }),
    });
    expect(inherited.ok && inherited.value.deadlines.length).toBe(2);
    const none = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({ extends: "paperlint:aisec-2026" }),
    });
    expect(none.ok && none.value.deadlines).toEqual([]);
  });

  it("the portal's and the call's reading of one kind may stand side by side", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:aisec-2026",
        deadlines: [
          reading("submission", "2026-10-20T04:00:00Z"),
          reading("submission", "2026-10-21T11:59:59Z", "call"),
        ],
      }),
    });
    expect(r.ok && r.value.deadlines.map((d) => d.source)).toEqual([
      "portal",
      "call",
    ]);
  });
});

describe("a project's own preset: deadlines it refuses", () => {
  const reading = (what: string, at: string, source = "portal") => ({
    what,
    at,
    source,
    url: "https://example.org/deadlines",
    read: "2026-10-05",
  });

  it.each([
    [
      "two readings of one kind from one source",
      [
        reading("submission", "2026-10-20T04:00:00Z"),
        reading("submission", "2026-10-21T04:00:00Z"),
      ],
      /"deadlines" holds two "portal" readings of "submission" — keep one, the latest/,
    ],
    [
      "an instant that is not UTC as a portal publishes it",
      [reading("submission", "2026-10-20 AoE")],
      /deadlines/,
    ],
    [
      "a reading without the day it was read",
      [{ ...reading("submission", "2026-10-20T04:00:00Z"), read: undefined }],
      /deadlines/,
    ],
  ])("refuses %s, naming the file", (_what, deadlines, re) => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:aisec-2026",
        deadlines,
      }),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(presetProblemText(r.error)).toMatch(/mine\.jsonc/);
    expect(presetProblemText(r.error)).toMatch(re);
  });
});

describe("what does not resolve, and says why", () => {
  it.each([
    [
      "an npm package name",
      "@acme/venues",
      "unsupported",
      /npm presets: not yet supported/,
    ],
    [
      "a bare name",
      "agenticdev-2026",
      "unsupported",
      /paperlint:agenticdev-2026/,
    ],
    [
      "a shipped name with a typo",
      "paperlint:agenticdve",
      "not-found",
      /acl-latex, acm-acmsmall, acm-sigconf, acsac-2026, agent-2027, agenticdev-2026, agentverify-2027, aidc-2026, aisec-2026, ase-2026, ccs-2026, emnlp-2026, fse-2027, icse-2027, icse-2028, ieee-conference, msr-2027, nlbse-2027, realm-2026, sp-2027/,
    ],
    ["the base TeX set", "paperlint:tex-base", "not-found", /agenticdev/],
    [
      "a relative file that is not there",
      "./nope.jsonc",
      "not-found",
      /nope\.jsonc/,
    ],
  ])("%s", (_, spec, kind, text) => {
    const r = resolve(spec);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe(kind);
    expect(presetProblemText(r.error)).toMatch(text);
  });
});

describe("chains that do not resolve", () => {
  it("a cycle is refused, naming the chain", () => {
    const r = resolve("./a.jsonc", {
      "/work/papers/p/a.jsonc": family({ extends: "./b.jsonc" }),
      "/work/papers/p/b.jsonc": family({ extends: "./a.jsonc" }),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("cycle");
    expect(presetProblemText(r.error)).toMatch(
      /a\.jsonc → .*b\.jsonc → .*a\.jsonc/,
    );
  });

  it(`a chain longer than ${String(MAX_PRESET_DEPTH)} is refused, printing it`, () => {
    const files: Record<string, string> = {};
    for (let i = 1; i <= 5; i++)
      files[`/work/papers/p/p${String(i)}.jsonc`] = venue({
        extends: i < 5 ? `./p${String(i + 1)}.jsonc` : "paperlint:acm-sigconf",
      });
    const r = resolve("./p1.jsonc", files);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("too-deep");
    expect(presetProblemText(r.error)).toMatch(/p1\.jsonc → .*p4\.jsonc/);
  });

  it("a chain of exactly the limit resolves", () => {
    const r = resolve("./p1.jsonc", {
      "/work/papers/p/p1.jsonc": venue({ extends: "./p2.jsonc" }),
      "/work/papers/p/p2.jsonc": venue({
        extends: "paperlint:agenticdev-2026",
      }),
    });
    expect(r.ok && r.value.chain.length).toBe(MAX_PRESET_DEPTH);
  });
});

describe("chains that do not resolve: the files themselves", () => {
  it("a preset that fails the schema is named with its file", () => {
    const r = resolve("./bad.jsonc", {
      "/work/papers/p/bad.jsonc": family({
        extends: "paperlint:acm-sigconf",
        colums: 2,
      }),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("broken");
    expect(presetProblemText(r.error)).toMatch(/bad\.jsonc/);
  });

  it("a preset with no `extends` must carry `tex` (it is a root)", () => {
    const r = resolve("./root.jsonc", {
      "/work/papers/p/root.jsonc": family({ format: { columns: 1 } }),
    });
    expect(r.ok).toBe(false);
  });

  it("a family that extends a venue is refused, naming both files", () => {
    const r = resolve("./fam.jsonc", {
      "/work/papers/p/fam.jsonc": family({ extends: "paperlint:aisec-2026" }),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(presetProblemText(r.error)).toBe(
      `the preset /work/papers/p/fam.jsonc is a template family and extends ${join(VENUES, "aisec-2026.jsonc")}, a venue — a family builds only on a family; a venue extends a family or another venue`,
    );
  });

  it("nothing extends the TeX base set, even by a relative path", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: relative("/work/papers/p", join(VENUES, "tex-base.jsonc")),
      }),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(presetProblemText(r.error)).toBe(
      `the preset /work/papers/p/mine.jsonc extends ${join(VENUES, "tex-base.jsonc")}, the TeX base set — every paper gets that set already, and no preset extends it`,
    );
  });

  it("a venue may extend a venue, and the resolved identity is the leaf's", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({ extends: "paperlint:aisec-2026" }),
    });
    expect(r.ok && r.value.identity).toEqual({
      type: "venue",
      name: "Our Workshop",
      url: "https://example.org/cfp",
    });
  });
});

describe("a workshop's parent conference (`parent`)", () => {
  it("agenticdev is held at ase and aisec at ccs: the parent's names, not the workshop's aliases", () => {
    const names = (spec: string) => {
      const r = resolve(spec);
      return r.ok ? [r.value.aliases, r.value.parentNames] : r.error;
    };
    expect(names("paperlint:agenticdev-2026")).toEqual([
      ["AgenticDev"],
      ["ASE"],
    ]);
    expect(names("paperlint:aisec-2026")).toEqual([["AISec"], ["ACM CCS"]]);
    expect(names("paperlint:ccs-2026")).toEqual([["ACM CCS"], []]);
  });

  it("a parent's own parent counts too, and a child of the workshop inherits its parent", () => {
    const r = resolve("./w.jsonc", {
      "/work/papers/p/w.jsonc": venue({
        extends: "paperlint:acm-sigconf",
        workshop: true,
        parent: "./c.jsonc",
      }),
      "/work/papers/p/c.jsonc": venue(
        {
          extends: "paperlint:acm-sigconf",
          workshop: true,
          parent: "paperlint:ccs-2026",
        },
        "Our Conference",
      ),
    });
    expect(r.ok && r.value.parentNames).toEqual(["Our Conference", "ACM CCS"]);
    const mine = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:agenticdev-2026",
      }),
    });
    expect(mine.ok && mine.value.parentNames).toEqual(["ASE"]);
  });
});

/** A parent that cannot be used, the files around it, and the line that refuses it. */
const BAD_PARENTS: readonly [string, Record<string, string>, string][] = [
  [
    "a parent that names no preset",
    {
      "/work/papers/p/w.jsonc": venue({
        extends: "paperlint:acm-sigconf",
        workshop: true,
        parent: "paperlint:nope",
      }),
    },
    `the preset /work/papers/p/w.jsonc names a parent conference that does not resolve to a venue: "parent": "paperlint:nope" names no preset (${join(VENUES, "nope.jsonc")}); shipped presets (paperlint:<name>): ${shippedPresets(VENUES).join(", ")}`,
  ],
  [
    "a parent that is a template family",
    {
      "/work/papers/p/w.jsonc": venue({
        extends: "paperlint:acm-sigconf",
        workshop: true,
        parent: "paperlint:acm-sigconf",
      }),
    },
    `the preset /work/papers/p/w.jsonc names a parent conference that does not resolve to a venue: "parent": "paperlint:acm-sigconf" is a family, and a workshop's parent is the venue it is held at`,
  ],
  [
    "a parent whose own parent does not resolve: the file that names it",
    {
      "/work/papers/p/w.jsonc": venue({
        extends: "paperlint:acm-sigconf",
        workshop: true,
        parent: "./c.jsonc",
      }),
      "/work/papers/p/c.jsonc": venue({
        extends: "paperlint:acm-sigconf",
        workshop: true,
        parent: "./gone.jsonc",
      }),
    },
    `the preset /work/papers/p/c.jsonc names a parent conference that does not resolve to a venue: "parent": "./gone.jsonc" names no preset (/work/papers/p/gone.jsonc); shipped presets (paperlint:<name>): ${shippedPresets(VENUES).join(", ")}`,
  ],
  [
    "a parent whose own chain does not resolve",
    {
      "/work/papers/p/w.jsonc": venue({
        extends: "paperlint:acm-sigconf",
        workshop: true,
        parent: "./c.jsonc",
      }),
      "/work/papers/p/c.jsonc": venue({ extends: "./gone.jsonc" }),
    },
    `the preset /work/papers/p/w.jsonc names a parent conference that does not resolve to a venue: "parent": "./c.jsonc" does not resolve: "extends": "./gone.jsonc" names no preset (/work/papers/p/gone.jsonc); shipped presets (paperlint:<name>): ${shippedPresets(VENUES).join(", ")}`,
  ],
  [
    "parents that name each other",
    {
      "/work/papers/p/w.jsonc": venue({
        extends: "paperlint:acm-sigconf",
        workshop: true,
        parent: "./c.jsonc",
      }),
      "/work/papers/p/c.jsonc": venue({
        extends: "paperlint:acm-sigconf",
        workshop: true,
        parent: "./w.jsonc",
      }),
    },
    `the presets name each other as "parent" in a cycle: /work/papers/p/w.jsonc → /work/papers/p/c.jsonc → /work/papers/p/w.jsonc`,
  ],
];

describe("a workshop's parent conference (`parent`): what is refused", () => {
  it.each(BAD_PARENTS)("🔴 refused: %s", (_, files, text) => {
    const r = resolve("./w.jsonc", files);
    expect(r.ok ? "resolved" : presetProblemText(r.error)).toBe(text);
  });

  it("the schema refuses a parent on a template family", () => {
    const r = resolve("./fam.jsonc", {
      "/work/papers/p/fam.jsonc": family({
        extends: "paperlint:acm-sigconf",
        parent: "paperlint:ccs-2026",
      }),
    });
    expect(r.ok ? "resolved" : r.error.kind).toBe("broken");
  });
});

describe("a preset's template: kept as its file spells it, with that file", () => {
  it("a child's template replaces its parent's, and names its own file", () => {
    const r = resolve("./own.jsonc", {
      "/work/papers/p/own.jsonc": venue({
        extends: "paperlint:aidc-2026",
        template: "\\documentclass[conference]{IEEEtran}",
      }),
    });
    expect(r.ok && r.value.template).toEqual({
      text: "\\documentclass[conference]{IEEEtran}",
      file: "/work/papers/p/own.jsonc",
      forbids: [],
    });
  });

  it("the options a file forbids travel with its template", () => {
    const r = resolve("./own.jsonc", {
      "/work/papers/p/own.jsonc": venue({
        extends: "paperlint:ieee-conference",
        template: "\\documentclass[conference]{IEEEtran}",
        template_forbids: ["compsoc"],
      }),
    });
    expect(r.ok && r.value.template?.forbids).toEqual(["compsoc"]);
  });

  it("forbidden options without a template of the same file are refused by the schema", () => {
    const r = resolve("./own.jsonc", {
      "/work/papers/p/own.jsonc": venue({
        extends: "paperlint:aidc-2026",
        template_forbids: ["compsoc"],
      }),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(presetProblemText(r.error)).toMatch(/template_forbids/);
  });
});

describe("labelOf — display only, never used to resolve", () => {
  it.each([
    ["paperlint:agenticdev-2026", "agenticdev-2026"],
    ["./venues/usenix-sec.jsonc", "usenix-sec"],
    ["../shared/acl.json", "acl"],
    ["./.hidden", ".hidden"],
    ["paperlint:", ""],
  ])("%s → %s", (spec, label) => {
    expect(labelOf(spec)).toBe(label);
  });
});

describe("shippedVenueNames — what each shipped venue is called", () => {
  it("every shipped preset, by its label and the names along its chain", () => {
    const names = shippedVenueNames(deps());
    // A venue is labelled by its `name`, a family by its file name.
    expect(names.map((n) => n.label)).toEqual([
      "acl-latex",
      "acm-acmsmall",
      "acm-sigconf",
      "ACSAC",
      "AGENT",
      "AgenticDev",
      "AGENTVERIFY",
      "AIDC",
      "AISec",
      "ASE",
      "ACM CCS",
      "EMNLP",
      "FSE",
      "ICSE",
      "ICSE",
      "ieee-conference",
      "MSR",
      "NLBSE",
      "REALM",
      "IEEE S&P",
    ]);
    // AISec's parent conference is its `parent`, not an alias: ACM CCS is named by ccs alone.
    expect(names.find((n) => n.label === "AISec")?.aliases).toEqual(["AISec"]);
    // The year is the id's: two editions of one series share a name and differ by year.
    expect(
      names.filter((n) => n.label === "ICSE").map((n) => [n.id, n.year]),
    ).toEqual([
      ["icse-2027", 2027],
      ["icse-2028", 2028],
    ]);
  });

  it("a preset that does not resolve is left out", () => {
    const files = memoryFiles(
      Object.fromEntries(
        Object.entries(shipped).filter(
          ([f]) => !f.endsWith("realm-2026.jsonc"),
        ),
      ),
    );
    expect(
      shippedVenueNames({ files, venuesDir: VENUES }).map((n) => n.label),
    ).toEqual([
      "acl-latex",
      "acm-acmsmall",
      "acm-sigconf",
      "ACSAC",
      "AGENT",
      "AgenticDev",
      "AGENTVERIFY",
      "AIDC",
      "AISec",
      "ASE",
      "ACM CCS",
      "EMNLP",
      "FSE",
      "ICSE",
      "ICSE",
      "ieee-conference",
      "MSR",
      "NLBSE",
      "IEEE S&P",
    ]);
  });
});

describe("one preset per edition: a bare series is refused, naming the editions", () => {
  const editions =
    "Shipped editions: paperlint:icse-2027, paperlint:icse-2028 — did you mean paperlint:icse-2028?";

  it("🔴 in a paper's extends", () => {
    const r = resolve("paperlint:icse");
    expect(r.ok ? "resolved" : presetProblemText(r.error)).toBe(
      `"extends": "paperlint:icse" names a series, not an edition: a venue preset is one edition, so a new edition never changes a paper's rules unasked. ${editions}`,
    );
  });

  it("🔴 in a preset's own extends", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({ extends: "paperlint:icse" }),
    });
    expect(r.ok ? "resolved" : r.error.kind).toBe("bare-series");
  });

  it("🔴 in a workshop's parent", () => {
    const r = resolve("./w.jsonc", {
      "/work/papers/p/w.jsonc": venue({
        extends: "paperlint:ieee-conference",
        workshop: true,
        parent: "paperlint:icse",
      }),
    });
    expect(r.ok ? "resolved" : presetProblemText(r.error)).toBe(
      `the preset /work/papers/p/w.jsonc names a parent conference that does not resolve to a venue: "parent": "paperlint:icse" names a series, not an edition: a venue preset is one edition, so a new edition never changes a paper's rules unasked. ${editions}`,
    );
  });

  it("a series with one shipped edition is refused too; a name that is no series stays not-found", () => {
    const r = resolve("paperlint:fse");
    expect(r.ok ? "resolved" : presetProblemText(r.error)).toMatch(
      /Shipped editions: paperlint:fse-2027 — did you mean paperlint:fse-2027\?$/,
    );
    const typo = resolve("paperlint:icsee");
    expect(typo.ok ? "resolved" : typo.error.kind).toBe("not-found");
  });

  it("the edition resolves, with the year of its id", () => {
    const r = resolve("paperlint:icse-2028");
    expect(r.ok && [r.value.label, r.value.year]).toEqual(["ICSE", 2028]);
  });
});

describe("a workshop's parent is the edition of its own year", () => {
  it("🔴 a parent of another year is refused, naming both years", () => {
    const r = resolve("./wks-2028.jsonc", {
      "/work/papers/p/wks-2028.jsonc": venue({
        extends: "paperlint:ieee-conference",
        workshop: true,
        parent: "paperlint:icse-2027",
      }),
    });
    expect(r.ok ? "resolved" : presetProblemText(r.error)).toBe(
      `the preset /work/papers/p/wks-2028.jsonc names a parent conference that does not resolve to a venue: "parent": "paperlint:icse-2027" is the 2027 edition, and this workshop is of 2028 — a workshop's parent is the edition it is held at, of the same year`,
    );
  });

  it("the same year resolves", () => {
    const r = resolve("./wks-2027.jsonc", {
      "/work/papers/p/wks-2027.jsonc": venue({
        extends: "paperlint:ieee-conference",
        workshop: true,
        parent: "paperlint:icse-2027",
      }),
    });
    expect(r.ok && r.value.parentNames).toEqual(["ICSE"]);
  });

  it("every shipped workshop names a parent of its own year, and resolves", () => {
    const workshops = PARSED.filter((p) => p.preset.parent !== null);
    expect(workshops.map((w) => [w.name, w.preset.parent])).toEqual([
      ["agent-2027", "paperlint:icse-2027"],
      ["agenticdev-2026", "paperlint:ase-2026"],
      ["agentverify-2027", "paperlint:icse-2027"],
      ["aidc-2026", "paperlint:acsac-2026"],
      ["aisec-2026", "paperlint:ccs-2026"],
      ["nlbse-2027", "paperlint:icse-2027"],
      ["realm-2026", "paperlint:emnlp-2026"],
    ]);
    expect(workshops.filter((w) => !resolve(shippedSpec(w.name)).ok)).toEqual(
      [],
    );
  });
});

describe("a workshop cannot silently lack its parent (the schema)", () => {
  it.each([
    ["🔴 a workshop without a parent", { workshop: true }],
    [
      "🔴 a parent without the workshop marker",
      { parent: "paperlint:icse-2027" },
    ],
    [
      "🔴 a workshop marker that is not true",
      { workshop: false, parent: "paperlint:icse-2027" },
    ],
  ])("%s is refused", (_, body) => {
    const r = resolve("./w.jsonc", {
      "/work/papers/p/w.jsonc": venue({
        extends: "paperlint:ieee-conference",
        ...body,
      }),
    });
    expect(r.ok ? "resolved" : r.error.kind).toBe("broken");
  });

  it("🔴 a family cannot be a workshop", () => {
    const r = resolve("./fam.jsonc", {
      "/work/papers/p/fam.jsonc": family({
        extends: "paperlint:acm-sigconf",
        workshop: true,
      }),
    });
    expect(r.ok ? "resolved" : r.error.kind).toBe("broken");
  });

  it.each([
    ["🔴 a year in the name", { name: "ICSE 2028" }],
    ["🔴 a year in an alias", { aliases: ["AGENT'27"] }],
  ])("%s is refused: the year is the id's", (_, body) => {
    const r = resolve("./v.jsonc", {
      "/work/papers/p/v.jsonc": venue({
        extends: "paperlint:acm-sigconf",
        ...body,
      }),
    });
    expect(r.ok ? "resolved" : r.error.kind).toBe("broken");
  });
});

describe("the id and the year: a venue is <series>-<year>, a family ends in no year", () => {
  it.each([
    [
      "icse",
      "venue",
      "icse: a venue preset is one edition, and its id is <series>-<year> (icse-2028)",
    ],
    [
      "icse-28",
      "venue",
      "icse-28: a venue preset is one edition, and its id is <series>-<year> (icse-2028)",
    ],
    [
      "ICSE-2028",
      "venue",
      "ICSE-2028: a venue preset is one edition, and its id is <series>-<year> (icse-2028)",
    ],
    [
      "acm-2027",
      "family",
      "acm-2027: a template family is a format, not an edition, and its id ends in no year",
    ],
  ] as const)("🔴 planted: %s as a %s", (id, type, text) => {
    expect(idProblem(id, type)).toBe(text);
  });

  it.each([
    ["usenix-sec-2027", "venue"],
    ["acm-sigconf", "family"],
    ["tex-base", "base"],
  ] as const)("%s as a %s fits", (id, type) => {
    expect(idProblem(id, type)).toBeNull();
  });

  it("every shipped preset fits", () => {
    expect(
      PARSED.flatMap((p) => idProblem(p.name, p.preset.identity.type) ?? []),
    ).toEqual([]);
  });
});

describe("an edition's deadlines fall within [year − 2, year + 1]", () => {
  it("🔴 planted: a reading of another edition", () => {
    expect(
      deadlineYearProblems("icse-2028", 2028, [
        { what: "submission", at: "2025-07-02T11:59:59Z" },
        { what: "camera-ready", at: "2030-01-01T11:59:59Z" },
        { what: "notification", at: "2027-10-22T11:59:59Z" },
      ]),
    ).toEqual([
      "icse-2028: the submission deadline 2025-07-02T11:59:59Z is outside 2026–2029, the years an edition of 2028 falls in",
      "icse-2028: the camera-ready deadline 2030-01-01T11:59:59Z is outside 2026–2029, the years an edition of 2028 falls in",
    ]);
  });

  it("every shipped edition's deadlines fit", () => {
    const editions = PARSED.flatMap((p) => {
      const e = editionOf(p.name);
      return e === null ? [] : [{ ...p, year: e.year }];
    });
    expect(editions.length).toBeGreaterThan(10);
    expect(
      editions.flatMap((p) =>
        deadlineYearProblems(p.name, p.year, p.preset.deadlines ?? []),
      ),
    ).toEqual([]);
  });
});
