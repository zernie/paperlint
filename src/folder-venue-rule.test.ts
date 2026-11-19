/**
 * `paper/folder-venue-leftover` (`src/folder-venue-rule.ts`) on papers held in memory beside the
 * SHIPPED presets, so the venue names come from the registry a user gets. Both halves: a folder
 * named after another venue than the paper's `extends` is reported once, on the scorecard's first
 * line; a folder named after the paper's own venue, or after no venue, is not.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryFiles } from "./adapters/memory/index.ts";
import { presetsDir } from "./package-dirs.ts";
import {
  FOLDER_VENUE_RULE_LEVELS,
  folderVenueRules,
} from "./folder-venue-rule.ts";
import { venuePreset } from "../test/support.ts";

const VENUES = presetsDir();
const PAPERS = "/work/papers";
const shipped = Object.fromEntries(
  readdirSync(VENUES)
    .filter((f) => f.endsWith(".jsonc") || f.endsWith(".json"))
    .map((f) => [join(VENUES, f), readFileSync(join(VENUES, f))]),
);

interface Reported {
  readonly messageId: string;
  readonly message: string;
  readonly line: number;
}

/**
 * The rule over one paper folder's file, the way ESLint runs it: `create`, then `root`. `settings`
 * is the paper's paperlint.json (absent: no file); `extra` more files, by absolute path.
 */
function lint(
  folder: string,
  settings: object | undefined,
  {
    file = "PIPELINE-STATUS.md",
    extra = {},
  }: { file?: string; extra?: Record<string, string> } = {},
): Reported[] {
  const dir = `${PAPERS}/${folder}`;
  const files = memoryFiles({
    ...shipped,
    ...(settings === undefined
      ? {}
      : { [`${dir}/paperlint.json`]: JSON.stringify(settings) }),
    ...extra,
  });
  const rule = folderVenueRules({ files, venuesDir: VENUES })[
    "folder-venue-leftover"
  ];
  const out: Reported[] = [];
  const visitor = rule.create({
    filename: `${dir}/${file}`,
    sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
    report: (d) => {
      const template = rule.meta.messages[d.messageId] ?? "";
      const message = Object.entries(d.data).reduce(
        (m, [k, v]) => m.split(`{{${k}}}`).join(String(v)),
        template,
      );
      out.push({ messageId: d.messageId, message, line: d.loc.start.line });
    },
  });
  visitor.root?.();
  return out;
}

const AIDC = { extends: "paperlint:aidc-2026", kind: "regular" };

describe("paper/folder-venue-leftover — the folder names another venue", () => {
  it("a folder named after the venue the paper left is reported, naming both and the cure", () => {
    expect(lint("aisec-2026", AIDC)).toEqual([
      {
        messageId: "leftover",
        line: 1,
        message:
          "the folder name «aisec-2026» names the venue AISec 2026, and this paper extends AIDC — the name went stale when the venue changed, and venues change on every resubmission. Name the folder after the work (what the paper shows), not the venue",
      },
    ]);
  });

  it("a venue named by an alias says which alias", () => {
    expect(
      lint("emnlp-agents", AIDC).map(
        (r) => /names the venue (.*?), and/u.exec(r.message)?.[1],
      ),
    ).toEqual(["EMNLP"]);
  });

  it("two other venues are two findings", () => {
    expect(
      lint("realm-then-aisec", AIDC).map(
        (r) => /names the venue (\w+)/u.exec(r.message)?.[1],
      ),
    ).toEqual(["AISec", "REALM"]);
  });

  it("a project's own preset is judged like a shipped one: its label and aliases are its own", () => {
    const extra = {
      [`${PAPERS}/aidc-redux/venue.jsonc`]: JSON.stringify(
        venuePreset("AISec Redux", { extends: "paperlint:aisec-2026" }),
      ),
    };
    // Its chain is AISec's, so aisec is its own; aidc is another venue.
    expect(
      lint(
        "aidc-redux",
        { extends: "./venue.jsonc", kind: "short" },
        { extra },
      ),
    ).toHaveLength(1);
    expect(
      lint(
        "aisec-redux",
        { extends: "./venue.jsonc", kind: "short" },
        {
          extra: {
            [`${PAPERS}/aisec-redux/venue.jsonc`]: JSON.stringify(
              venuePreset("venue", { extends: "paperlint:aisec-2026" }),
            ),
          },
        },
      ),
    ).toEqual([]);
  });
});

describe("paper/folder-venue-leftover — a venue is named by its edition", () => {
  it("«fse-2027-…» is reported; a folder about FSE papers is not", () => {
    expect(
      lint("fse-2027-flaky", AIDC).map(
        (r) => /names the venue (.*?), and/u.exec(r.message)?.[1],
      ),
    ).toEqual(["FSE 2027"]);
    expect(lint("fse-replication", AIDC)).toEqual([]);
  });

  it("🔴 a name that is an ordinary word counts only as the edition: «agent-2027-…», not «agent-…»", () => {
    const named = (folder: string, settings: object = AIDC) =>
      lint(folder, settings).map(
        (r) => /names the venue (.*?), and/u.exec(r.message)?.[1],
      );
    expect(named("agent-2027-study")).toEqual(["AGENT 2027"]);
    expect(named("agent-study")).toEqual([]);
  });

  it("🔴 another edition of its own series is another venue: «icse-2027-…» under ICSE 2028", () => {
    const ICSE = { extends: "paperlint:icse-2028", kind: "research" };
    expect(
      lint("icse-2027-flaky", ICSE).map(
        (r) => /names the venue (.*?), and/u.exec(r.message)?.[1],
      ),
    ).toEqual(["ICSE 2027"]);
    expect(lint("icse-2028-flaky", ICSE)).toEqual([]);
  });
});

describe("paper/folder-venue-leftover — NeurIPS, named by its edition", () => {
  it("🔴 «neurips-2026-…» is reported in another venue's paper; «neurips-…» without the year is not, nor under neurips-2026", () => {
    expect(
      lint("neurips-2026-diffusion", AIDC).map(
        (r) => /names the venue (.*?), and/u.exec(r.message)?.[1],
      ),
    ).toEqual(["NeurIPS 2026"]);
    expect(lint("neurips-diffusion", AIDC)).toEqual([]);
    expect(
      lint("neurips-2026-diffusion", {
        extends: "paperlint:neurips-2026",
        kind: "main",
      }),
    ).toEqual([]);
  });
});

describe("paper/folder-venue-leftover — AAAI, named by its edition", () => {
  it("🔴 «aaai-2027-…» is reported in another venue's paper; «aaai-…» without the year is not, nor under aaai-2027", () => {
    expect(
      lint("aaai-2027-planning", AIDC).map(
        (r) => /names the venue (.*?), and/u.exec(r.message)?.[1],
      ),
    ).toEqual(["AAAI 2027"]);
    expect(lint("aaai-planning", AIDC)).toEqual([]);
    expect(
      lint("aaai-2027-planning", {
        extends: "paperlint:aaai-2027",
        kind: "main",
      }),
    ).toEqual([]);
  });
});

describe("paper/folder-venue-leftover — ICML, named by its edition", () => {
  it("🔴 «icml-2027-…» is reported in another venue's paper; «icml-…» without the year is not, nor under icml-2027", () => {
    expect(
      lint("icml-2027-diffusion", AIDC).map(
        (r) => /names the venue (.*?), and/u.exec(r.message)?.[1],
      ),
    ).toEqual(["ICML 2027"]);
    expect(lint("icml-diffusion", AIDC)).toEqual([]);
    expect(
      lint("icml-2027-diffusion", {
        extends: "paperlint:icml-2027",
        kind: "main",
      }),
    ).toEqual([]);
  });
});

describe("paper/folder-venue-leftover — a workshop's parent conference", () => {
  it("🔴 in another venue's paper it is reported once, as itself", () => {
    const named = (folder: string) =>
      lint(folder, AIDC).map(
        (r) => /names the venue (.*?), and/u.exec(r.message)?.[1],
      );
    expect(named("acm-ccs-agents")).toEqual(["ACM CCS"]);
    expect(named("ase-agents")).toEqual(["ASE"]);
    // An alias that is not the start of the edition's name says which alias it was.
    expect(named("oakland-attacks")).toEqual(["IEEE S&P 2027 («Oakland»)"]);
  });
});

describe("paper/folder-venue-leftover — silent", () => {
  it.each<[string, string, object | undefined]>([
    [
      "the folder names the paper's own venue",
      "agenticdev-2026",
      { extends: "paperlint:agenticdev-2026", kind: "short" },
    ],
    ["by its parent conference's edition", "acsac-2026", AIDC],
    ["by its own edition", "aidc-2026", AIDC],
    [
      "the conference the workshop is held at (`parent`)",
      "ase-agents",
      { extends: "paperlint:agenticdev-2026", kind: "short" },
    ],
    [
      "the parent conference by its two words",
      "acm-ccs-agents",
      { extends: "paperlint:aisec-2026", kind: "research" },
    ],
    ["the folder names no venue", "agent-rule-drift", AIDC],
    // Whole words only: REALM is not inside these.
    ["a venue's name inside another word", "overrealm-realms", AIDC],
    ["no paperlint.json: no venue to compare with", "aisec-2026", undefined],
    ["no extends yet", "aisec-2026", { extends: null }],
    [
      "an extends that does not resolve — pdf/profile says so",
      "aisec-2026",
      { extends: "paperlint:nope" },
    ],
  ])("%s", (_, folder, settings) => {
    expect(lint(folder, settings)).toEqual([]);
  });

  it("a paperlint.json that does not parse — pdf/profile says so", () => {
    expect(
      lint("aisec-2026", undefined, {
        extra: { [`${PAPERS}/aisec-2026/paperlint.json`]: "{ not json" },
      }),
    ).toEqual([]);
  });

  it("judged once per paper, on PIPELINE-STATUS.md only", () => {
    expect(lint("aisec-2026", AIDC, { file: "paper.tex" })).toEqual([]);
  });

  it("a paper on a bare template family declares no venue: a venue in its folder may be its own", () => {
    // The accepted ACSAC papers in fixtures/accepted-papers/ are exactly this: `…-acsac24` folders
    // extending ieee-conference, while ACSAC is a shipped venue, the parent conference of AIDC.
    expect(
      lint("secure-acsac24", { extends: "paperlint:ieee-conference" }),
    ).toEqual([]);
    expect(lint("aisec-2026", { extends: "paperlint:acm-sigconf" })).toEqual(
      [],
    );
  });
});

it("the level: a warning — a rename is the author's call", () => {
  expect(FOLDER_VENUE_RULE_LEVELS).toEqual({
    "paper/folder-venue-leftover": "warn",
  });
});
