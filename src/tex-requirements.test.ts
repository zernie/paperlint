import assert from "node:assert/strict";
import { test } from "vitest";
import {
  identityHint,
  identityHints,
  loadTypescript,
  parsePreset,
} from "./tex-requirements.ts";

test("loadTypescript refuses a module without the two functions a profile is read with", () => {
  assert.throws(
    () => loadTypescript(() => ({})),
    /loaded without parseConfigFileTextToJson/,
  );
});

test("loadTypescript hands back what `require` loaded when it has them", () => {
  const ts = {
    parseConfigFileTextToJson: () => ({ config: {} }),
    flattenDiagnosticMessageText: () => "",
  };
  assert.equal(
    loadTypescript(() => ts),
    ts,
  );
});

// ── what a preset is: the identity its `type` declares ─────────────────────────────────────

/** What `parsePreset` throws for `preset`, as text; "" when it parses. */
function refusalOf(name: string, preset: object): string {
  try {
    parsePreset(JSON.stringify(preset), name);
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

test("a venue without the link to its call for papers is refused at load, saying what to add", () => {
  // Guards: the wrong state the identity exists to make unrepresentable — a venue nobody can check.
  assert.equal(
    refusalOf("v.jsonc", {
      type: "venue",
      name: "X",
      extends: "paperlint:acm-sigconf",
    }),
    [
      "v.jsonc does not match venue-profile.schema.json:",
      '  a venue preset names its venue and links its call for papers: "name": "<the venue, as its call spells it>", "url": "https://<the call for papers>"',
      "  v.jsonc: (top level) should have required property 'url'",
      '  v.jsonc: (top level) should match "then" schema',
    ].join("\n"),
  );
});

test("a template family with a venue's name and url is refused, naming each key", () => {
  assert.equal(
    refusalOf("f.jsonc", {
      type: "family",
      name: "ACM",
      url: "https://acm.org/",
      extends: "paperlint:acm-sigconf",
    }),
    [
      "f.jsonc does not match venue-profile.schema.json:",
      '  a template family names no venue: drop "name" — a venue\'s "name", "url", accepted papers ("shape") and where to find them ("accepted") belong to the venue presets that extend it',
      '  a template family names no venue: drop "url" — a venue\'s "name", "url", accepted papers ("shape") and where to find them ("accepted") belong to the venue presets that extend it',
      "  f.jsonc: .name boolean schema is false",
      "  f.jsonc: .url boolean schema is false",
      '  f.jsonc: (top level) should match "then" schema',
    ].join("\n"),
  );
});

test("a preset that does not say what it is is refused, with the three answers", () => {
  assert.equal(
    refusalOf("n.jsonc", { extends: "paperlint:acm-sigconf" }),
    [
      "n.jsonc does not match venue-profile.schema.json:",
      '  say what this preset is: "type": "venue" (one venue\'s call for papers), "family" (a publisher\'s template that venues extend) or "base" (the TeX base set)',
      "  n.jsonc: (top level) should have required property 'type'",
    ].join("\n"),
  );
});

test("the TeX base set holds its packages and nothing else", () => {
  assert.equal(
    refusalOf("b.jsonc", {
      type: "base",
      tex: { packages: { a: ["a.sty"] } },
      format: { columns: 2 },
    }),
    [
      "b.jsonc does not match venue-profile.schema.json:",
      '  the TeX base set holds "type" and "tex" only — a venue\'s or a family\'s settings go in its own preset',
      "  b.jsonc: (top level) should NOT have more than 2 properties",
      '  b.jsonc: (top level) should match "then" schema',
    ].join("\n"),
  );
});

test("a venue is parsed into its identity; a family and the base set carry none of a venue's fields", () => {
  const read = (p: object) =>
    parsePreset(JSON.stringify(p), "p.jsonc").identity;
  assert.deepEqual(
    [
      read({
        type: "venue",
        name: "X",
        url: "https://x.org/cfp",
        extends: "paperlint:acm-sigconf",
      }),
      read({ type: "family", extends: "paperlint:acm-sigconf" }),
      read({ type: "base", tex: { packages: { a: ["a.sty"] } } }),
    ],
    [
      { type: "venue", name: "X", url: "https://x.org/cfp" },
      { type: "family" },
      { type: "base" },
    ],
  );
});

test("identityHint has nothing to add to a violation that is not about the identity", () => {
  assert.equal(
    identityHint({
      keyword: "additionalProperties",
      dataPath: "",
      params: { additionalProperty: "colums" },
    }),
    null,
  );
});

test("identityHints: Ajv's null errors give none; a hint two violations share is given once", () => {
  assert.deepEqual(identityHints({ errors: null }), []);
  const missing = {
    keyword: "required",
    dataPath: "",
    schemaPath: "#/required",
    params: { missingProperty: "type" },
  };
  const hints = identityHints({ errors: [missing, missing] });
  assert.equal(hints.length, 1);
  assert.deepEqual(hints, [identityHint(missing)]);
});

// ── the venue's accepted papers: `shape` (read by pdf/venue-shape) and `accepted` (by a skill) ──

const VENUE = {
  type: "venue",
  name: "X",
  url: "https://x.org/cfp",
  extends: "paperlint:acm-sigconf",
};
const ROW = {
  paper: "A Paper",
  url: "https://arxiv.org/pdf/2501.00001",
  pages: 12,
  body_words: 8000,
  figures: 7,
  tables: 3,
  abstract_words: 210,
  references: null,
};

test("a venue's `shape` is parsed into one shape per paper, a null kept as not counted", () => {
  const shape = {
    source: "X 2025 accepted papers",
    url: "https://x.org/accepted",
    measured: "2026-10-11",
    papers: [ROW],
  };
  assert.deepEqual(
    parsePreset(JSON.stringify({ ...VENUE, shape }), "p.jsonc").shape,
    {
      source: "X 2025 accepted papers",
      url: "https://x.org/accepted",
      measured: "2026-10-11",
      papers: [
        {
          paper: "A Paper",
          url: "https://arxiv.org/pdf/2501.00001",
          pages: 12,
          shape: {
            body_words: 8000,
            figures: 7,
            tables: 3,
            abstract_words: 210,
            references: null,
          },
        },
      ],
    },
  );
  assert.equal(parsePreset(JSON.stringify(VENUE), "p.jsonc").shape, null);
});

test("a `shape` row missing a measure is refused: a row is written by the script, whole", () => {
  const row = Object.fromEntries(
    Object.entries(ROW).filter(([k]) => k !== "figures"),
  );
  assert.equal(
    refusalOf("v.jsonc", {
      ...VENUE,
      shape: {
        source: "s",
        url: "https://x.org/a",
        measured: "2026-10-11",
        papers: [row],
      },
    }),
    [
      "v.jsonc does not match venue-profile.schema.json:",
      "  v.jsonc: .shape.papers[0] should have required property 'figures'",
    ].join("\n"),
  );
});

test("an `accepted` block: the per-year list needs `{year}`, a proxy needs its limits", () => {
  const accepted = {
    list: "https://{year}.x.org/accepted",
    dblp: { key: "conf/x", url: "https://dblp.org/db/conf/x/x{year}.html" },
    editions: [{ year: 2025, template: "IEEEtran", current_template: true }],
    strong: [
      {
        kind: "distinguished-paper",
        name: "Distinguished Paper Award",
        url: "https://x.org/awards",
        limits: "no list for 2026",
      },
    ],
    access: [{ host: "dl.acm.org", note: "a challenge page" }],
  };
  assert.equal(refusalOf("v.jsonc", { ...VENUE, accepted }), "");
  assert.equal(refusalOf("v.jsonc", { ...VENUE, accepted: {} }), "");
  assert.equal(
    refusalOf("v.jsonc", {
      ...VENUE,
      accepted: {
        list: "https://x.org/accepted-2025",
        strong: [{ kind: "best-paper", name: "Best", url: "https://x.org" }],
      },
    }),
    [
      "v.jsonc does not match venue-profile.schema.json:",
      '  v.jsonc: .accepted.list should match pattern "^https://\\S*\\{year\\}\\S*$"',
      "  v.jsonc: .accepted.strong[0] should have required property 'limits'",
    ].join("\n"),
  );
});

test("a template family carries no venue data: `shape` and `accepted` are refused on it", () => {
  const refusal = refusalOf("f.jsonc", {
    type: "family",
    extends: "paperlint:acm-sigconf",
    accepted: {},
  });
  assert.equal(
    refusal,
    [
      "f.jsonc does not match venue-profile.schema.json:",
      '  a template family names no venue: drop "accepted" — a venue\'s "name", "url", accepted papers ("shape") and where to find them ("accepted") belong to the venue presets that extend it',
      "  f.jsonc: .accepted boolean schema is false",
      '  f.jsonc: (top level) should match "then" schema',
    ].join("\n"),
  );
});
