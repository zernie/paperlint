import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nodeFiles } from "../adapters/node/index.ts";
import { presetsDir } from "../package-dirs.ts";
import { shippedFolderNames } from "../presets.ts";
import {
  nameTokens,
  venuesNamedBy,
  withoutVenues,
  type NamedVenue,
} from "./venue-name.ts";
import { venuePreset } from "../../test/support.ts";

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
 * The venues are the SHIPPED presets as a folder name names them (`shippedFolderNames`: each
 * edition, `AISec 2026`, and its declared `aliases`) — never a list of names written here. A case
 * below depends on what a preset says (`acsac-2026`'s alias ACSAC, `ccs-2026`'s name ACM CCS); a
 * preset edit that changes it shows here.
 */
const VENUES: readonly NamedVenue[] = shippedFolderNames({
  files: nodeFiles,
  venuesDir: presetsDir(),
});

describe("venuesNamedBy — which venues a folder name names", () => {
  it.each<[string, string, readonly { venue: string; name: string }[]]>([
    [
      "the edition",
      "aisec-2026",
      [{ venue: "AISec 2026", name: "AISec 2026" }],
    ],
    ["an alias", "aisec-agents", [{ venue: "AISec 2026", name: "AISec" }]],
    [
      "a two-word name, as two tokens in a row",
      "acm-ccs-agents",
      [{ venue: "ACM CCS 2026", name: "ACM CCS" }],
    ],
    ["the two words of a name apart are not it", "acm-agents-ccs", []],
    [
      "glued to a year",
      "realm2026",
      [{ venue: "REALM 2026", name: "REALM 2026" }],
    ],
    [
      "two venues, each once, in the order they are listed",
      "realm-aisec-aisec",
      [
        { venue: "AISec 2026", name: "AISec" },
        { venue: "REALM 2026", name: "REALM" },
      ],
    ],
    // Whole tokens only: a venue's name inside another word is that other word.
    ["inside a word: overrealm", "overrealm-study", []],
    ["inside a word: realms", "realms-of-agents", []],
    ["inside a word: aisecure", "aisecure", []],
    ["no venue at all", "agent-rule-drift", []],
    // A name that is an ordinary word counts only as its edition.
    ["an ordinary word: agent", "agent-study", []],
    [
      "the edition of that word",
      "agent-2027-study",
      [{ venue: "AGENT 2027", name: "AGENT 2027" }],
    ],
  ])("%s: %s", (_, folder, want) => {
    expect(venuesNamedBy(folder, VENUES)).toEqual(want);
  });
});

describe("venuesNamedBy — the paper's own names", () => {
  it("a name that is also the paper's own is not reported, whichever venue declares it", () => {
    // A paper at a venue whose own chain also says "ACM CCS" (two workshops of one conference).
    expect(venuesNamedBy("ccs-acm-ccs", VENUES, ["ACM CCS"])).toEqual([]);
    expect(
      venuesNamedBy("aisec-2026", VENUES, ["aisec", "AISec 2026"]),
    ).toEqual([]);
  });

  it("own names compare by their words, not their spelling", () => {
    expect(
      venuesNamedBy("acsac-2026", VENUES, ["ACSAC", "acsac-2026"]),
    ).toEqual([]);
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
      JSON.stringify(
        venuePreset("dash", {
          extends: "paperlint:acm-sigconf",
          aliases: ["—"],
        }),
      ),
    );
    const venues = shippedFolderNames({ files: nodeFiles, venuesDir: dir });
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
    // The edition takes its year with it.
    ["realm-rules-aisec-2026", "rules"],
    ["--aisec--agents", "agents"],
    // Only numbers left: `2026` names no work.
    ["aisec-2026", null],
    ["aisec", null],
    // A venue glued to other words in one part is not cleanly taken out.
    ["aisec2026review-agents", null],
    // The edition glued to its year is one venue name, taken out whole.
    ["aisec2026-agents", "agents"],
    ["agent-rule-drift", "agent-rule-drift"],
  ])("%s → %s", (name, want) => {
    expect(withoutVenues(name, VENUES)).toBe(want);
  });
});
