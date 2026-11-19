/**
 * `paper/edition-over` (warn) — the paper extends an edition whose every deadline has passed.
 *
 * A venue preset is one edition (`paperlint:icse-2028`), and a series is never an alias for the
 * latest one, so a paper keeps its edition until its settings say otherwise. When every deadline the
 * edition's preset records is in the past, the edition is over: the paper was submitted, or it is
 * aimed at a cycle that has closed. The rule says so once per paper, and names the newer editions
 * of the same series that paperlint ships, so moving to one is a one-line change of `extends`.
 *
 * ── WHERE "NOW" COMES FROM ───────────────────────────────────────────────────────
 * The clock is a dependency (`now`, an ISO instant), read at the edge (`src/cli.ts`, as `paperlint
 * versions` reads it) and fixed in tests; nothing here reads the clock itself.
 *
 * ── WHO SPEAKS WHEN THERE IS NOTHING TO JUDGE ───────────────────────────────────
 * No `paperlint.json`, no `extends`, or one that does not resolve: silent, as for
 * `paper/folder-venue-leftover`. An edition whose preset records no deadline: silent — nothing
 * says when it ends.
 */
import { basename, dirname } from "node:path";
import { sortBy } from "remeda";
import { editionLabel, editionOf, editionsOf } from "./domain/edition.ts";
import type { Reading } from "./domain/deadline.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import {
  paperPreset,
  shippedPresets,
  shippedSpec,
  type Preset,
} from "./presets.ts";
import type { Finding, VenueRuleDeps } from "./venue-rules.ts";

/** The file the rule reports on: one per paper folder. */
const STATUS_FILE = "PIPELINE-STATUS.md";

export interface EditionRuleDeps extends VenueRuleDeps {
  /** The current instant, ISO 8601 in UTC (`2026-11-19T10:00:00.000Z`). */
  readonly now: () => string;
}

/**
 * The finding for an edition all of whose deadlines are before `now`, or none. `shipped` is every
 * shipped preset's id: the newer editions of the series are named from it. Pure.
 */
export function judgeEdition(
  preset: Pick<Preset, "id" | "label" | "year" | "deadlines">,
  now: string,
  shipped: readonly string[],
): readonly Finding[] {
  const last = sortBy(preset.deadlines, (d: Reading) => Date.parse(d.at)).at(
    -1,
  );
  if (last === undefined || Date.parse(last.at) >= Date.parse(now)) return [];
  const series = editionOf(preset.id)?.series ?? null;
  const newer =
    series === null || preset.year === null
      ? []
      : editionsOf(series, shipped).filter(
          (id) => (editionOf(id)?.year ?? 0) > (preset.year ?? 0),
        );
  const data = {
    venue: editionLabel(preset.label, preset.year),
    what: last.what,
    at: last.at,
  };
  return newer.length === 0
    ? [{ messageId: "overNoNewer", data }]
    : [
        {
          messageId: "over",
          data: { ...data, newer: newer.map(shippedSpec).join(", ") },
        },
      ];
}

/** The finding for the paper folder `dir`; none when it has no resolved preset. */
function findingsFor(dir: string, deps: EditionRuleDeps): readonly Finding[] {
  const p = paperPreset(dir, deps);
  return p.kind === "resolved"
    ? judgeEdition(p.preset, deps.now(), shippedPresets(deps.venuesDir))
    : [];
}

const META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "every deadline of the edition the paper extends has passed: the edition is over",
    url: "https://github.com/zernie/paperlint/blob/main/docs/rules/paper/edition-over.md",
  },
  schema: [],
  messages: {
    over: '{{venue}} is over: every deadline its preset records has passed, the last ({{what}}) at {{at}}. paperlint ships a newer edition: {{newer}} — if the paper goes there, point "extends" at it',
    overNoNewer:
      '{{venue}} is over: every deadline its preset records has passed, the last ({{what}}) at {{at}}. paperlint ships no newer edition of it yet; if the paper goes elsewhere, point "extends" at that venue',
  },
};

/** The rule, reading the paper's settings, the shipped presets and the clock through `deps`. */
export function editionRules(
  deps: EditionRuleDeps,
): Readonly<Record<"edition-over", FolderRuleModule>> {
  return {
    "edition-over": {
      meta: META,
      create(context: FolderRuleContext) {
        if (basename(context.filename) !== STATUS_FILE) return {};
        return {
          root() {
            const at = context.sourceCode.getLocFromIndex(0);
            findingsFor(dirname(context.filename), deps).forEach((f) => {
              context.report({ loc: { start: at, end: at }, ...f });
            });
          },
        };
      },
    },
  };
}

/** The level it is on at in paperlint's own config, for every paper's `PIPELINE-STATUS.md`. */
export const EDITION_RULE_LEVELS: Readonly<
  Record<"paper/edition-over", "warn">
> = { "paper/edition-over": "warn" };
