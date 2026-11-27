/**
 * The preset a kept paper is linted against: an edition, a family, or none.
 */
import { describe, expect, test } from "vitest";
import { presetFor } from "./preset.ts";
import { preambleOf } from "./rules.ts";

const slot = { series: "ACL", year: 2025 };
const ccsShipped = new Set(["ccs-2025"]);

const ccs = { series: "ACM CCS", year: 2025 };

describe("the preset", () => {
  test.each([
    {
      name: "a shipped edition, by its alias",
      s: ccs,
      cls: "{acmart}",
      style: undefined,
      preset: "paperlint:ccs-2025",
    },
    {
      name: "the style's family",
      s: slot,
      cls: "{article}",
      style: "neurips_2025",
      preset: "paperlint:neurips-style",
    },
    {
      name: "acmart sigconf",
      s: slot,
      cls: "[sigconf]{acmart}",
      style: undefined,
      preset: "paperlint:acm-sigconf",
    },
    {
      name: "acmart in another format",
      s: slot,
      cls: "[acmtog]{acmart}",
      style: undefined,
      preset: null,
    },
    {
      name: "IEEEtran conference",
      s: slot,
      cls: "[conference]{IEEEtran}",
      style: undefined,
      preset: "paperlint:ieee-conference",
    },
    {
      name: "IEEEtran journal",
      s: slot,
      cls: "[journal]{IEEEtran}",
      style: undefined,
      preset: null,
    },
    {
      name: "no family",
      s: slot,
      cls: "{article}",
      style: undefined,
      preset: null,
    },
  ])("$name", ({ s, cls, style, preset }) => {
    const p = preambleOf(`\\documentclass${cls}`);
    // Guards: which preset, never a guess outside the families.
    const got = presetFor(
      { slot: s, preamble: p, style, shipped: ccsShipped },
      "",
    );
    expect(got.preset).toBe(preset);
  });
});

describe("an edition preset that covers one track", () => {
  const ase = { series: "ASE", year: 2026 };
  const p = preambleOf("\\documentclass[sigconf]{acmart}");
  const shipped = new Set(["ase-2026"]);
  test.each([
    {
      name: "the Research Track gets the edition preset",
      evidence: "Accepted at ASE 2026 Research Track",
      preset: "paperlint:ase-2026",
    },
    {
      name: "another track gets the family",
      evidence: "Accepted at ASE 2026 - Industry Showcase",
      preset: "paperlint:acm-sigconf",
    },
    {
      name: "evidence naming no track gets the family",
      evidence: "Accepted at ASE 2026",
      preset: "paperlint:acm-sigconf",
    },
  ])("$name", ({ evidence, preset }) => {
    // Guards: a one-track edition preset is never applied to a paper of another or an unnamed track.
    expect(
      presetFor({ slot: ase, preamble: p, shipped }, evidence).preset,
    ).toBe(preset);
  });
  test("the fallback says why the edition was passed over", () => {
    // Guards: the README names the edition's track, not «no preset ships».
    expect(
      presetFor(
        { slot: ase, preamble: p, shipped },
        "Accepted at ASE 2026 - Industry Showcase",
      ),
    ).toEqual({
      preset: "paperlint:acm-sigconf",
      why: "the acmart sigconf family, as the shipped edition preset ase-2026 covers the Research Track only and the acceptance evidence does not name it",
    });
  });
});

describe("an edition preset whose track the style option names", () => {
  const neurips = { series: "NeurIPS", year: 2026 };
  const p = preambleOf("\\documentclass{article}");
  const shipped = new Set(["neurips-2026"]);
  const style = "neurips_2026";
  test.each([
    {
      name: "the main option gets the edition preset",
      styleOpts: "main, final",
      preset: "paperlint:neurips-2026",
    },
    {
      name: "another track's option gets the family",
      styleOpts: "eandd,final",
      preset: "paperlint:neurips-style",
    },
    {
      name: "no track option gets the family",
      styleOpts: "final",
      preset: "paperlint:neurips-style",
    },
    {
      name: "a word that contains the option is not the option",
      styleOpts: "mainly, final",
      preset: "paperlint:neurips-style",
    },
  ])("$name", ({ styleOpts, preset }) => {
    // Guards: the track comes from the paper's own style line, whatever the comment says.
    expect(
      presetFor(
        { slot: neurips, preamble: p, style, styleOpts, shipped },
        "Accepted at NeurIPS 2026 Main Track",
      ).preset,
    ).toBe(preset);
  });
  test("the fallback says why the edition was passed over", () => {
    // Guards: the README names the track and where it was read.
    expect(
      presetFor(
        { slot: neurips, preamble: p, style, styleOpts: "eandd, final", shipped },
        "Accepted at NeurIPS 2026",
      ),
    ).toEqual({
      preset: "paperlint:neurips-style",
      why: "the NeurIPS style family, as the shipped edition preset neurips-2026 covers the Main Track only and the style options [eandd, final] do not name it",
    });
  });
});
