/**
 * A venue's `scope` (`presets/venue-profile.schema.json`): what its call says it is for, verbatim.
 * Parsed by `parsePreset`, merged by `resolvePreset`, and recorded on every shipped venue preset
 * except the editions listed in `WITHOUT_SCOPE`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { presetsDir } from "./package-dirs.ts";
import { parsePreset } from "./tex-requirements.ts";
import { resolvePreset, shippedPresets } from "./presets.ts";

const VENUES = presetsDir();
const shipped = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f))]),
);
const PAPER_FILE = "/work/papers/p/paperlint.json";
const resolve = (spec: string, extra: Record<string, string> = {}) =>
  resolvePreset(spec, PAPER_FILE, {
    files: memoryFiles({ ...shipped, ...extra }),
    venuesDir: VENUES,
  });

const SCOPE = {
  url: "https://example.org/cfp",
  read: "2026-11-25",
  sentences: ["We invite papers on X."],
  topics: ["X in practice"],
};
const venue = (body: Record<string, unknown>, name = "Our Workshop") =>
  JSON.stringify({
    type: "venue",
    name,
    url: "https://example.org/cfp",
    extends: "paperlint:acl-latex",
    ...body,
  });

/** What `parsePreset` throws for the preset `text`; "" when it parses. */
function refusalOf(text: string): string {
  try {
    parsePreset(text, "v.jsonc");
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("parsing a scope", () => {
  it("a venue's scope is read whole, topics included", () => {
    expect(parsePreset(venue({ scope: SCOPE }), "v.jsonc").scope).toEqual(
      SCOPE,
    );
  });

  it("a venue without a scope still parses, with none", () => {
    // Guards: the field is optional, so no project's own preset breaks when it ships.
    expect(parsePreset(venue({}), "v.jsonc").scope).toBeNull();
  });

  it.each([
    ["no sentence", { ...SCOPE, sentences: [] }, /scope\.sentences/u],
    [
      "an http page",
      { ...SCOPE, url: "http://example.org/cfp" },
      /scope\.url/u,
    ],
    [
      "a day that is not a date",
      { ...SCOPE, read: "25.11.2026" },
      /scope\.read/u,
    ],
    ["an unknown key", { ...SCOPE, why: "x" }, /scope/u],
  ])("a scope with %s is refused, naming the field", (_, scope, field) => {
    expect(refusalOf(venue({ scope }))).toMatch(field);
  });

  it("a template family with a scope is refused: a family names no venue", () => {
    expect(
      refusalOf(
        JSON.stringify({
          type: "family",
          extends: "paperlint:acl-latex",
          scope: SCOPE,
        }),
      ),
    ).toMatch(/scope/u);
  });
});

describe("merging a scope", () => {
  it("a child venue's scope replaces its parent's whole", () => {
    const own = { ...SCOPE, sentences: ["Ours."], topics: undefined };
    const r = resolve("./child.jsonc", {
      "/work/papers/p/base.jsonc": venue({ scope: SCOPE }, "Base"),
      "/work/papers/p/child.jsonc": venue(
        { extends: "./base.jsonc", scope: own },
        "Child",
      ),
    });
    expect(r.ok && r.value.scope).toEqual({ ...own, topics: [] });
  });

  it("a child venue without a scope keeps its parent's", () => {
    const r = resolve("./child.jsonc", {
      "/work/papers/p/base.jsonc": venue({ scope: SCOPE }, "Base"),
      "/work/papers/p/child.jsonc": venue({ extends: "./base.jsonc" }, "Child"),
    });
    expect(r.ok && r.value.scope).toEqual(SCOPE);
  });

  it("a workshop does not take the scope of the conference it is held at", () => {
    // Guards: AGENT is held at ICSE, and ICSE's scope is not AGENT's (the reason scope exists).
    const r = resolve("./w.jsonc", {
      "/work/papers/p/conf-2027.jsonc": venue({ scope: SCOPE }, "Conf"),
      "/work/papers/p/w-2027.jsonc": venue(
        { workshop: true, parent: "./conf-2027.jsonc" },
        "W",
      ),
      "/work/papers/p/w.jsonc": venue({ extends: "./w-2027.jsonc" }, "W2"),
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.scope).toBeNull();
  });
});

// The shipped venue editions that do not record their call's scope yet. This list may only shrink:
// a new edition records its scope (`add-venue`), and filling one in removes it here.
const WITHOUT_SCOPE = [
  "aaai-2027",
  "acsac-2026",
  "agent-2027",
  "agenticdev-2026",
  "agentverify-2027",
  "aidc-2026",
  "aisec-2026",
  "ase-2026",
  "ccs-2026",
  "emnlp-2026",
  "fse-2027",
  "icml-2027",
  "icse-2027",
  "icse-2028",
  "msr-2027",
  "naacl-2027",

  "neurips-2026",
  "nlbse-2027",
  "realm-2026",
  "sp-2027",
];

describe("the shipped venue editions", () => {
  const venues = shippedPresets(VENUES).filter((name) => {
    const r = resolve(`paperlint:${name}`);
    return r.ok && r.value.identity.type === "venue";
  });
  const scoped = (name: string) => {
    const r = resolve(`paperlint:${name}`);
    return r.ok && r.value.scope !== null;
  };

  it("every venue edition records its scope, except the listed ones", () => {
    expect(
      venues.filter((n) => !scoped(n) && !WITHOUT_SCOPE.includes(n)),
    ).toEqual([]);
  });

  it("every listed edition still lacks its scope and still ships: the list only shrinks", () => {
    expect(
      WITHOUT_SCOPE.filter((n) => !venues.includes(n) || scoped(n)),
    ).toEqual([]);
  });
});
