/**
 * Venue presets: what `"extends"` in a paper's `paperlint.json` resolves to. Two spec forms —
 * `paperlint:<name>` (shipped) and a relative path (the project's own) — a chain of at most four
 * presets, merged block by block, and a display label derived from the spec.
 *
 * The shipped presets are read from the package's venues directory, so a shipped file that stops
 * resolving shows here.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { packageVenuesDir } from "../skills/paper-pipeline/scripts/consumer.mjs";
import {
  MAX_PRESET_DEPTH,
  labelOf,
  presetProblemText,
  resolvePreset,
} from "./presets.ts";

const VENUES = packageVenuesDir();
const shipped = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f))]),
);
const PAPER_FILE = "/work/papers/p/paperlint.json";
const deps = (extra: Record<string, string> = {}) => ({
  files: memoryFiles({ ...shipped, ...extra }),
  venuesDir: VENUES,
});
const resolve = (spec: string, extra: Record<string, string> = {}) =>
  resolvePreset(spec, PAPER_FILE, deps(extra));

describe("shipped presets", () => {
  it("paperlint:agenticdev → agenticdev over acm-sigconf: the family's format, the venue's kinds", () => {
    const r = resolve("paperlint:agenticdev");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.chain.map((f) => f.split("/").pop())).toEqual([
      "acm-sigconf.jsonc",
      "agenticdev.jsonc",
    ]);
    expect(r.value.format.columns).toBe(2);
    expect(r.value.format.fontsText).toBe("LinLibertine");
    expect([...r.value.format.kinds.keys()]).toEqual(["short", "full", "demo"]);
    expect(r.value.template).toBe("acmart");
    expect("acmart" in r.value.tex.packages).toBe(true);
    expect(r.value.label).toBe("agenticdev");
  });

  it("a paper may extend a family directly: format and fonts, and no kinds", () => {
    const r = resolve("paperlint:acm-sigconf");
    expect(r.ok && r.value.format.kinds.size).toBe(0);
    expect(r.ok && r.value.format.pageWidthIn).toBe(8.5);
  });

  it("realm (ACL) stands alone: A4, no parent", () => {
    const r = resolve("paperlint:realm");
    expect(r.ok && r.value.chain.length).toBe(1);
    expect(r.ok && r.value.format.pageWidthIn).toBe(8.27);
  });

  it("agenticdev turns pdf/last-page-balance on — its producer asks for balanced columns", () => {
    const r = resolve("paperlint:agenticdev");
    expect(r.ok && r.value.rules["pdf/last-page-balance"]).toEqual([
      "error",
      { tolerancePt: 120 },
    ]);
  });
});

describe("a project's own preset, by relative path", () => {
  const usenix = JSON.stringify({
    extends: "paperlint:acm-sigconf",
    name: "USENIX Security",
    format: {
      columns: 1,
      kinds: { full: { body_pages_max: 13, ref_pages_max: 0 } },
    },
    tex: { packages: { usenix: ["usenix.sty"] } },
    rules: { "pdf/body-size": "off" },
  });

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

  it("without `name`, the label is the file name without its extension", () => {
    const r = resolve("./venues/usenix-sec.jsonc", {
      "/work/papers/p/venues/usenix-sec.jsonc": JSON.stringify({
        extends: "paperlint:acm-sigconf",
      }),
    });
    expect(r.ok && r.value.label).toBe("usenix-sec");
  });

  it("a child kind replaces that kind wholesale; other kinds are kept", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": JSON.stringify({
        extends: "paperlint:agenticdev",
        format: { kinds: { short: { body_pages_max: 6 } } },
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.format.kinds.get("short")).toEqual({
      bodyPagesMax: 6,
      refPagesMax: null,
    });
    expect(r.value.format.kinds.get("full")?.bodyPagesMax).toBe(10);
  });

  it("rules: the leaf wins over its parent, per rule id", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": JSON.stringify({
        extends: "paperlint:agenticdev",
        rules: { "pdf/last-page-balance": "off" },
      }),
    });
    expect(r.ok && r.value.rules["pdf/last-page-balance"]).toBe("off");
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
    ["a bare name", "agenticdev", "unsupported", /paperlint:agenticdev/],
    [
      "a shipped name with a typo",
      "paperlint:agenticdve",
      "not-found",
      /acm-sigconf, agenticdev, aisec, realm/,
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
      "/work/papers/p/a.jsonc": JSON.stringify({ extends: "./b.jsonc" }),
      "/work/papers/p/b.jsonc": JSON.stringify({ extends: "./a.jsonc" }),
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
      files[`/work/papers/p/p${String(i)}.jsonc`] = JSON.stringify({
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
      "/work/papers/p/p1.jsonc": JSON.stringify({ extends: "./p2.jsonc" }),
      "/work/papers/p/p2.jsonc": JSON.stringify({
        extends: "paperlint:agenticdev",
      }),
    });
    expect(r.ok && r.value.chain.length).toBe(MAX_PRESET_DEPTH);
  });

  it("a preset that fails the schema is named with its file", () => {
    const r = resolve("./bad.jsonc", {
      "/work/papers/p/bad.jsonc": JSON.stringify({
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
      "/work/papers/p/root.jsonc": JSON.stringify({ format: { columns: 1 } }),
    });
    expect(r.ok).toBe(false);
  });
});

describe("labelOf — display only, never used to resolve", () => {
  it.each([
    ["paperlint:agenticdev", "agenticdev"],
    ["./venues/usenix-sec.jsonc", "usenix-sec"],
    ["../shared/acl.json", "acl"],
  ])("%s → %s", (spec, label) => {
    expect(labelOf(spec)).toBe(label);
  });
});
