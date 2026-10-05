/**
 * THE CYCLE RULES over a paper's settings file — the `cycle` plugin, judged once per paper on its
 * `PIPELINE-STATUS.md` (every paper folder has one, whatever its source format; `paper/folder-venue-leftover`
 * reports there for the same reason):
 *
 *   cycle/record    error  `cycles` in paperlint.json parses and names one current attempt: no two
 *                          open cycles, the open one last, ids unique, every deadline an instant
 *                          with its zone; each source's deadlines in order; no portal reading the
 *                          venue's preset already carries
 *   cycle/evidence  error  every closed cycle's `outcome.evidence`, and every deadline override's
 *                          `evidence`, is a file in the paper folder
 *
 * ── WHY ERROR, NOT WARN ───────────────────────────────────────────────────────────
 * A warning is read once and never again. Each of these names a state that cannot be worked in:
 * two open cycles is dual submission or a decision nobody recorded; a deadline without its zone is
 * the mistake the record exists to prevent; a decision or an override whose evidence is not in the
 * folder is a claim with nothing behind it. Nothing here depends on a clock or the network — the
 * record is judged against itself, the installed venue preset and the disk, like `paper/stages`.
 *
 * ── THE PRESET'S READINGS ARE DERIVED, NOT COPIED ──────────────────────────────────
 * A cycle whose venue is a preset gets that preset's `deadlines` (the portal's readings, refreshed in
 * the package); the paper adds the call's readings and its overrides. A paper's own portal reading
 * of a deadline the preset carries is a second copy of one fact, and it drifts the day the preset is
 * updated — so it is reported.
 *
 * ── WHO SPEAKS WHEN THERE IS NOTHING TO JUDGE ──────────────────────────────────────
 * No `paperlint.json`, one that is not JSON, or one without `cycles` (the flat form): silent — the
 * flat form is still valid, and `pdf/profile` says when the whole file is broken. A `cycles` that
 * does not parse, or names no current attempt (two open cycles), never reaches this rule through
 * `paperlint lint`: `paperRuleBlocks` (src/cli.ts) refuses the settings file before ESLint runs, one
 * line naming the file and the problem, exit 2 — the same strictness as an unknown key (measured
 * 2026-10-05). The `broken` message below is what the rule says when a host runs it without that
 * refusal; under the CLI only `order` is reachable.
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  cycleProblemText,
  cyclesOf,
  parseCycles,
  type Cycle,
  type Cycles,
} from "./domain/cycle.ts";
import { deadlineOrderProblems, type Reading } from "./domain/deadline.ts";
import { resolvePreset } from "./presets.ts";
import { fieldOf } from "./domain/record.ts";
import { err, ok, type Result } from "./domain/result.ts";
import type {
  FolderRuleContext,
  FolderRuleModule,
} from "./folder-venue-rule.ts";
import type { Finding, VenueRuleDeps } from "./venue-rules.ts";
import { rulePageUrl } from "./venue-rules.ts";
import { CONFIG_FILE } from "#lib/paper-config";

const STATUS_FILE = "PIPELINE-STATUS.md";

export type CycleRuleName = "record" | "evidence";

/** The `cycles` value of the paper's settings file; undefined when there is no file, no JSON, or no key. */
function cyclesValue(dir: string, deps: VenueRuleDeps): unknown {
  const bytes = deps.files.readBytes(callerPath(join(dir, CONFIG_FILE)));
  if (bytes === null) return undefined;
  try {
    return fieldOf(JSON.parse(new TextDecoder().decode(bytes)), "cycles");
  } catch {
    return undefined;
  }
}

/** The paper's cycles, parsed and consistent, or the one line that says what is wrong. */
export function readCycles(
  dir: string,
  deps: VenueRuleDeps,
): Result<Cycles | null, string> {
  const list = parseCycles(cyclesValue(dir, deps));
  if (!list.ok) return list;
  if (list.value === null) return ok(null);
  const cycles = cyclesOf(list.value);
  return cycles.ok ? cycles : err(cycleProblemText(cycles.error));
}

/** A cycle's venue preset — its spec, as the cycle names it — and the readings it carries. */
export interface PresetOfCycle {
  readonly spec: string;
  readonly readings: readonly Reading[];
}

/** The preset of a cycle; null for a named venue or a preset that does not resolve. */
export type PresetReadings = (c: Cycle) => PresetOfCycle | null;

/** A paper's portal readings of deadlines its venue's preset already carries. */
function presetCopies(c: Cycle, preset: PresetOfCycle): readonly Finding[] {
  return c.deadlines.flatMap((d) => {
    const theirs = preset.readings.find(
      (r) => r.what === d.what && r.source === "portal",
    );
    const ours = d.observed.some((o) => o.source === "portal");
    return theirs !== undefined && ours
      ? [
          {
            messageId: "presetCopy",
            data: {
              id: c.id,
              what: d.what,
              preset: preset.spec,
              at: theirs.at,
              read: theirs.read,
            },
          },
        ]
      : [];
  });
}

/** `cycle/record`: the record's own problems. Pure over the read and the presets' readings. */
export function judgeRecord(
  read: Result<Cycles | null, string>,
  presetReadings: PresetReadings,
): readonly Finding[] {
  if (!read.ok) return [{ messageId: "broken", data: { why: read.error } }];
  if (read.value === null) return [];
  return read.value.list.flatMap((c) => {
    const preset = presetReadings(c);
    return [
      ...deadlineOrderProblems(c.deadlines, preset?.readings ?? []).map(
        (why) => ({ messageId: "order", data: { id: c.id, why } }),
      ),
      ...(preset === null ? [] : presetCopies(c, preset)),
    ];
  });
}

/** The overrides whose evidence is not on disk. */
const overrideEvidence = (
  c: Cycle,
  isFile: (relative: string) => boolean,
): readonly Finding[] =>
  c.deadlines.flatMap((d) =>
    d.override !== null && !isFile(d.override.evidence)
      ? [
          {
            messageId: "overrideMissing",
            data: {
              id: c.id,
              what: d.what,
              at: d.override.at,
              evidence: d.override.evidence,
            },
          },
        ]
      : [],
  );

/** The closed cycles, and the overrides, whose evidence is not on disk. */
export function judgeEvidence(
  cycles: readonly Cycle[],
  isFile: (relative: string) => boolean,
): readonly Finding[] {
  return cycles.flatMap((c) => {
    const o = c.outcome;
    return [
      ...(o.kind !== "open" && !isFile(o.evidence)
        ? [
            {
              messageId: "missing",
              data: {
                id: c.id,
                outcome: o.kind,
                date: o.date,
                evidence: o.evidence,
              },
            },
          ]
        : []),
      ...overrideEvidence(c, isFile),
    ];
  });
}

const META: Readonly<Record<CycleRuleName, FolderRuleModule["meta"]>> = {
  record: {
    type: "suggestion",
    docs: {
      description:
        "the paper's `cycles` record parses and names one current attempt, each source's deadlines in order, no copy of the preset's portal readings",
      url: rulePageUrl("cycle/record"),
    },
    schema: [],
    messages: {
      broken: `${CONFIG_FILE}: {{why}}`,
      order: `${CONFIG_FILE}, cycle «{{id}}»: {{why}} — a date typed wrong, or an AoE day miscounted (write a call's date as "YYYY-MM-DD AoE" and paperlint converts it)`,
      presetCopy: `${CONFIG_FILE}, cycle «{{id}}»: the "{{what}}" deadline records a portal reading, and the preset {{preset}} carries the portal's reading of it ({{at}}, read {{read}}) — a second copy drifts when paperlint updates the preset: delete this one (the call's reading and an override stay)`,
    },
  },
  evidence: {
    type: "suggestion",
    docs: {
      description:
        "every closed cycle's decision, and every deadline override, points at a file in the paper folder — the mail, the reviews, the note",
      url: rulePageUrl("cycle/evidence"),
    },
    schema: [],
    messages: {
      missing:
        "cycle «{{id}}» is {{outcome}} ({{date}}) with evidence `{{evidence}}`, which is not in the paper folder — save the decision mail, the reviews or the note that records the decision there, or correct the path",
      overrideMissing:
        'cycle «{{id}}»: the override of the "{{what}}" deadline ({{at}}) rests on `{{evidence}}`, which is not in the paper folder — save the mail or the page that grants it there, or correct the path',
    },
  },
};

/** Each cycle's venue preset's readings, resolved from the paper's settings file like `extends`. */
const presetReadingsOf =
  (dir: string, deps: VenueRuleDeps): PresetReadings =>
  (c) => {
    if (c.venue.kind !== "preset") return null;
    const spec = c.venue.extends;
    const p = resolvePreset(spec, join(dir, CONFIG_FILE), deps);
    return p.ok ? { spec, readings: p.value.deadlines } : null;
  };

/** The findings of one rule for the paper folder `dir`. */
function findingsFor(
  name: CycleRuleName,
  dir: string,
  deps: VenueRuleDeps,
): readonly Finding[] {
  const read = readCycles(dir, deps);
  switch (name) {
    case "record":
      return judgeRecord(read, presetReadingsOf(dir, deps));
    case "evidence":
      return read.ok && read.value !== null
        ? judgeEvidence(read.value.list, (rel) =>
            deps.files.isFile(callerPath(join(dir, rel))),
          )
        : [];
  }
}

function rule(name: CycleRuleName, deps: VenueRuleDeps): FolderRuleModule {
  return {
    meta: META[name],
    create(context: FolderRuleContext) {
      if (basename(context.filename) !== STATUS_FILE) return {};
      return {
        root() {
          const at = context.sourceCode.getLocFromIndex(0);
          findingsFor(name, dirname(context.filename), deps).forEach((f) => {
            context.report({ loc: { start: at, end: at }, ...f });
          });
        },
      };
    },
  };
}

/** The `cycle` plugin's rules over the settings file, for every paper's `PIPELINE-STATUS.md`. */
export function cycleRules(
  deps: VenueRuleDeps,
): Readonly<Record<CycleRuleName, FolderRuleModule>> {
  return { record: rule("record", deps), evidence: rule("evidence", deps) };
}

/** The level each `cycle/*` rule on PIPELINE-STATUS.md is on at in paperlint's own config — `stage` too (eslint-rules/cycle-stage.ts). */
export const CYCLE_RULE_LEVELS: Readonly<
  Record<`cycle/${CycleRuleName | "stage"}`, "error">
> = {
  "cycle/record": "error",
  "cycle/evidence": "error",
  "cycle/stage": "error",
};
