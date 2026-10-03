import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFiles } from "../adapters/node/index.ts";
import { presetsDir } from "../package-dirs.ts";
import { shippedVenueNames } from "../presets.ts";
import {
  nameTokens,
  venuesNamedBy,
  withoutVenues,
  type NamedVenue,
} from "./venue-name.ts";

describe("nameTokens — a name as the words it is made of", () => {
  it.each<[string, readonly string[]]>([
    ["aisec-2026", ["aisec", "2026"]],
    ["my_paper.v2", ["my", "paper", "v", "2"]],
    ["ACM CCS", ["acm", "ccs"]],
    ["acm-sigconf", ["acm", "sigconf"]],
    // Letters and digits glued together are two words: `aisec2026` names AISec as much as `aisec-2026`.
    ["aisec2026", ["aisec", "2026"]],
    ["--x--", ["x"]],
    ["", []],
  ])("%s", (name, want) => {
    expect(nameTokens(name)).toEqual(want);
  });
});

/**
 * The venues are the SHIPPED presets, read through the one source of venue names
 * (`shippedVenueNames`) — never a list of names written here. A case below depends on what a preset
 * says (`aidc`'s alias ACSAC, `aisec`'s ACM CCS); a preset edit that changes it shows here.
 */
const VENUES: readonly NamedVenue[] = shippedVenueNames({
  files: nodeFiles,
  venuesDir: presetsDir(),
});

describe("venuesNamedBy — which venues a folder name names", () => {
  it.each<[string, string, readonly { venue: string; name: string }[]]>([
    ["the label", "aisec-2026", [{ venue: "aisec", name: "aisec" }]],
    ["an alias", "acsac-2026", [{ venue: "aidc", name: "ACSAC" }]],
    [
      "a two-word alias, as two tokens in a row",
      "acm-ccs-agents",
      [{ venue: "aisec", name: "ACM CCS" }],
    ],
    ["the two words of an alias apart are not it", "acm-agents-ccs", []],
    ["glued to a year", "realm2026", [{ venue: "realm", name: "realm" }]],
    [
      "two venues, each once, in the order they are listed",
      "realm-aisec-aisec",
      [
        { venue: "aisec", name: "aisec" },
        { venue: "realm", name: "realm" },
      ],
    ],
    // Whole tokens only: a venue's name inside another word is that other word.
    ["inside a word: overrealm", "overrealm-study", []],
    ["inside a word: realms", "realms-of-agents", []],
    ["inside a word: aisecure", "aisecure", []],
    ["no venue at all", "agent-rule-drift", []],
  ])("%s: %s", (_, folder, want) => {
    expect(venuesNamedBy(folder, VENUES)).toEqual(want);
  });

  it("a name that is also the paper's own is not reported, whichever venue declares it", () => {
    // A paper at a venue whose own chain also says "ACM CCS" (two workshops of one conference).
    expect(venuesNamedBy("ccs-acm-ccs", VENUES, ["ACM CCS"])).toEqual([]);
    expect(venuesNamedBy("aisec-2026", VENUES, ["aisec"])).toEqual([]);
  });

  it("own names compare by their words, not their spelling", () => {
    expect(venuesNamedBy("acsac-2026", VENUES, ["ACSAC"])).toEqual([]);
    expect(venuesNamedBy("acm-ccs-x", VENUES, ["acm-ccs"])).toEqual([]);
  });

  it("a preset whose alias has no words names nothing by it", () => {
    // A fixture preset in a copy of the presets directory: alias "—" has no letter or digit, and a
    // name of no words must not stand everywhere.
    const dir = realpathSync(
      mkdtempSync(join(tmpdir(), "paperlint-venue-name-")),
    );
    cpSync(presetsDir(), dir, { recursive: true });
    writeFileSync(
      join(dir, "dash.jsonc"),
      JSON.stringify({ extends: "paperlint:acm-sigconf", aliases: ["—"] }),
    );
    const venues = shippedVenueNames({ files: nodeFiles, venuesDir: dir });
    expect(venues.find((v) => v.label === "dash")?.aliases).toContain("—");
    expect(venuesNamedBy("agent-rule-drift", venues)).toEqual([]);
    expect(venuesNamedBy("dash-2026", venues)).toEqual([
      { venue: "dash", name: "dash" },
    ]);
  });
});

describe("withoutVenues — the name with its venues taken out, when that is a name for the work", () => {
  it.each<[string, string | null]>([
    ["aisec-agent-drift", "agent-drift"],
    ["agent_drift.aisec", "agent-drift"],
    ["acm-ccs-agents", "agents"],
    ["realm-rules-aisec-2026", "rules-2026"],
    ["--aisec--agents", "agents"],
    // Only numbers left: `2026` names no work.
    ["aisec-2026", null],
    ["aisec", null],
    // A venue glued to other words in one part is not cleanly taken out.
    ["aisec2026-agents", null],
    ["agent-rule-drift", "agent-rule-drift"],
  ])("%s → %s", (name, want) => {
    expect(withoutVenues(name, VENUES)).toBe(want);
  });
});
