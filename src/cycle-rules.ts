/**
 * THE CYCLE RULES over a paper's settings file — the `cycle` plugin, judged once per paper on its
 * `PIPELINE-STATUS.md` (every paper folder has one, whatever its source format; `paper/folder-venue-leftover`
 * reports there for the same reason):
 *
 *   cycle/record    error  `cycles` in paperlint.json parses and names one current attempt: no two
 *                          open cycles, the open one last, ids unique, every deadline an instant
 *                          with its zone, the deadlines in order
 *   cycle/evidence  error  every closed cycle's `outcome.evidence` is a file in the paper folder
 *
 * ── WHY ERROR, NOT WARN ───────────────────────────────────────────────────────────
 * A warning is read once and never again. Each of these names a state that cannot be worked in:
 * two open cycles is dual submission or a decision nobody recorded; a deadline without its zone is
 * the mistake the record exists to prevent; a decision whose evidence is not in the folder is a
 * claim with nothing behind it. Nothing here depends on a clock or the network — the record is judged
 * against itself and against the disk, like `paper/stages`.
 *
 * ── WHO SPEAKS WHEN THERE IS NOTHING TO JUDGE ──────────────────────────────────────
 * No `paperlint.json`, one that is not JSON, or one without `cycles` (the flat form): silent — the
 * flat form is still valid, and `pdf/profile` says when the whole file is broken. A `cycles` that
 * does not parse is reported HERE, on every paper, including the markdown ones `pdf/*` never sees.
 */
import { basename, dirname, join } from "node:path";
import { callerPath } from "./caller-path.ts";
import {
  cycleProblemText,
  cyclesOf,
  deadlineOrderProblems,
  parseCycles,
  type Cycle,
  type Cycles,
} from "./domain/cycle.ts";
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

/** `cycle/record`: the record's own problems. Pure over the read. */
export function judgeRecord(
  read: Result<Cycles | null, string>,
): readonly Finding[] {
  if (!read.ok) return [{ messageId: "broken", data: { why: read.error } }];
  if (read.value === null) return [];
  return read.value.list.flatMap((c) =>
    deadlineOrderProblems(c.deadlines).map((why) => ({
      messageId: "order",
      data: { id: c.id, why },
    })),
  );
}

/** The closed cycles whose evidence is not on disk. */
export function judgeEvidence(
  cycles: readonly Cycle[],
  isFile: (relative: string) => boolean,
): readonly Finding[] {
  return cycles.flatMap((c) => {
    const o = c.outcome;
    return o.kind !== "open" && !isFile(o.evidence)
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
      : [];
  });
}

const META: Readonly<Record<CycleRuleName, FolderRuleModule["meta"]>> = {
  record: {
    type: "suggestion",
    docs: {
      description:
        "the paper's `cycles` record parses and names one current attempt, its deadlines instants in order",
      url: rulePageUrl("cycle/record"),
    },
    schema: [],
    messages: {
      broken: `${CONFIG_FILE}: {{why}}`,
      order: `${CONFIG_FILE}, cycle «{{id}}»: {{why}} — a date typed wrong, or an AoE day miscounted (write the call's date as "YYYY-MM-DD AoE" and let paperlint convert it)`,
    },
  },
  evidence: {
    type: "suggestion",
    docs: {
      description:
        "every closed cycle's decision points at a file in the paper folder — the mail, the reviews, the note",
      url: rulePageUrl("cycle/evidence"),
    },
    schema: [],
    messages: {
      missing:
        "cycle «{{id}}» is {{outcome}} ({{date}}) with evidence `{{evidence}}`, which is not in the paper folder — save the decision mail, the reviews or the note that records the decision there, or correct the path",
    },
  },
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
      return judgeRecord(read);
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
