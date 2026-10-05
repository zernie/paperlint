/**
 * The venue rules (`pdf/fresh` · `pdf/profile` · `pdf/fonts` · `pdf/geometry` · `pdf/body-size` ·
 * `pdf/measured` · `format/page-limit` · `anonymity/identity`) over a paper held in memory: `paper.tex`, `paperlint.json`,
 * `_build/paper.facts.json` and the PDF the facts describe. The venue profiles are the SHIPPED
 * ones, read from the package's venues directory, so a profile edit that breaks a check shows here.
 *
 * Every case has both halves in one table: the finding a planted defect must produce, and — in the
 * first rows — the silence a conforming paper must produce.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { sha256Hex } from "./domain/sha256.ts";
import { presetsDir } from "./package-dirs.ts";
import {
  ANONYMITY_RULE_LEVELS,
  anonymityRules,
  judgeBodyEnd,
  PAGE_LIMIT_RULE_LEVELS,
  pageLimitRules,
  VENUE_RULE_LEVELS,
  venueRules,
  type Resolved,
} from "./venue-rules.ts";
import { NO_FORMAT } from "./tex-requirements.ts";
import { buildConfig, OPTIONAL_RULES, SHIPPED_RULES } from "./cli.ts";
import { present } from "../test/support.ts";

const VENUES = presetsDir();
const PAPER = "/work/papers/p";
const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.5 a stand-in for the built PDF",
);

/** Every shipped profile and the schema, at their real paths, so the rules read them through Files. */
const shipped = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f))]),
);

type Json = Record<string, unknown>;
interface Font {
  name: string;
  type: string;
  embedded: boolean;
  program: string;
}
/** The facts file as these tests edit it: free-form, except the fonts they reach into. */
type Facts = Json & { fonts: Font[] };
type Patch = (f: Facts) => void;

/** The facts of a short agenticdev paper that meets every number in its profile. */
function goodFacts(): Facts {
  return {
    schema: 3,
    pages_text: [],
    metadata: {},
    links: [],
    bib_anchor_page: null,
    appendix_anchor_page: null,
    pdf: "paper.pdf",
    pdf_sha256: sha256Hex(PDF_BYTES),
    venue: "agenticdev",
    kind: "short",
    npages: 7,
    fonts_source: "pdfjs-drawn",
    fonts: [
      {
        name: "LinLibertineT",
        type: "Type 1",
        embedded: true,
        program: "Type1",
      },
      {
        name: "LinBiolinumTB",
        type: "Type 1",
        embedded: true,
        program: "Type1",
      },
    ],
    last_page: { kind: "stub", words: 12 },
    last_page_cols_pt: null,
    geometry_source: "banal",
    page_w_in: 8.5,
    page_h_in: 11,
    columns: 2,
    body_pt: 9.3,
    ref_pt: 7.3,
    body_pages: 5,
    ref_pages: 2,
    appendix_pages: 0,
    pages_by_type: { body: 5, bib: 2 },
  };
}

const TEX =
  "% a comment\n\\documentclass[sigconf]{acmart}\n\\begin{document}x\\end{document}\n";

interface Paper {
  readonly venue?: unknown; // the paperlint.json object, or a raw string, or absent
  readonly facts?: Json | string | null; // null: no facts file
  readonly pdf?: Uint8Array | null; // null: no PDF on disk
  readonly extra?: Readonly<Record<string, string>>;
}

interface Finding {
  readonly rule: string;
  readonly messageId: string;
  readonly message: string;
  readonly line: number;
}

const text = (v: unknown): string =>
  typeof v === "string" ? v : JSON.stringify(v);

/** The paper's files, as `Paper` describes them; an absent entry is an absent file. */
function paperFiles(p: Paper): Record<string, string | Uint8Array> {
  const out: Record<string, string | Uint8Array> = {
    ...shipped,
    [`${PAPER}/paper.tex`]: TEX,
    ...p.extra,
  };
  if (p.venue !== undefined) out[`${PAPER}/paperlint.json`] = text(p.venue);
  if (p.facts !== null)
    out[`${PAPER}/_build/paper.facts.json`] = text(p.facts ?? goodFacts());
  if (p.pdf !== null) out[`${PAPER}/paper.pdf`] = p.pdf ?? PDF_BYTES;
  return out;
}

/** Run every venue rule over one paper, the way ESLint would: `create` on paper.tex, then `root`. */
function lint(
  p: Paper,
  filename = `${PAPER}/paper.tex`,
  options: Json = {},
  cwd?: string,
): Finding[] {
  const files = memoryFiles(paperFiles(p));
  const deps = { files, venuesDir: VENUES };
  const rules = [
    ...Object.entries(venueRules(deps)).map(
      ([n, r]) => [`pdf/${n}`, r] as const,
    ),
    ...Object.entries(pageLimitRules(deps)).map(
      ([n, r]) => [`format/${n}`, r] as const,
    ),
    ...Object.entries(anonymityRules(deps)).map(
      ([n, r]) => [`anonymity/${n}`, r] as const,
    ),
  ];
  const out: Finding[] = [];
  for (const [id, rule] of rules) {
    const visitor = rule.create({
      filename,
      ...(cwd === undefined ? {} : { cwd }),
      sourceCode: { text: TEX },
      options:
        id === "pdf/geometry" && Object.keys(options).length ? [options] : [],
      report: (d) =>
        out.push({
          rule: id,
          messageId: d.messageId,
          message: Object.entries(d.data ?? {}).reduce(
            (m, [k, v]) => m.replaceAll(`{{${k}}}`, String(v)),
            rule.meta.messages[d.messageId] ?? `(no message ${d.messageId})`,
          ),
          line: d.loc.start.line,
        }),
    });
    visitor.root?.();
  }
  return out;
}

const DECL = { extends: "paperlint:agenticdev", kind: "short" };
const ids = (fs: readonly Finding[]) =>
  fs.map((f) => `${f.rule}:${f.messageId}`).sort();
/** A patch that changes one field set of the `i`-th font. */
const font =
  (i: number, change: Partial<Font>): Patch =>
  (f) => {
    f.fonts = f.fonts.map((x, j) => (j === i ? { ...x, ...change } : x));
  };
const withFacts = (patch: Patch): Facts => {
  const f = goodFacts();
  patch(f);
  return f;
};

describe("a paper that meets its venue", () => {
  it("is silent — every rule, on the shipped agenticdev profile", () => {
    expect(lint({ venue: DECL })).toEqual([]);
  });

  it("is silent on aisec, a second shipped ACM profile", () => {
    expect(
      lint({ venue: { extends: "paperlint:aisec", kind: "research" } }),
    ).toEqual([]);
  });

  it("takes the venue from paperlint.json, not from the facts: facts measured with no venue still judge", () => {
    expect(
      lint({
        venue: DECL,
        facts: withFacts((f) => ((f.venue = null), (f.kind = null))),
      }),
    ).toEqual([]);
  });
});

describe("a paper that names no venue", () => {
  it("no paperlint.json: every rule is silent, even with no facts and no PDF", () => {
    expect(lint({ venue: undefined, facts: null, pdf: null })).toEqual([]);
  });

  it.each([
    ["no extends", { kind: "short" }],
    ["extends: null — what `paperlint new` writes", { extends: null }],
  ])(
    "a paperlint.json with %s: ONE warning from pdf/measured, whatever else is missing",
    (_, venue) => {
      const fs = lint({ venue, facts: null, pdf: null });
      expect(ids(fs)).toEqual(["pdf/measured:noPreset"]);
      expect(fs[0]?.message).toMatch(/set "extends" in .*paperlint\.json/);
    },
  );

  it("acts on paper.tex only — any other file gets nothing", () => {
    expect(
      lint({ venue: DECL, facts: null }, `${PAPER}/PIPELINE-STATUS.md`),
    ).toEqual([]);
  });
});

describe("pdf/profile — the declaration must resolve, or nothing is judged", () => {
  it.each([
    [
      "an unknown venue (a typo would silently disable every check)",
      { extends: "paperlint:agentic-dev", kind: "short" },
      "preset",
      /agenticdev, aidc, aisec, ieee-conference, msr, realm/,
    ],
    [
      "the base TeX set is not a venue",
      { extends: "paperlint:tex-base" },
      "preset",
      /agenticdev, aidc, aisec, ieee-conference, msr, realm/,
    ],
    [
      "paperlint.json that is not JSON",
      "{ extends: agenticdev",
      "settingsBroken",
      /paperlint\.json/,
    ],
    [
      "paperlint.json with a misspelt key",
      { venu: "agenticdev" },
      "settingsBroken",
      /unknown key "venu"/,
    ],
  ])("%s", (_, venue, messageId, text) => {
    const fs = lint({ venue, facts: null, pdf: null });
    expect(ids(fs)).toEqual([`pdf/profile:${messageId}`]);
    expect(fs[0]?.message).toMatch(text);
  });

  it("a profile that does not parse is named with the file", () => {
    const fs = lint({
      venue: { extends: "paperlint:mine", kind: "short" },
      extra: {
        [join(VENUES, "mine.jsonc")]:
          '{ "tex": { "packages": {} }, "columns": "two" }',
      },
    });
    expect(ids(fs)).toEqual(["pdf/profile:preset"]);
    expect(fs[0]?.message).toMatch(/mine\.jsonc/);
  });
});

describe("pdf/profile — the kind", () => {
  it.each([
    ["no kind", { extends: "paperlint:agenticdev" }, "kindMissing"],
    [
      "a kind the venue does not have",
      { extends: "paperlint:agenticdev", kind: "long" },
      "kindUnknown",
    ],
  ])(
    "%s: the page limit is not checked — and the rest still is",
    (_, venue, messageId) => {
      const fs = lint({ venue, facts: withFacts((f) => (f.body_pages = 99)) });
      expect(ids(fs)).toEqual([`pdf/profile:${messageId}`]);
      expect(fs[0]?.message).toMatch(/short, full, demo/);
      // the fonts rule still runs with an unresolved kind
      const fonts = lint({
        venue,
        facts: withFacts(font(0, { embedded: false })),
      });
      expect(ids(fonts)).toEqual([
        `pdf/fonts:notEmbedded`,
        `pdf/profile:${messageId}`,
      ]);
    },
  );

  it("a kind with no limits in the profile (realm's `long`) is not a finding", () => {
    const realm = withFacts((f) => {
      f.page_w_in = 8.27;
      f.page_h_in = 11.69;
      f.body_pt = 11;
      f.ref_pt = 10;
      f.body_pages = 30;
      f.fonts = [
        {
          name: "NimbusRomNo9L-Regu",
          type: "Type 1",
          embedded: true,
          program: "Type1",
        },
      ];
    });
    expect(
      lint({
        venue: { extends: "paperlint:realm", kind: "long" },
        facts: realm,
      }),
    ).toEqual([]);
  });
});

describe("pdf/profile — a preset with no kinds", () => {
  it("🔴 a preset with NO kinds (acm-sigconf) and no `kind`: nothing to pick, no finding", () => {
    const fs = lint({
      venue: { extends: "paperlint:acm-sigconf" },
      facts: withFacts((f) => (f.body_pages = 99)),
    });
    expect(ids(fs).filter((id) => id.startsWith("pdf/profile"))).toEqual([]);
  });

  it("…but a `kind` named against a kindless preset is still an error that says it has none", () => {
    const fs = lint({
      venue: { extends: "paperlint:acm-sigconf", kind: "short" },
    });
    const profile = fs.filter((f) => f.rule === "pdf/profile");
    expect(ids(profile)).toEqual(["pdf/profile:kindUnknown"]);
    expect(profile[0]?.message).toMatch(/its kinds: \(none\)/);
  });
});

describe("pdf/measured — a paper that names a venue and was not measured says so (warn)", () => {
  it("no facts file: one finding, from pdf/measured only", () => {
    const fs = lint({ venue: DECL, facts: null, pdf: null });
    expect(ids(fs)).toEqual(["pdf/measured:unbuilt"]);
    expect(fs[0]?.message).toMatch(/paperlint build/);
    // Guards: the message stays one short line — it is the first thing a new user sees.
    expect(fs[0]?.message).toMatch(/^not built yet, so /);
    expect(fs[0]?.message.length).toBeLessThan(110);
  });

  it("facts without geometry (no banal): pdf/measured names it, the three geometry rules are silent, fonts still judge", () => {
    const g = withFacts((f) => {
      f.geometry_source = null;
      for (const k of [
        "page_w_in",
        "page_h_in",
        "columns",
        "body_pt",
        "ref_pt",
        "body_pages",
        "ref_pages",
        "appendix_pages",
        "pages_by_type",
      ])
        f[k] = null;
      font(0, { program: "Type3" })(f);
    });
    expect(ids(lint({ venue: DECL, facts: g }))).toEqual([
      "pdf/fonts:type3",
      "pdf/measured:noGeometry",
    ]);
  });
});

describe("pdf/fresh — facts about another build are not judged", () => {
  it.each<[string, Paper, string]>([
    [
      "a changed PDF",
      { pdf: new TextEncoder().encode("another build") },
      "stale",
    ],
    ["a PDF that is gone", { pdf: null }, "pdfMissing"],
    ["a foreign schema", { facts: withFacts((f) => (f.schema = 1)) }, "schema"],
    ["facts that are not JSON", { facts: "{" }, "factsBroken"],
    [
      "facts missing pdf_sha256",
      { facts: withFacts((f) => delete f.pdf_sha256) },
      "factsBroken",
    ],
    [
      "a font entry of the wrong shape",
      { facts: { ...goodFacts(), fonts: [{ name: 3 }] } },
      "factsBroken",
    ],
  ])("%s: one finding, from pdf/fresh only", (_, p, messageId) => {
    // Everything else planted wrong too — none of it may be reported over stale facts.
    const facts =
      p.facts ?? withFacts((f) => ((f.body_pages = 99), (f.columns = 1)));
    expect(ids(lint({ venue: DECL, ...p, facts }))).toEqual([
      `pdf/fresh:${messageId}`,
    ]);
  });
});

describe("pdf/fonts", () => {
  it.each<[string, (f: Facts) => void, string[]]>([
    ["a Type 3 font", font(0, { program: "Type3" }), ["pdf/fonts:type3"]],
    [
      "a font not embedded",
      font(1, { embedded: false }),
      ["pdf/fonts:notEmbedded"],
    ],
    [
      "the text family missing — acmart fell back to Computer Modern",
      font(0, { name: "CMR10" }),
      ["pdf/fonts:noFamily"],
    ],
    [
      "both families missing: one finding per family",
      (f: Facts) =>
        (f.fonts = [
          { name: "CMR10", type: "Type 1", embedded: true, program: "Type1" },
        ]),
      ["pdf/fonts:noFamily", "pdf/fonts:noFamily"],
    ],
  ])("%s", (_, patch, want) => {
    expect(ids(lint({ venue: DECL, facts: withFacts(patch) }))).toEqual(want);
  });

  it("names the family and the fonts the PDF does have", () => {
    const [f] = lint({
      venue: DECL,
      facts: withFacts(font(0, { name: "CMR10" })),
    });
    expect(f?.message).toMatch(/LinLibertine/);
    expect(f?.message).toMatch(/CMR10/);
  });
});

describe("pdf/geometry", () => {
  it.each<[string, (f: Facts) => void, string[]]>([
    [
      "A4 instead of letter",
      (f: Facts) => ((f.page_w_in = 8.27), (f.page_h_in = 11.69)),
      ["pdf/geometry:dim", "pdf/geometry:dim"],
    ],
    [
      "one column instead of two",
      (f: Facts) => (f.columns = 1),
      ["pdf/geometry:columns"],
    ],
    [
      "a page size banal could not read",
      (f: Facts) => (f.page_w_in = null),
      ["pdf/geometry:dimMissing"],
    ],
    [
      "0.03 in off is inside the default tolerance",
      (f: Facts) => (f.page_w_in = 8.53),
      [],
    ],
  ])("%s", (_, patch, want) => {
    expect(ids(lint({ venue: DECL, facts: withFacts(patch) }))).toEqual(want);
  });

  it("dimTol widens the tolerance", () => {
    const facts = withFacts((f) => (f.page_w_in = 8.6));
    expect(ids(lint({ venue: DECL, facts }))).toEqual(["pdf/geometry:dim"]);
    expect(
      lint({ venue: DECL, facts }, `${PAPER}/paper.tex`, { dimTol: 0.2 }),
    ).toEqual([]);
  });
});

describe("format/page-limit", () => {
  it.each<[string, (f: Facts) => void, string[], RegExp | null]>([
    [
      "one body page over the short-paper limit",
      (f: Facts) => (f.body_pages = 6),
      ["format/page-limit:pages"],
      /body pages: 6, over the limit 5 for AgenticDev\/short/,
    ],
    [
      "one reference page over",
      (f: Facts) => (f.ref_pages = 3),
      ["format/page-limit:pages"],
      /reference pages: 3, over the limit 2/,
    ],
    ["exactly at the limit", (f: Facts) => (f.body_pages = 5), [], null],
  ])("%s", (_, patch, want, text) => {
    const fs = lint({ venue: DECL, facts: withFacts(patch) });
    expect(ids(fs)).toEqual(want);
    if (text) expect(fs[0]?.message).toMatch(text);
  });

  it("a longer kind of the same venue passes the same page count", () => {
    const facts = withFacts((f) => (f.body_pages = 9));
    expect(ids(lint({ venue: DECL, facts }))).toEqual([
      "format/page-limit:pages",
    ]);
    expect(
      lint({ venue: { extends: "paperlint:agenticdev", kind: "full" }, facts }),
    ).toEqual([]);
  });
});

describe("pdf/body-size", () => {
  it.each<[string, (f: Facts) => void, string[]]>([
    [
      "10.2 pt against 9 ± 0.5",
      (f: Facts) => (f.body_pt = 10.2),
      ["pdf/body-size:body"],
    ],
    ["9.4 pt is inside the tolerance", (f: Facts) => (f.body_pt = 9.4), []],
    [
      "no body size measured",
      (f: Facts) => (f.body_pt = null),
      ["pdf/body-size:bodyMissing"],
    ],
    [
      "a reference font below the range",
      (f: Facts) => (f.ref_pt = 6),
      ["pdf/body-size:refPt"],
    ],
    [
      "6.8 pt is inside the reference range once the measuring drift (body_pt_tol) is allowed",
      (f: Facts) => (f.ref_pt = 6.8),
      [],
    ],
    [
      "no reference font measured (no bibliography) is not a finding",
      (f: Facts) => (f.ref_pt = null),
      [],
    ],
  ])("%s", (_, patch, want) => {
    expect(ids(lint({ venue: DECL, facts: withFacts(patch) }))).toEqual(want);
  });
});

describe("where a finding points", () => {
  it("at the \\documentclass line, where the class and its options live", () => {
    const [f] = lint({ venue: DECL, facts: withFacts((x) => (x.columns = 1)) });
    expect(f?.line).toBe(2);
  });
});

describe("paperlint's own config turns the venue rules on for every paper.tex", () => {
  const texRules = present(
    buildConfig({}, { sentinel: "tex language" }).find((b) =>
      (b.files ?? []).includes("**/paper.tex"),
    )?.rules,
    "the paper.tex block's rules",
  );

  it.each(
    Object.entries({
      ...VENUE_RULE_LEVELS,
      ...PAGE_LIMIT_RULE_LEVELS,
      ...ANONYMITY_RULE_LEVELS,
    }),
  )("%s is on at %s", (id, level) => {
    expect(texRules[id]).toBe(level);
    expect(SHIPPED_RULES.has(id)).toBe(true);
    expect(OPTIONAL_RULES.has(id)).toBe(false);
  });

  it("the venue rules are errors except measured, which is a warning", () => {
    expect(VENUE_RULE_LEVELS).toEqual({
      "pdf/fresh": "error",
      "pdf/profile": "error",
      "pdf/fonts": "error",
      "pdf/geometry": "error",
      "pdf/body-size": "error",
      "pdf/measured": "warn",
    });
    expect(PAGE_LIMIT_RULE_LEVELS).toEqual({ "format/page-limit": "error" });
    expect(ANONYMITY_RULE_LEVELS).toEqual({ "anonymity/identity": "error" });
  });

  it("the rule the page limit was checked by before is not shipped", () => {
    expect(SHIPPED_RULES.has("pdf/limits")).toBe(false);
  });

  it("pdf/last-page-balance stays optional", () => {
    expect(OPTIONAL_RULES.has("pdf/last-page-balance")).toBe(true);
  });
});

/**
 * The facts of the 13-page `[conference,compsoc]` IEEEtran paper measured for ieee-conference.jsonc
 * (2026-09-27): banal's page, columns and sizes, pdf.js's fonts.
 */
/** Embedded Type 1 fonts of these names. */
const type1 = (names: readonly string[]): Font[] =>
  names.map((name) => ({
    name,
    type: "Type 1",
    embedded: true,
    program: "Type1",
  }));

/** `n` pages of body text, one per page, as `pages_text` holds them. */
const bodyPages = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `Body page ${String(i + 1)}\n`);

const ieeeFacts = (patch: Patch = () => {}): Facts =>
  withFacts((f) => {
    f.page_w_in = 8.5;
    f.page_h_in = 11;
    f.columns = 2;
    f.body_pt = 10.3;
    f.ref_pt = 8.3;
    f.body_pages = 12;
    f.ref_pages = 1;
    // Twelve pages of body, the references heading on the thirteenth.
    f.pages_text = [
      ...bodyPages(12),
      "R EFERENCES\n[1] D. E. Knuth, Literate Programming.\nLLM Usage Statement\n",
    ];
    f.fonts = type1([
      "NimbusRomNo9L-Medi",
      "NimbusRomNo9L-Regu",
      "NimbusRomNo9L-ReguItal",
      "NimbusRomNo9L-MediItal",
    ]);
    patch(f);
  });

describe("the IEEE conference family and AIDC", () => {
  const FAMILY = { extends: "paperlint:ieee-conference" };
  const IDENTITY = ["Ada Example", "adaexample", "ada@example.org"];
  const AIDC = {
    extends: "paperlint:aidc",
    kind: "regular",
    identity: IDENTITY,
  };

  it.each([
    ["the family", FAMILY],
    ["aidc/regular", AIDC],
  ])("the measured IEEEtran build passes %s", (_, venue) => {
    expect(lint({ venue, facts: ieeeFacts() })).toEqual([]);
  });

  it("aidc/short: six body pages pass, seven fail", () => {
    const short = { ...AIDC, kind: "short" };
    const pages = (n: number) =>
      ieeeFacts((f) => {
        f.pages_text = [...bodyPages(n), "References\n"];
      });
    expect(lint({ venue: short, facts: pages(6) })).toEqual([]);
    const fs = lint({ venue: short, facts: pages(7) });
    expect(ids(fs)).toEqual(["format/page-limit:pages"]);
    expect(fs[0]?.message).toBe(
      "body pages (up to the references on page 8): 7, over the limit 6 for AIDC/short — a desk reject; cut the text",
    );
  });

  it.each([
    ["the family", FAMILY],
    ["aidc", AIDC],
  ])("the planted A4 build fails %s on both page dimensions", (_, venue) => {
    const facts = ieeeFacts(
      (f) => ((f.page_w_in = 8.264), (f.page_h_in = 11.694)),
    );
    expect(ids(lint({ venue, facts }))).toEqual([
      "pdf/geometry:dim",
      "pdf/geometry:dim",
    ]);
  });

  it.each([
    ["the family", FAMILY],
    ["aidc", AIDC],
  ])("the planted Computer Modern build fails %s: no Times", (_, venue) => {
    const facts = ieeeFacts(
      (f) => (f.fonts = type1(["CMBX12", "CMR10", "CMTI10"])),
    );
    const fs = lint({ venue, facts });
    expect(ids(fs)).toEqual(["pdf/fonts:noFamily"]);
    expect(fs[0]?.message).toMatch(/NimbusRomNo9L/);
  });
});

describe("pdf/body-size on the IEEE family: 10 pt body, 8 pt references", () => {
  it("a body size off the family's 10 pt fails pdf/body-size", () => {
    expect(
      ids(
        lint({
          venue: {
            extends: "paperlint:aidc",
            kind: "regular",
            identity: ["Ada Example"],
          },
          facts: ieeeFacts((f) => (f.body_pt = 9.3)),
        }),
      ),
    ).toEqual(["pdf/body-size:body"]);
  });

  it.each([
    ["\\scriptsize, 7 pt", 7.3],
    ["\\small, 9 pt", 9.3],
  ])(
    "a bibliography in %s instead of the class's 8 pt fails pdf/body-size",
    (_, got) => {
      const fs = lint({
        venue: { extends: "paperlint:ieee-conference" },
        facts: ieeeFacts((f) => (f.ref_pt = got)),
      });
      expect(fs.map((f) => f.message)).toEqual([
        `the reference font size is ${String(got)} pt, outside 8 pt for ieee-conference (allowing ±0.5 pt for the measuring drift) — fix the bibliography's font size`,
      ]);
    },
  );
});

/** An AIDC regular paper (12 body pages), for the page-limit tests. */
const AIDC_REGULAR = {
  extends: "paperlint:aidc",
  kind: "regular",
  identity: ["Ada Example"],
};

describe("format/page-limit on AIDC: the body is counted up to the references", () => {
  const AIDC = AIDC_REGULAR;

  it("🔴 AIDC's body is counted before the references, not by banal: banal's 13 — the statement and an appendix after the references counted as body — is not a finding", () => {
    expect(
      lint({
        venue: AIDC,
        facts: ieeeFacts((f) => ((f.body_pages = 13), (f.ref_pages = 0))),
      }),
    ).toEqual([]);
  });

  it("…while a thirteenth page of body before the references is", () => {
    const fs = lint({
      venue: AIDC,
      facts: ieeeFacts((f) => {
        f.pages_text = [...bodyPages(13), "7 References\n"];
      }),
    });
    expect(ids(fs)).toEqual(["format/page-limit:pages"]);
  });

  it("🔴 a body that runs onto the thirteenth page, the references below it there: 13 pages, a finding", () => {
    const fs = lint({
      venue: AIDC,
      facts: ieeeFacts((f) => {
        f.pages_text = [
          ...bodyPages(12),
          "the last lines of the conclusion\nR EFERENCES\n[1] D. E. Knuth.\n",
        ];
      }),
    });
    expect(ids(fs)).toEqual(["format/page-limit:pages"]);
    expect(fs[0]?.message).toMatch(
      /^body pages \(up to the references on page 13\): 13, over the limit 12/,
    );
  });

  it("no references heading on any page: said, not passed", () => {
    const fs = lint({
      venue: AIDC,
      facts: ieeeFacts((f) => (f.pages_text = ["Body\n", "Body\n"])),
    });
    expect(ids(fs)).toEqual(["format/page-limit:noReferences"]);
    expect(fs[0]?.message).toMatch(/NOT counted/);
  });

  it("the references count needs no banal: facts without geometry are still judged", () => {
    const fs = lint({
      venue: AIDC,
      facts: ieeeFacts((f) => {
        f.geometry_source = null;
        f.pages_text = [...bodyPages(13), "References\n"];
      }),
    });
    expect(ids(fs)).toEqual([
      "format/page-limit:pages",
      "pdf/measured:noGeometry",
    ]);
  });
});

describe("format/page-limit on AIDC: an appendix ends the body too", () => {
  const AIDC = AIDC_REGULAR;

  it("🔴 an appendix before the references is not body: the body ends where hyperref anchors the appendix", () => {
    const facts = ieeeFacts((f) => {
      f.pages_text = [
        ...bodyPages(12),
        "Appendix A.\nDetailed results\n",
        "References\n[1] A.\n",
      ];
      f.bib_anchor_page = 14;
      f.appendix_anchor_page = 13;
    });
    expect(ids(lint({ venue: AIDC, facts }))).toEqual([]);
    // Without hyperref's anchor for it, the appendix is body — the count this rule had before.
    facts.appendix_anchor_page = null;
    expect(lint({ venue: AIDC, facts })[0]?.message).toMatch(
      /^body pages \(up to the references on page 14\): 13, over the limit 12/,
    );
  });
});

describe("format/page-limit on AIDC: the two signals of where the references start disagree", () => {
  const AIDC = AIDC_REGULAR;

  it("hyperref's first entry on a page with no «References» line: unclear, said, not passed", () => {
    const fs = lint({
      venue: AIDC,
      facts: ieeeFacts((f) => {
        f.pages_text = [...bodyPages(12), "References\n[1] A.\n", "[2] B.\n"];
        f.bib_anchor_page = 14;
      }),
    });
    expect(ids(fs)).toEqual(["format/page-limit:unclear"]);
    expect(fs[0]?.message).toBe(
      "could not tell where the body ends, so it was NOT counted against AIDC's limit: the first bibliography entry is on page 14 (hyperref's destination), and no line on page 14 reads «References». Check the headings of the bibliography and the appendix, and that nothing before them reads «References» above a [1]",
    );
  });

  it("hyperref anchors the appendix on a page with no line reading «Appendix»: unclear", () => {
    const fs = lint({
      venue: AIDC,
      facts: ieeeFacts((f) => {
        f.appendix_anchor_page = 5;
      }),
    });
    expect(fs[0]?.message).toMatch(
      /: hyperref anchors the appendix on page 5, and no line on page 5 reads «Appendix»\./,
    );
  });

  it("a confirmed heading on another page than hyperref's first entry: unclear, naming both", () => {
    const fs = lint({
      venue: AIDC,
      facts: ieeeFacts((f) => {
        f.pages_text = [
          "References\n[1] quoted in the body\n",
          ...bodyPages(11),
          "References\n[1] A.\n",
        ];
        f.bib_anchor_page = 13;
      }),
    });
    expect(fs[0]?.message).toMatch(
      /and the «References» heading followed by \[1\] is on page 1\./,
    );
  });
});

/**
 * A project's own venue that counts its appendices in the body (`appendix_in_body`): a body of ten
 * pages, appendices included, and two pages holding only references — MSR's rule.
 */
const OWN_APPENDIX_IN_BODY = {
  [`${PAPER}/own.jsonc`]: JSON.stringify({
    type: "venue",
    name: "Own",
    url: "https://example.org/cfp",
    extends: "paperlint:ieee-conference",
    format: {
      body_ends_at: "references",
      appendix_in_body: true,
      kinds: {
        technical: { body_pages_max: 10, ref_pages_max: 2 },
        open: {},
        refs: { ref_pages_max: 2 },
      },
    },
  }),
};

/** `own.jsonc` papers of the kind named, over IEEE facts with `pages` and the two anchors. */
const ownSplit = (
  pages: readonly string[],
  bib: number | null,
  appendix: number | null,
  kind = "technical",
) =>
  lint({
    venue: { extends: "./own.jsonc", kind },
    extra: OWN_APPENDIX_IN_BODY,
    facts: ieeeFacts((f) => {
      f.pages_text = [...pages];
      f.bib_anchor_page = bib;
      f.appendix_anchor_page = appendix;
      // banal's counts, which this counting replaces: neither is judged.
      f.body_pages = 99;
      f.ref_pages = 99;
    }),
  });

describe("format/page-limit with `appendix_in_body`: the appendix is body, the reference pages hold only references", () => {
  const REFS = ["the end\nReferences\n[1] A.\n", "[2] B.\n", "[3] C.\n"];

  it("ten pages of body and two of references pass; banal's counts are not judged", () => {
    expect(ownSplit([...bodyPages(9), ...REFS], 10, null)).toEqual([]);
  });

  it("🔴 an appendix after the references that brings the body to eleven fails, naming where it starts", () => {
    const fs = ownSplit(
      [...bodyPages(9), ...REFS.slice(0, 2), "Appendix A.\nDetails\n"],
      10,
      12,
    );
    expect(fs.map((f) => f.message)).toEqual([
      "body pages (up to the references on page 10, and the appendix from page 12): 11, over the limit 10 for Own/technical — a desk reject; cut the text",
    ]);
  });

  it("🔴 three pages holding only references fail", () => {
    const fs = ownSplit([...bodyPages(9), ...REFS, "[4] D.\n"], 10, null);
    expect(fs.map((f) => f.message)).toEqual([
      "pages holding only references: 3, over the limit 2 for Own/technical — a desk reject; cut the text",
    ]);
  });

  it("an eleventh page of body before the references fails, appendices included", () => {
    expect(ids(ownSplit([...bodyPages(10), ...REFS], 11, null))).toEqual([
      "format/page-limit:pages",
    ]);
  });

  it.each<
    [string, readonly string[], readonly [number | null, number | null], string]
  >([
    [
      "no references heading",
      bodyPages(3),
      [null, null],
      "format/page-limit:noReferences",
    ],
    [
      "an appendix anchor on a page with no «Appendix» line",
      [...bodyPages(3), ...REFS],
      [4, 6],
      "format/page-limit:unclear",
    ],
  ])("%s: said, not counted", (_, pages, [bib, appendix], want) => {
    expect(ids(ownSplit(pages, bib, appendix))).toEqual([want]);
  });

  it("a kind with no limits judges nothing; one with a reference limit only judges that", () => {
    expect(ownSplit(bodyPages(3), null, null, "open")).toEqual([]);
    expect(
      ids(ownSplit([...bodyPages(12), ...REFS, "[4] D.\n"], 13, null, "refs")),
    ).toEqual(["format/page-limit:pages"]);
  });
});

/** An MSR technical paper that declares who wrote it. */
const MSR = {
  extends: "paperlint:msr",
  kind: "technical",
  identity: ["Ada Example"],
};

/** MSR facts: `pages` as the PDF's text, the two anchors where hyperref put them. */
const msrFacts = (
  pages: readonly string[],
  bib: number,
  appendix: number | null = null,
) =>
  ieeeFacts((f) => {
    f.pages_text = [...pages];
    f.bib_anchor_page = bib;
    f.appendix_anchor_page = appendix;
  });

/** References that start below the last body text on their page, then `more` pages of them. */
const refsFrom = (more: number): string[] => [
  "the last lines of the conclusion\nR EFERENCES\n[1] D. E. Knuth.\n",
  ...Array.from({ length: more }, (_, i) => `[${String(i + 2)}] More.\n`),
];

describe("format/page-limit on MSR: ten pages of main text, appendices included, and two of only references", () => {
  it("🔴 ten pages of body, the references starting on the tenth, and two pages of only references pass", () => {
    expect(
      lint({
        venue: MSR,
        facts: msrFacts([...bodyPages(9), ...refsFrom(2)], 10),
      }),
    ).toEqual([]);
  });

  it("🔴 eleven pages of body fail", () => {
    const fs = lint({
      venue: MSR,
      facts: msrFacts([...bodyPages(10), ...refsFrom(2)], 11),
    });
    expect(fs.map((f) => f.message)).toEqual([
      "body pages (up to the references on page 11, appendices included): 11, over the limit 10 for MSR/technical — a desk reject; cut the text",
    ]);
  });

  it("🔴 an appendix before the references that brings the body to eleven fails", () => {
    const pages = [...bodyPages(9), "Appendix A.\nDetails\n", ...refsFrom(2)];
    expect(ids(lint({ venue: MSR, facts: msrFacts(pages, 11, 10) }))).toEqual([
      "format/page-limit:pages",
    ]);
  });

  it("🔴 an appendix after the references that brings the body to eleven fails", () => {
    const pages = [...bodyPages(9), ...refsFrom(1), "Appendix A.\nDetails\n"];
    const fs = lint({ venue: MSR, facts: msrFacts(pages, 10, 12) });
    expect(fs[0]?.message).toMatch(
      /^body pages \(up to the references on page 10, and the appendix from page 12\): 11, over the limit 10/,
    );
  });

  it("🔴 three pages of only references fail", () => {
    const fs = lint({
      venue: MSR,
      facts: msrFacts([...bodyPages(9), ...refsFrom(3)], 10),
    });
    expect(fs.map((f) => f.message)).toEqual([
      "pages holding only references: 3, over the limit 2 for MSR/technical — a desk reject; cut the text",
    ]);
  });
});

/** An AIDC paper that declares who wrote it. */
const BLIND = {
  extends: "paperlint:aidc",
  kind: "regular",
  identity: ["Ada Example", "adaexample", "ada@example.org"],
};
const said = (patch: Patch) => ieeeFacts(patch);

describe("anonymity/identity — a blind venue (AIDC)", () => {
  it("no identity declared: an error, built or not — a missing input is not a clean pass", () => {
    const noIdentity = { extends: "paperlint:aidc", kind: "regular" };
    const built = lint({ venue: noIdentity, facts: ieeeFacts() });
    expect(ids(built)).toEqual(["anonymity/identity:noIdentity"]);
    expect(built[0]?.message).toMatch(/"identity": \["Your Name"/);
    expect(ids(lint({ venue: noIdentity, facts: null }))).toEqual([
      "anonymity/identity:noIdentity",
      "pdf/measured:unbuilt",
    ]);
    expect(
      ids(lint({ venue: { ...noIdentity, identity: [] }, facts: ieeeFacts() })),
    ).toEqual(["anonymity/identity:noIdentity"]);
  });

  it("declared and not built: silent — pdf/measured already says it was not built", () => {
    expect(ids(lint({ venue: BLIND, facts: null }))).toEqual([
      "pdf/measured:unbuilt",
    ]);
  });

  it("a name on a page, the metadata and a link target: one finding each, with the place", () => {
    const fs = lint({
      venue: BLIND,
      facts: said((f) => {
        f.pages_text = [
          "Title\nAda\nExample\n",
          ...bodyPages(11),
          "References\n",
        ];
        f.metadata = { Author: "Ada Example", Producer: "pdfTeX-1.40.25" };
        f.links = [{ page: 2, uri: "https://github.com/adaexample/tool" }];
      }),
    });
    expect(fs.map((f) => f.message)).toEqual([
      "PDF, page 1: «Ada Example» matches «Ada Example» in `identity`, and AIDC reviews double-blind — remove it, or refer to your own work in the third person",
      "PDF metadata: Author: «Ada Example» matches «Ada Example» in `identity`, and AIDC reviews double-blind — remove it, or refer to your own work in the third person",
      "link target on page 2 (https://github.com/adaexample/tool): «adaexample» matches «Ada Example» in `identity`, and AIDC reviews double-blind — remove it, or refer to your own work in the third person",
    ]);
  });

  it("an anonymous-hosting link names nobody, and is not a finding", () => {
    expect(
      lint({
        venue: BLIND,
        facts: said((f) => {
          f.links = [
            { page: 1, uri: "https://anonymous.4open.science/r/tool-1A2B" },
          ];
        }),
      }),
    ).toEqual([]);
  });

  it("a venue that is not blind: silent, with or without identity, whatever the PDF says", () => {
    const facts = withFacts((f) => (f.pages_text = ["Ada Example\n"]));
    expect(lint({ venue: DECL, facts })).toEqual([]);
    expect(
      lint({ venue: { ...DECL, identity: ["Ada Example"] }, facts }),
    ).toEqual([]);
  });
});

describe("an AIDC kind", () => {
  it("an AIDC kind that does not exist names the two that do", () => {
    const fs = lint({ venue: { extends: "paperlint:aidc", kind: "wip" } });
    expect(ids(fs)).toContain("pdf/profile:kindUnknown");
    expect(fs.find((f) => f.rule === "pdf/profile")?.message).toMatch(
      /regular, short/,
    );
  });
});

describe("a project's own preset, and the facts' other spellings", () => {
  // A standalone preset (no `extends`, so it carries a `tex` block) that sets a body size with no
  // tolerance, a reference range, two columns — and no page size and no font families.
  const HOUSE = {
    [`${PAPER}/house.jsonc`]: JSON.stringify({
      type: "family",
      tex: { packages: { acmart: ["acmart.cls"] } },
      format: { columns: 2, body_pt: 9, ref_pt_min: 7, ref_pt_max: 8 },
    }),
  };
  const house = (patch: (f: Facts) => void = () => {}) =>
    lint({
      venue: { extends: "./house.jsonc" },
      facts: withFacts(patch),
      extra: HOUSE,
    });

  it("no page size in the preset: nothing to compare, whatever the PDF measures", () => {
    expect(ids(house((f) => ((f.page_w_in = 5), (f.page_h_in = 5))))).toEqual(
      [],
    );
  });

  it("a body size with no tolerance is not judged; a reference range with none is judged exactly", () => {
    expect(ids(house((f) => (f.body_pt = 12)))).toEqual([]);
    // 6.9 pt passes agenticdev (its body_pt_tol widens the range) and fails here, where nothing does.
    expect(ids(house((f) => (f.ref_pt = 6.9)))).toEqual([
      "pdf/body-size:refPt",
    ]);
  });

  it("facts naming the PDF by an absolute path are checked against that file", () => {
    expect(
      lint({
        venue: DECL,
        facts: withFacts((f) => (f.pdf = `${PAPER}/paper.pdf`)),
      }),
    ).toEqual([]);
  });

  it("a PDF with no fonts at all: each missing family says so", () => {
    const fs = lint({ venue: DECL, facts: withFacts((f) => (f.fonts = [])) });
    expect(ids(fs)).toEqual(["pdf/fonts:noFamily", "pdf/fonts:noFamily"]);
    expect(fs[0]?.message).toMatch(/\(no fonts\)/);
  });

  it("file names in messages are relative to ESLint's cwd — and never empty", () => {
    const at = (cwd: string) =>
      lint(
        { venue: { kind: "short" }, facts: null, pdf: null },
        undefined,
        {},
        cwd,
      )[0]?.message;
    expect(at("/work")).toMatch(/set "extends" in papers\/p\/paperlint\.json/);
    expect(at(`${PAPER}/paperlint.json`)).toMatch(
      /set "extends" in \/work\/papers\/p\/paperlint\.json/,
    );
  });
});

describe("judgeBodyEnd, on a venue it does not apply to", () => {
  const NO_TEXT = { pages: [], bibAnchorPage: null, appendixAnchorPage: null };
  const venue = (kind: Resolved["kind"]): Resolved => ({
    venue: "house",
    format: { ...NO_FORMAT, bodyEndsAt: "references" },
    kind,
    kindProblem: null,
    blind: false,
    identity: null,
  });

  it("a kind with no body limit, or no kind: nothing to count against", () => {
    const limits = { bodyPagesMax: null, refPagesMax: null };
    expect(judgeBodyEnd(NO_TEXT, venue({ name: "long", limits }))).toEqual([]);
    expect(judgeBodyEnd(NO_TEXT, venue(null))).toEqual([]);
  });
});

/** A paper on AIDC through `cycles`: one attempt, open unless `outcome` says otherwise. */
const onCycle = (cycle: Record<string, unknown>) => ({
  identity: ["Ada Example"],
  cycles: [
    {
      id: "aidc-2026",
      venue: { kind: "preset", extends: "paperlint:aidc" },
      kind: "regular",
      opened: "2026-09-26",
      ...cycle,
    },
  ],
});

describe("the cycle decides what applies", () => {
  it("an open cycle reads as the flat form: the same findings on the same facts", () => {
    const facts = said((f) => (f.columns = 1));
    expect(ids(lint({ venue: onCycle({}), facts }))).toEqual(
      ids(lint({ venue: BLIND, facts })),
    );
    expect(ids(lint({ venue: onCycle({}), facts }))).toContain(
      "pdf/geometry:columns",
    );
  });

  it("`phase: porting` — the source is in the previous venue's template by declaration: every venue rule is silent", () => {
    const facts = said(
      (f) => ((f.columns = 1), (f.pages_text = ["Ada Example\n"])),
    );
    expect(lint({ venue: onCycle({ phase: "porting" }), facts })).toEqual([]);
    expect(lint({ venue: onCycle({ phase: "porting" }), facts: null })).toEqual(
      [],
    );
  });

  it("an ACCEPTED cycle at a blind venue: the camera-ready carries the authors, anonymity/identity is silent", () => {
    const facts = said(
      (f) =>
        (f.pages_text = ["Ada Example\n", ...bodyPages(11), "References\n"]),
    );
    const accepted = {
      kind: "accepted",
      date: "2026-10-16",
      evidence: "reviews/decision.md",
    };
    expect(ids(lint({ venue: onCycle({}), facts }))).toContain(
      "anonymity/identity:leak",
    );
    expect(lint({ venue: onCycle({ outcome: accepted }), facts })).toEqual([]);
  });
});
