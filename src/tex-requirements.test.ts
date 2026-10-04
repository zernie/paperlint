import assert from "node:assert/strict";
import { test } from "vitest";
import {
  identityHint,
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
      '  a template family names no venue: drop "name" — "name" and "url" belong to the venue presets that extend it',
      '  a template family names no venue: drop "url" — "name" and "url" belong to the venue presets that extend it',
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
  const read = (p: object) => parsePreset(JSON.stringify(p), "p.jsonc").identity;
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
