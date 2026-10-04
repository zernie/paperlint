/**
 * `paper/folder-venue-leftover` — a paper folder named after a venue the paper no longer targets.
 *
 * A folder named `aisec-2026` reads as "the AISec paper" for as long as it exists; once the paper is
 * rejected and goes to another venue, the name is wrong and nothing says so. paperlint already knows
 * the venue a paper targets — its `paperlint.json` `extends` — and the names of every venue it ships
 * a preset for, so the stale case costs one comparison. The sibling of `tex/venue-leftover`, which
 * does the same for the text of the paper.
 *
 * ── WHAT IT READS ────────────────────────────────────────────────────────────────
 * The folder's name, as the path module gives it (the directory of the linted file), its words
 * against each shipped venue's label and `aliases` (`src/domain/venue-name.ts`). The venues are
 * `otherVenues` — the presets not on this paper's own chain, the same list `tex/venue-leftover`
 * reads — and the paper's own label and aliases are never reported.
 *
 * ── WHICH FILE IT REPORTS ON ─────────────────────────────────────────────────────
 * The folder itself is not a file ESLint lints. `PIPELINE-STATUS.md` is: every paper folder has one
 * (`paperlint lint` requires it, `paperlint new` writes it), whatever the paper's source format, so
 * the finding is made once per paper, on that file's first line, where a disable directive can
 * also sit.
 *
 * ── WHO SPEAKS WHEN THERE IS NOTHING TO JUDGE ───────────────────────────────────
 * No `paperlint.json`, no `extends`, or one that does not resolve: silent. With no venue chosen
 * there is no "other" venue, and `pdf/measured` and `pdf/profile` already speak about the rest. An
 * `extends` that names only a template family is silent too (`isFamily`).
 */
import { basename, dirname } from "node:path";
import { venuesNamedBy, type NamedIn } from "./domain/venue-name.ts";
import { paperPreset, type Preset } from "./presets.ts";
import { otherVenues, type OtherVenue } from "./tex-venue-rules.ts";
import type { Finding, VenueRuleDeps } from "./venue-rules.ts";

/** The file the rule reports on: one per paper folder. */
const STATUS_FILE = "PIPELINE-STATUS.md";

/** The slice of ESLint's rule context this rule uses: the file, its first line, and `report`. */
export interface FolderRuleContext {
  readonly filename: string;
  readonly sourceCode: {
    getLocFromIndex(index: number): Readonly<{ line: number; column: number }>;
  };
  report(d: {
    readonly loc: {
      readonly start: { line: number; column: number };
      readonly end: { line: number; column: number };
    };
    readonly messageId: string;
    readonly data: Readonly<Record<string, string | number>>;
  }): void;
}

export interface FolderRuleModule {
  readonly meta: {
    readonly type: "suggestion";
    readonly docs: { readonly description: string; readonly url: string };
    readonly schema: readonly object[];
    readonly messages: Readonly<Record<string, string>>;
  };
  create(context: FolderRuleContext): { root?: () => void };
}

/** A venue as the message names it: its label, and the alias when the folder used another name. */
const shown = (n: NamedIn): string =>
  n.name.toLowerCase() === n.venue.toLowerCase()
    ? n.venue
    : `${n.venue} («${n.name}»)`;

/**
 * Each other venue the folder name names, as a finding. Pure: the folder's name, the paper's
 * resolved preset, and the other shipped venues.
 */
export function judgeFolder(
  folder: string,
  preset: Pick<Preset, "label" | "aliases">,
  others: readonly OtherVenue[],
): readonly Finding[] {
  return venuesNamedBy(folder, others, [preset.label, ...preset.aliases]).map(
    (n) => ({
      messageId: "leftover",
      data: { folder, other: shown(n), venue: preset.label },
    }),
  );
}

/**
 * A template family (`acm-sigconf`, `ieee-conference`), as the preset declares itself (`"type":
 * "family"`), which a paper for a venue paperlint has no preset for extends directly. Such a paper
 * declares a format, not a venue, so a venue in its folder name may be its own: the accepted ACSAC
 * papers in `fixtures/accepted-papers/` extend `ieee-conference` from folders named `…-acsac24`, and
 * ACSAC is the parent conference `aidc` names as an alias.
 */
const isFamily = (preset: Preset): boolean => preset.identity.type === "family";

/** The findings for the paper folder `dir`; none when it has no resolved venue, or only a family. */
function findingsFor(dir: string, deps: VenueRuleDeps): readonly Finding[] {
  const p = paperPreset(dir, deps);
  if (p.kind !== "resolved" || isFamily(p.preset)) return [];
  const others = otherVenues(p.preset, deps);
  return judgeFolder(basename(dir), p.preset, others);
}

const META: FolderRuleModule["meta"] = {
  type: "suggestion",
  docs: {
    description:
      "the paper folder's name names a shipped venue other than the one the paper extends — a name left from an earlier submission",
    url: "https://github.com/zernie/paperlint/blob/main/docs/rules/paper/folder-venue-leftover.md",
  },
  schema: [],
  messages: {
    leftover:
      "the folder name «{{folder}}» names the venue {{other}}, and this paper extends {{venue}} — the name went stale when the venue changed, and venues change on every resubmission. Name the folder after the work (what the paper shows), not the venue",
  },
};

/** The rule, reading the paper's settings and the shipped presets through `deps`. */
export function folderVenueRules(
  deps: VenueRuleDeps,
): Readonly<Record<"folder-venue-leftover", FolderRuleModule>> {
  return {
    "folder-venue-leftover": {
      meta: META,
      create(context) {
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
export const FOLDER_VENUE_RULE_LEVELS: Readonly<
  Record<"paper/folder-venue-leftover", "warn">
> = { "paper/folder-venue-leftover": "warn" };
