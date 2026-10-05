/**
 * `cycle/stage` — a declared stage names the ATTEMPT it belongs to, and that attempt exists.
 *
 * With `cycles` in the paper's `paperlint.json`, a `stages` entry in the scorecard's frontmatter
 * says `cycle: <id>` instead of a free `venue:` string: the venue's name is then the cycle's
 * preset's, spelled once, and a consumer can tell which rows of the scorecard belong to which
 * attempt. Three things can be wrong, each an error:
 *
 *   noCycle        `cycles` is declared and a stage names no `cycle`
 *   unknownCycle   the stage's `cycle` is no declared cycle's id
 *   porting        a `submitted` or `camera-ready` stage in a cycle whose phase is still `porting` —
 *                  a PDF was sent while the record says the source is in the previous venue's template
 *
 * Without `cycles` (the flat form) the rule is silent: `venue:` stays what it was. The settings file
 * is read here only for the cycles' ids and phases; `cycle/record` (src/cycle-rules.ts) judges the
 * whole record.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { load } from "js-yaml";
import { z } from "zod";
import type { RuleContext } from "./rule-context.ts";

const SETTINGS_FILE = "paperlint.json";

/** What this rule reads of a cycle: its id and phase. `cycle/record` parses the rest. */
const CycleHead = z.looseObject({
  id: z.string(),
  phase: z.string().optional(),
});
const Settings = z.looseObject({
  cycles: z.array(CycleHead.catch({ id: "" })).optional(),
});
const Frontmatter = z.looseObject({ stages: z.unknown().optional() }).catch({});
const Stage = z
  .looseObject({
    stage: z.unknown().optional(),
    cycle: z.unknown().optional(),
    date: z.unknown().optional(),
  })
  .catch({});

/** The stages that send a PDF to the venue: a cycle still porting cannot have one. */
const SENT: readonly string[] = ["submitted", "camera-ready"];

interface Head {
  readonly id: string;
  readonly phase: string;
}

/** The declared cycles' heads, or null when the paper has no `cycles` (or no readable settings). */
function cyclesOf(dir: string): readonly Head[] | null {
  const file = join(dir, SETTINGS_FILE);
  if (!existsSync(file)) return null;
  try {
    const s = Settings.safeParse(JSON.parse(readFileSync(file, "utf8")));
    return s.success && s.data.cycles !== undefined
      ? s.data.cycles.map((c) => ({ id: c.id, phase: c.phase ?? "prepared" }))
      : null;
  } catch {
    return null;
  }
}

const text = (v: unknown): string =>
  typeof v === "string" ? v : v === undefined ? "" : JSON.stringify(v);

/** A YAML date without quotes is a `Date`; shown as the day it names, as `paper/stages` does. */
const dateText = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : text(v);

interface Finding {
  readonly messageId: "noCycle" | "unknownCycle" | "porting";
  readonly data: Readonly<Record<string, string>>;
}

/** Each stage against the declared cycles. Pure. */
export function judgeStages(
  stages: readonly unknown[],
  cycles: readonly Head[],
): readonly Finding[] {
  const known = cycles.map((c) => c.id).join(" · ") || "(none)";
  return stages.flatMap((entry): readonly Finding[] => {
    const s = Stage.parse(entry);
    const stage = text(s.stage);
    const date = dateText(s.date);
    if (s.cycle === undefined)
      return [{ messageId: "noCycle", data: { stage, date, known } }];
    const id = text(s.cycle);
    const cycle = cycles.find((c) => c.id === id);
    if (cycle === undefined)
      return [{ messageId: "unknownCycle", data: { stage, date, id, known } }];
    return SENT.includes(stage) && cycle.phase === "porting"
      ? [{ messageId: "porting", data: { stage, date, id } }]
      : [];
  });
}

export default {
  rules: {
    stage: {
      meta: {
        type: "problem" as const,
        docs: {
          description:
            "with `cycles` declared, every stage names the cycle it belongs to, and no PDF is sent from a cycle still porting",
          url: "https://github.com/zernie/paperlint/blob/main/docs/rules/cycle/stage.md",
        },
        schema: [],
        messages: {
          noCycle:
            "the «{{stage}}» stage ({{date}}) names no `cycle` — this paper declares `cycles` in paperlint.json, so each stage says which attempt it belongs to: `cycle: <id>`, one of {{known}}",
          unknownCycle:
            "the «{{stage}}» stage ({{date}}) names the cycle «{{id}}», which paperlint.json does not declare — the declared ids: {{known}}",
          porting:
            "the «{{stage}}» stage ({{date}}) belongs to the cycle «{{id}}», whose phase is still `porting`: a PDF was sent while the record says the source is in the previous venue's template. Finish the port and drop the phase, or the stage is wrong",
        },
      },
      create(context: RuleContext) {
        const cycles = cyclesOf(dirname(context.filename));
        if (cycles === null) return {};
        return {
          yaml(node: { readonly value?: string }) {
            const data = ((): unknown => {
              try {
                return load(node.value ?? "");
              } catch {
                return undefined; // `paper/stages` reports the unreadable YAML
              }
            })();
            const stages = Frontmatter.parse(data).stages;
            if (!Array.isArray(stages)) return;
            judgeStages(stages, cycles).forEach((f) => {
              context.report({ node, messageId: f.messageId, data: f.data });
            });
          },
        };
      },
    },
  },
};
