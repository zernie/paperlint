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

const AIDC = { extends: "paperlint:aidc", kind: "regular" };

describe("paper/folder-venue-leftover — the folder names another venue", () => {
  it("a folder named after the venue the paper left is reported, naming both and the cure", () => {
    expect(lint("aisec-2026", AIDC)).toEqual([
      {
        messageId: "leftover",
        line: 1,
        message:
          "the folder name «aisec-2026» names the venue AISec, and this paper extends AIDC — the name went stale when the venue changed, and venues change on every resubmission. Name the folder after the work (what the paper shows), not the venue",
      },
    ]);
  });

  it("a venue named by an alias says which alias", () => {
    expect(
      lint("acm-ccs-agents", AIDC).map(
        (r) => /names the venue (.*?), and/u.exec(r.message)?.[1],
      ),
    ).toEqual(["AISec («ACM CCS»)"]);
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
        venuePreset("AISec 2027", { extends: "paperlint:aisec" }),
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
              venuePreset("venue", { extends: "paperlint:aisec" }),
            ),
          },
        },
      ),
    ).toEqual([]);
  });
});

describe("paper/folder-venue-leftover — silent", () => {
  it.each<[string, string, object | undefined]>([
    [
      "the folder names the paper's own venue",
      "agenticdev-2026",
      { extends: "paperlint:agenticdev", kind: "short" },
    ],
    ["by its alias", "acsac-2026", AIDC],
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
    // extending ieee-conference, while `aidc` names ACSAC, its parent conference, as an alias.
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
