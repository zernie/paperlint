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
import { presetsDir } from "./package-dirs.ts";
import { parsePreset } from "./tex-requirements.ts";
import {
  MAX_PRESET_DEPTH,
  SHIPPED_PREFIX,
  shippedPresets,
  shippedVenueNames,
  labelOf,
  presetProblemText,
  resolvePreset,
} from "./presets.ts";

const VENUES = presetsDir();
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
    // The family's template, as its file spells it: the child names none.
    expect(r.value.template).toEqual({
      text: "\\documentclass[sigconf]{acmart}",
      file: join(VENUES, "acm-sigconf.jsonc"),
    });
    expect("acmart" in r.value.tex.packages).toBe(true);
    // The label is the venue's own name, from its file's `name`; the id stays the file name — the
    // stable key the facts file and the build plan carry.
    expect(r.value.label).toBe("AgenticDev");
    expect(r.value.id).toBe("agenticdev");
    expect(r.value.identity).toEqual({
      type: "venue",
      name: "AgenticDev",
      url: "https://conf.researchr.org/home/ase-2026/agenticdev-2026",
    });
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
    expect(declared).toEqual({
      "acm-sigconf.jsonc": { type: "family" },
      "agenticdev.jsonc": {
        type: "venue",
        name: "AgenticDev",
        url: "https://conf.researchr.org/home/ase-2026/agenticdev-2026",
      },
      "aidc.jsonc": {
        type: "venue",
        name: "AIDC",
        url: "https://aidcworkshop.github.io/",
      },
      "aisec.jsonc": {
        type: "venue",
        name: "AISec",
        url: "https://aisec.cc/",
      },
      "ieee-conference.jsonc": { type: "family" },
      "realm.jsonc": {
        type: "venue",
        name: "REALM",
        url: "https://realm-workshop.github.io/call_for_papers",
      },
      "tex-base.jsonc": { type: "base" },
    });
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
      expect(publishers.filter((pub) => name.startsWith(`${pub}-`))).toEqual(
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
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:agenticdev",
        rules: { "pdf/last-page-balance": "off" },
      }),
    });
    expect(r.ok && r.value.rules["pdf/last-page-balance"]).toBe("off");
  });

  it("ruleOrigins: each rule's entry names the file of the chain that set it", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:agenticdev",
        rules: { "pdf/body-size": "off" },
      }),
    });
    // Guards: an own rule is the leaf's, an inherited one names the parent that set it.
    expect(r.ok && r.value.ruleOrigins).toEqual({
      "pdf/last-page-balance": join(VENUES, "agenticdev.jsonc"),
      "tex/heading-case": join(VENUES, "agenticdev.jsonc"),
      "pdf/body-size": "/work/papers/p/mine.jsonc",
    });
  });

  it("ruleOrigins: a rule the leaf sets again is the leaf's, not its parent's", () => {
    const r = resolve("./mine.jsonc", {
      "/work/papers/p/mine.jsonc": venue({
        extends: "paperlint:agenticdev",
        rules: { "tex/heading-case": "off" },
      }),
    });
    expect(r.ok && r.value.ruleOrigins["tex/heading-case"]).toBe(
      "/work/papers/p/mine.jsonc",
    );
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
      /acm-sigconf, agenticdev, aidc, aisec, ieee-conference, realm/,
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
      "/work/papers/p/p2.jsonc": venue({ extends: "paperlint:agenticdev" }),
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
      "/work/papers/p/fam.jsonc": family({ extends: "paperlint:aisec" }),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(presetProblemText(r.error)).toBe(
      `the preset /work/papers/p/fam.jsonc is a template family and extends ${join(VENUES, "aisec.jsonc")}, a venue — a family builds only on a family; a venue extends a family or another venue`,
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
      "/work/papers/p/mine.jsonc": venue({ extends: "paperlint:aisec" }),
    });
    expect(r.ok && r.value.identity).toEqual({
      type: "venue",
      name: "Our Workshop",
      url: "https://example.org/cfp",
    });
  });
});

describe("a preset's template: kept as its file spells it, with that file", () => {
  it("a child's template replaces its parent's, and names its own file", () => {
    const r = resolve("./own.jsonc", {
      "/work/papers/p/own.jsonc": venue({
        extends: "paperlint:aidc",
        template: "\\documentclass[conference]{IEEEtran}",
      }),
    });
    expect(r.ok && r.value.template).toEqual({
      text: "\\documentclass[conference]{IEEEtran}",
      file: "/work/papers/p/own.jsonc",
    });
  });
});

describe("labelOf — display only, never used to resolve", () => {
  it.each([
    ["paperlint:agenticdev", "agenticdev"],
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
      "acm-sigconf",
      "AgenticDev",
      "AIDC",
      "AISec",
      "ieee-conference",
      "REALM",
    ]);
    expect(names.find((n) => n.label === "AISec")?.aliases).toEqual(
      expect.arrayContaining(["AISec", "ACM CCS"]),
    );
  });

  it("a preset that does not resolve is left out", () => {
    const files = memoryFiles(
      Object.fromEntries(
        Object.entries(shipped).filter(([f]) => !f.endsWith("realm.jsonc")),
      ),
    );
    expect(
      shippedVenueNames({ files, venuesDir: VENUES }).map((n) => n.label),
    ).toEqual([
      "acm-sigconf",
      "AgenticDev",
      "AIDC",
      "AISec",
      "ieee-conference",
    ]);
  });
});
