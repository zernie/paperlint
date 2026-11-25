/**
 * revision-plan-core — what a paper's `revision-plan.json` says is left before it is submitted, read
 * the same way by every skill that reviews, tightens or judges the paper (#502): the plan's cycle
 * against the paper's current one, the bar, whether evidence is still being gathered, the venue's
 * scope from its preset, every row with its state, and one stop line.
 *
 * The plan is parsed by `RevisionPlanCodec` (src/ports/revision-plan-codec.ts), the paper's cycles by
 * `readPaperSettings`, its venue by `paperPreset`: nothing here re-parses what an owner parses. A row
 * closed by a rule (`by-rule`) is not judged here: this script runs no lint, so it names the rule and
 * `paperlint lint` decides it. No model, no network.
 *
 * Usage: node revision-plan.js <paper-dir>
 * Exit: 0 — the report (with or without a plan) · 1 — the plan or paperlint.json cannot be read ·
 * 2 — no paper folder named.
 */
import { join } from "node:path";
import { callerPath } from "#src/caller-path";
import type { Current } from "#src/domain/cycle";
import type { VenueScope } from "#src/domain/venue-scope";
import {
  REVISION_PLAN,
  type Bar,
  type Measurement,
  type PlanProblem,
  type RevisionPlan,
  type Row,
} from "#src/domain/revision-plan";
import type { Files } from "#src/ports/files";
import type { RevisionPlanCodec } from "#src/ports/revision-plan-codec";
import {
  paperPreset,
  unusablePresetLine,
  type PaperPreset,
} from "#src/presets";

/** What the script reads through. */
export interface Deps {
  readonly files: Files;
  readonly codec: RevisionPlanCodec;
  /** The package's presets directory (`presetsDir()`). */
  readonly venuesDir: string;
}

/** The plan file, as far as the script can read it. */
export type PlanRead =
  | { readonly kind: "none" }
  | { readonly kind: "unreadable"; readonly problems: readonly PlanProblem[] }
  | { readonly kind: "read"; readonly plan: RevisionPlan };

/** Where the plan stands against the paper's cycles. */
export type CycleFit =
  /** `paperlint.json` keeps no `cycles`: nothing to hold the plan's cycle against. */
  | { readonly kind: "no-cycles" }
  | { readonly kind: "current" }
  | { readonly kind: "stale"; readonly current: string }
  /** No open attempt: the paper is accepted, between venues, or has no cycle yet. */
  | { readonly kind: "no-open-cycle" };

/** The plan's cycle held against the paper's current attempt. Pure. */
export const cycleFit = (
  plan: RevisionPlan,
  current: Current | null,
): CycleFit => {
  if (current === null) return { kind: "no-cycles" };
  if (current.kind !== "cycle") return { kind: "no-open-cycle" };
  return current.cycle.id === plan.cycle
    ? { kind: "current" }
    : { kind: "stale", current: current.cycle.id };
};

/** The plan file of the paper in `dir`, read and parsed. */
export const readPlan = (dir: string, deps: Deps): PlanRead => {
  const bytes = deps.files.readBytes(callerPath(join(dir, REVISION_PLAN)));
  if (bytes === null) return { kind: "none" };
  const parsed = deps.codec.parse(new TextDecoder().decode(bytes));
  return parsed.ok
    ? { kind: "read", plan: parsed.plan }
    : { kind: "unreadable", problems: parsed.problems };
};

const barLine = (b: Bar): string => {
  switch (b.kind) {
    case "corpus":
      return `bar: the accepted papers of ${b.series}, ${b.editions.join(", ")}`;
    case "proxy":
      return `bar: the accepted papers of ${b.series}, standing in for ${b.stands_in_for}`;
    case "none":
      return `bar: none — ${b.why}`;
  }
};

const measurementLine = (m: Measurement): string =>
  m.kind === "open"
    ? "measurement: open — new evidence may still be added"
    : `measurement: enough since ${m.since} (${m.evidence}) — no new study, only the text`;

const fitLine = (plan: RevisionPlan, fit: CycleFit): string => {
  const head = `plan: ${plan.cycle}, written ${plan.written}`;
  switch (fit.kind) {
    case "current":
      return `${head} · the current cycle`;
    case "stale":
      return `${head} · the current cycle is ${fit.current} — rewrite the plan for it`;
    case "no-open-cycle":
      return `${head} · the paper has no open cycle`;
    case "no-cycles":
      return `${head} · paperlint.json keeps no cycles to hold it against`;
  }
};

/** The scope lines: the call's sentences verbatim, from the paper's venue preset. */
export const scopeLines = (p: PaperPreset): readonly string[] => {
  switch (p.kind) {
    case "none":
      return ["scope: no venue — paperlint.json names no preset"];
    case "resolved":
      return p.preset.scope === null
        ? [
            `scope: none recorded — ${p.preset.id} has no \`scope\` in its preset (add-venue)`,
          ]
        : scopeOf(p.preset.scope);
    case "settings-problem":
    case "preset-problem":
      return [];
  }
};

const scopeOf = (s: VenueScope): readonly string[] => [
  `scope: ${s.url} (read ${s.read})`,
  ...s.sentences.map((t) => `  > ${t}`),
  ...(s.topics.length === 0
    ? []
    : ["  topics:", ...s.topics.map((t) => `    - ${t}`)]),
];

const STATE_WIDTH = 8;

/** One row: its id, state, what it asks, and what closes it. */
export const rowLine = (r: Row): string => {
  const head = `${r.id} ${r.state.padEnd(STATE_WIDTH)} ${r.what}`;
  switch (r.state) {
    case "todo":
    case "doing":
      return head;
    case "done":
      return `${head} — evidence: ${r.evidence}`;
    case "dropped":
      return `${head} — ${r.kind}: ${r.reason}`;
    case "by-rule":
      return `${head} — closed when paperlint lint reports nothing for ${r.rule}`;
  }
};

/** Whether the list is closed, as far as the plan alone can say. */
export type Stop =
  | { readonly kind: "met" }
  | {
      readonly kind: "not-met";
      readonly open: readonly string[];
      readonly byRule: readonly string[];
    };

/** The stop verdict over the rows: met when nothing is open; `by-rule` rows are lint's to decide. Pure. */
export const stopOf = (rows: readonly Row[]): Stop => {
  const open = rows
    .filter((r) => r.state === "todo" || r.state === "doing")
    .map((r) => r.id);
  const byRule = rows.filter((r) => r.state === "by-rule").map((r) => r.id);
  return open.length === 0 && byRule.length === 0
    ? { kind: "met" }
    : { kind: "not-met", open, byRule };
};

const stopLine = (s: Stop): string => {
  if (s.kind === "met") return "stop: met — every row is done or dropped";
  const parts = [
    ...(s.open.length === 0 ? [] : [`open ${s.open.join(" ")}`]),
    ...(s.byRule.length === 0
      ? []
      : [`paperlint lint decides ${s.byRule.join(" ")}`]),
  ];
  return `stop: not met — ${parts.join(" · ")}`;
};

/** The rows added after the plan was written: growth of the list, which its reader sees. Pure. */
export const addedAfter = (plan: RevisionPlan): readonly string[] =>
  plan.remaining.filter((r) => r.added > plan.written).map((r) => r.id);

/** What the command prints, and its exit code. */
export interface Report {
  readonly code: number;
  readonly lines: readonly string[];
}

/** The report when the paper has no plan. */
const noPlan = (dir: string, scope: readonly string[]): Report => ({
  code: 0,
  lines: [
    `plan: none written — ${join(dir, REVISION_PLAN)} does not exist`,
    ...scope,
    "stop: no plan — nothing says what is left",
  ],
});

/** The report when the plan does not parse: each problem at its field. */
const unreadable = (dir: string, problems: readonly PlanProblem[]): Report => ({
  code: 1,
  lines: [
    `plan: unreadable — ${join(dir, REVISION_PLAN)}`,
    ...problems.map(
      (p) =>
        `  ${p.path.length === 0 ? "(the file)" : p.path.join(".")}: ${p.message}`,
    ),
    "stop: unreadable — fix the plan first",
  ],
});

/** The report for the paper in `dir`. */
export const report = (dir: string, deps: Deps): Report => {
  const preset = paperPreset(callerPath(dir), deps);
  if (preset.kind === "settings-problem")
    return { code: 1, lines: [unusablePresetLine(dir, preset)] };
  const read = readPlan(dir, deps);
  const scope = scopeLines(preset);
  switch (read.kind) {
    case "none":
      return noPlan(dir, scope);
    case "unreadable":
      return unreadable(dir, read.problems);
    case "read":
      return { code: 0, lines: planLines(read.plan, preset, scope) };
  }
};

const growthLine = (grown: readonly string[]): string =>
  grown.length === 0
    ? "rows added after the plan was written: 0"
    : `rows added after the plan was written: ${String(grown.length)} (${grown.join(" ")})`;

const planLines = (
  plan: RevisionPlan,
  preset: Exclude<PaperPreset, { readonly kind: "settings-problem" }>,
  scope: readonly string[],
): readonly string[] => {
  const fit = cycleFit(plan, preset.settings?.cycles?.current ?? null);
  return [
    fitLine(plan, fit),
    barLine(plan.bar),
    measurementLine(plan.measurement),
    growthLine(addedAfter(plan)),
    ...(preset.kind === "preset-problem"
      ? [`scope: unknown — ${unusablePresetLine("", preset)}`]
      : scope),
    ...plan.remaining.map(rowLine),
    fit.kind === "stale"
      ? `stop: unknown — the plan is for ${plan.cycle}, not ${fit.current}`
      : stopLine(stopOf(plan.remaining)),
  ];
};

/** Where the command writes. */
export interface Output {
  readonly out: (s: string) => void;
  readonly err: (s: string) => void;
}

/** Run the command on `argv`; the exit code. */
export function main(
  argv: readonly string[],
  deps: Deps,
  { out, err }: Output,
): number {
  const [arg] = argv;
  if (arg === undefined) {
    err("usage: node revision-plan.js <paper-dir>\n");
    return 2;
  }
  const r = report(arg, deps);
  (r.code === 0 ? out : err)(`${r.lines.join("\n")}\n`);
  return r.code;
}
