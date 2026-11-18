#!/usr/bin/env node
/**
 * pipeline.ts — the skill pipeline, read from the skills themselves, checked, and drawn.
 *
 * Each `skills/<name>/SKILL.md.spec.ts` exports `flow`: its stage and three kinds of edge (see `Flow`),
 * as imports of other specs, so a misspelled or deleted skill fails the type-check. `skills/jobs.ts`
 * maps each job on a paper's text to its one owner. This script refuses a pipeline that:
 *
 *   1. has a skill folder whose spec exports no `flow`, or an edge to a skill that has no folder;
 *   2. has a cycle in the hands-to edges (calls and loops back may circle; they are not the path);
 *   3. hands to a skill of an earlier stage (that edge is a call or a loop back);
 *   4. has an edge to a skill the source's own SKILL.md never names;
 *   5. has a job with no owner, or an owner that is not a skill folder;
 *
 * and then writes `docs/pipeline.md`: an overview of the stages with the hand-offs and loops between
 * them, the router as text, and one small picture per stage whose boxes list the jobs a skill owns
 * and the skills it runs. `--check` writes nothing and fails when the file on disk differs.
 *
 * Run: `npm run pipeline` (write) · `node scripts/pipeline.ts --check` (also `test/pipeline.test.ts`)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DepGraph } from "dependency-graph";
import { chunk, groupBy, sortBy, uniqueBy } from "remeda";
import { z } from "zod";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { JOBS } from "../skills/jobs.ts";

/** The stages of `docs/skills.md`, in order. */
const STAGES = [
  "across",
  "idea",
  "venue",
  "study",
  "draft",
  "review",
  "submit",
  "camera-ready",
  "extend",
] as const;

export type Stage = (typeof STAGES)[number];

/** The title each stage's subgraph shows. */
const STAGE_TITLES: Readonly<Record<Stage, string>> = {
  across: "Across every stage",
  idea: "1 · Idea",
  venue: "2 · Venue",
  study: "3 · Study",
  draft: "4 · Draft",
  review: "5 · Review",
  submit: "6 · Submit",
  "camera-ready": "7 · Camera-ready",
  extend: "8 · Extend",
};

/** The stages drawn as pictures; `across` is the router, written as text. */
const PICTURED = STAGES.filter((st) => st !== "across");

/** What a skill spec's default export carries that this script reads. */
export interface SkillSpec {
  readonly name: string;
}

/**
 * The `flow` export of a skill spec. The lists are functions, so two specs may import each other.
 *
 * - `handsTo`: this skill is done, and the named skill is the next step on the main path;
 * - `calls`: this skill runs or delegates to the named skill as one of its own steps, or needs its
 *   output (an orchestrator or a gate running sub-skills);
 * - `loopsBackTo`: work is sent back to an earlier skill.
 */
export interface Flow {
  readonly stage: Stage;
  readonly handsTo: () => readonly SkillSpec[];
  readonly calls?: (() => readonly SkillSpec[]) | undefined;
  readonly loopsBackTo?: (() => readonly SkillSpec[]) | undefined;
}

/** A skill folder as read from disk: its name, its flow (if the spec exports one) and its SKILL.md. */
export interface Skill {
  readonly name: string;
  readonly flow: Flow | undefined;
  readonly text: string;
}

/** Job → owner spec; an owner may be missing only in a broken table. */
export type Jobs = Readonly<Record<string, SkillSpec | undefined>>;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join("docs", "pipeline.md");
const SPEC = "SKILL.md.spec.ts";

const CycleError = z.object({ cyclePath: z.array(z.string()) });
const isFunction = (v: unknown): v is () => unknown => typeof v === "function";
const SpecModule = z.object({
  default: z.object({ name: z.string() }),
  flow: z
    .object({
      stage: z.enum(STAGES),
      handsTo: z.custom<() => readonly SkillSpec[]>(isFunction),
      calls: z.custom<() => readonly SkillSpec[]>(isFunction).optional(),
      loopsBackTo: z.custom<() => readonly SkillSpec[]>(isFunction).optional(),
    })
    .optional(),
});

/** Every folder under `<root>/skills/` that holds a SKILL.md, with its spec's flow, sorted by name. */
export async function loadSkills(root: string): Promise<readonly Skill[]> {
  const dirs = readdirSync(join(root, "skills"), { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() && existsSync(join(root, "skills", e.name, "SKILL.md")),
    )
    .map((e) => e.name)
    .sort();
  return Promise.all(
    dirs.map(async (name) => {
      const dir = join(root, "skills", name);
      const mod = SpecModule.parse(
        await import(pathToFileURL(join(dir, SPEC)).href),
      );
      return {
        name: mod.default.name,
        flow: mod.flow,
        text: readFileSync(join(dir, "SKILL.md"), "utf8"),
      };
    }),
  );
}

const handsTo = (s: Skill): readonly string[] =>
  (s.flow?.handsTo() ?? []).map((t) => t.name);
const calls = (s: Skill): readonly string[] =>
  (s.flow?.calls?.() ?? []).map((t) => t.name);
const loopsBackTo = (s: Skill): readonly string[] =>
  (s.flow?.loopsBackTo?.() ?? []).map((t) => t.name);

/** Check 1: a folder whose spec exports no `flow`, and an arrow to a skill that has no folder. */
export function missing(skills: readonly Skill[]): string[] {
  const names = new Set(skills.map((s) => s.name));
  const arrows = (verb: string, of: (s: Skill) => readonly string[]) =>
    skills.flatMap((s) =>
      of(s)
        .filter((t) => !names.has(t))
        .map((t) => `"${s.name}" ${verb} "${t}", which is not a skill folder`),
    );
  return [
    ...skills
      .filter((s) => s.flow === undefined)
      .map((s) => `skills/${s.name}/${SPEC} exports no \`flow\``),
    ...arrows("hands to", handsTo),
    ...arrows("calls", calls),
    ...arrows("loops back to", loopsBackTo),
  ];
}

/** Check 2: the first cycle in the hands-to arrows, as a message naming its path; loops back excluded. */
export function findCycle(skills: readonly Skill[]): string | undefined {
  const graph = new DepGraph<string>({ circular: false });
  skills.forEach((s) => {
    graph.addNode(s.name);
  });
  skills.forEach((s) => {
    handsTo(s)
      .filter((t) => graph.hasNode(t))
      .forEach((t) => {
        graph.addDependency(s.name, t);
      });
  });
  try {
    graph.overallOrder();
    return undefined;
  } catch (e) {
    // `overallOrder` on a graph built only from `addNode` and `addDependency` between existing
    // nodes throws one thing: `DepGraphCycleError`, with the cycle's path.
    const { cyclePath } = CycleError.parse(e);
    return `cycle in handsTo: ${cyclePath.join(" → ")} (mark the edge that returns as loopsBackTo)`;
  }
}

/** The skill-name tokens of a text: runs of lowercase letters, digits and hyphens. */
const tokens = (text: string): ReadonlySet<string> =>
  new Set(text.split(/[^a-z0-9-]+/));

/** Check 4: an edge whose source's SKILL.md never names its target. One-way: data → text. */
export function unnamedTargets(skills: readonly Skill[]): string[] {
  return skills.flatMap((s) => {
    const named = tokens(s.text);
    return [
      ...handsTo(s).map((t) => ["hands to", t] as const),
      ...calls(s).map((t) => ["calls", t] as const),
      ...loopsBackTo(s).map((t) => ["loops back to", t] as const),
    ]
      .filter(([, t]) => !named.has(t))
      .map(
        ([verb, t]) =>
          `${s.name} ${verb} ${t}, but its SKILL.md never names it`,
      );
  });
}

/** An edge between two skills that both have a flow, with the stage of each end. */
interface Edge {
  readonly from: string;
  readonly to: string;
  readonly kind: "hands" | "loops";
  readonly fromStage: Stage;
  readonly toStage: Stage;
}

/** The hand-offs and loops back whose two ends are known; an unknown end is check 1's to report. */
function edges(skills: readonly Skill[]): readonly Edge[] {
  const stageOf = new Map(
    skills.flatMap((s) => (s.flow ? [[s.name, s.flow.stage] as const] : [])),
  );
  return skills.flatMap(({ name, flow }) => {
    const of = (kind: Edge["kind"], to: string): Edge[] => {
      const toStage = stageOf.get(to);
      return flow === undefined || toStage === undefined
        ? []
        : [{ from: name, to, kind, fromStage: flow.stage, toStage }];
    };
    return [
      ...(flow?.handsTo() ?? []).flatMap((t) => of("hands", t.name)),
      ...(flow?.loopsBackTo?.() ?? []).flatMap((t) => of("loops", t.name)),
    ];
  });
}

/** Check 3: a hand-off to a skill of an earlier stage; a call or a loop back may go there. */
export function handsBackwards(skills: readonly Skill[]): string[] {
  return edges(skills)
    .filter(
      (e) =>
        e.kind === "hands" &&
        STAGES.indexOf(e.toStage) < STAGES.indexOf(e.fromStage),
    )
    .map(
      (e) =>
        `${e.from} hands to ${e.to}, an earlier stage (${STAGE_TITLES[e.fromStage]} → ${STAGE_TITLES[e.toStage]}): use loopsBackTo or calls`,
    );
}

/** Check 5: a job with no owner, or an owner that is not a skill folder. */
export function jobProblems(jobs: Jobs, skills: readonly Skill[]): string[] {
  const names = new Set(skills.map((s) => s.name));
  return Object.entries(jobs).flatMap(([job, owner]) =>
    owner === undefined
      ? [`job "${job}" has no owner`]
      : names.has(owner.name)
        ? []
        : [
            `job "${job}" is owned by "${owner.name}", which is not a skill folder`,
          ],
  );
}

/** Every problem the four checks find, missing pieces first. */
export function problems(skills: readonly Skill[], jobs: Jobs): string[] {
  const cycle = findCycle(skills);
  return [
    ...missing(skills),
    ...(cycle === undefined ? [] : [cycle]),
    ...handsBackwards(skills),
    ...unnamedTargets(skills),
    ...jobProblems(jobs, skills),
  ];
}

/** A Mermaid id: `cold-read-diff` → `cold_read_diff` (a hyphen in an id can read as an arrow). */
const id = (name: string): string => name.replaceAll("-", "_");

/** The id of a stage's box; `stage_` keeps the stage `camera-ready` apart from the skill `camera-ready`. */
const stageId = (stage: Stage): string => `stage_${id(stage)}`;

/** A job key `find unclear sentences/the last edit` as a box line: `find unclear sentences (the last edit)`. */
const jobLine = (job: string): string => {
  const slash = job.indexOf("/");
  return slash < 0 ? job : `${job.slice(0, slash)} (${job.slice(slash + 1)})`;
};

/** Names three to a line, so a box or a label stays narrow. */
const wrap = (names: readonly string[]): string =>
  chunk(names, 3)
    .map((line) => line.join(", "))
    .join(",<br/>");

/** The arrow between two boxes: solid for a hand-off, dashed for a loop back. */
const arrow = (e: Edge, from: string, to: string, label?: string): string => {
  const solid = e.kind === "hands";
  return label === undefined
    ? `  ${from} ${solid ? "-->" : "-.->"} ${to}`
    : `  ${from} ${solid ? "--" : "-."} "${label}" ${solid ? "-->" : ".->"} ${to}`;
};

/** The skills of one stage, in name order. */
const inStage = (skills: readonly Skill[], stage: Stage): readonly Skill[] =>
  skills.filter((s) => s.flow?.stage === stage);

/** The overview: a box per stage, left to right, its skills listed; arrows only between stages. */
function overview(skills: readonly Skill[]): string[] {
  const between = uniqueBy(
    edges(skills).filter((e) => e.fromStage !== e.toStage),
    (e) => `${e.fromStage} ${e.toStage} ${e.kind}`,
  );
  // In stage order, hand-offs first: Mermaid places boxes in the order their edges come.
  const ordered = sortBy(
    between,
    (e) => e.kind,
    (e) => STAGES.indexOf(e.fromStage),
    (e) => STAGES.indexOf(e.toStage),
  );
  return [
    "flowchart LR",
    ...PICTURED.map(
      (st) =>
        `  ${stageId(st)}["<b>${STAGE_TITLES[st]}</b><br/>${inStage(skills, st)
          .map((s) => s.name)
          .join("<br/>")}"]`,
    ),
    ...ordered.map((e) => arrow(e, stageId(e.fromStage), stageId(e.toStage))),
  ];
}

/** A skill's box: its name, the jobs it owns, and the skills it runs. */
const box = (s: Skill, jobs: Jobs): string => {
  const owned = Object.entries(jobs)
    .filter(([, owner]) => owner?.name === s.name)
    .map(([job]) => jobLine(job));
  const runs = calls(s);
  return `  ${id(s.name)}["${[
    `<b>${s.name}</b>`,
    ...owned,
    ...(runs.length > 0 ? [`runs: ${wrap(runs)}`] : []),
  ].join("<br/>")}"]`;
};

/** One stage's picture: its skills, the arrows inside it, and one stub box per stage an arrow leaves for. */
function stagePicture(
  skills: readonly Skill[],
  jobs: Jobs,
  stage: Stage,
): string[] {
  const from = edges(skills).filter((e) => e.fromStage === stage);
  const leaving = from.filter((e) => e.toStage !== stage);
  const stub = (e: Edge) => `to_${stageId(e.toStage)}`;
  return [
    "flowchart TB",
    ...inStage(skills, stage).map((s) => box(s, jobs)),
    ...from
      .filter((e) => e.toStage === stage)
      .map((e) => arrow(e, id(e.from), id(e.to))),
    ...uniqueBy(leaving, (e) => e.toStage).map(
      (e) => `  ${stub(e)}(["→ ${STAGE_TITLES[e.toStage]}"])`,
    ),
    ...Object.values(
      groupBy(leaving, (e) => `${e.from} ${e.toStage} ${e.kind}`),
    ).map((group) =>
      arrow(
        group[0],
        id(group[0].from),
        stub(group[0]),
        wrap(group.map((e) => e.to)),
      ),
    ),
  ];
}

/** The skills of no single stage, as text: the router's calls would be one arrow per stage skill. */
function across(skills: readonly Skill[], jobs: Jobs): string[] {
  return inStage(skills, "across").map((s) => {
    const owned = Object.entries(jobs)
      .filter(([, owner]) => owner?.name === s.name)
      .map(([job]) => jobLine(job));
    const owns = owned.length > 0 ? ` (owns: ${owned.join("; ")})` : "";
    const runs = calls(s);
    return runs.length > 0
      ? `- \`${s.name}\`${owns} runs ${String(runs.length)} skills: ${runs.map((r) => `\`${r}\``).join(", ")}.`
      : `- \`${s.name}\`${owns}.`;
  });
}

const fence = (lines: readonly string[]): string[] => [
  "```mermaid",
  ...lines,
  "```",
];

/** The text above the pictures: what they are drawn from and what each kind of edge means. */
function intro(skills: readonly Skill[]): string[] {
  const count = (of: (s: Skill) => readonly string[]) =>
    String(skills.reduce((n, s) => n + of(s).length, 0));
  return [
    "# The skill pipeline",
    "",
    "<!-- Generated by `npm run pipeline` from each skill's `flow` export and `skills/jobs.ts`. Do not edit by hand. -->",
    "",
    "Who hands work to whom, read from the skills themselves: each `skills/<name>/SKILL.md.spec.ts`",
    "exports `flow`, and `skills/jobs.ts` names the one owner of each job on a paper's text. A flow",
    `has three kinds of edge: **hands to** (${count(handsTo)}), the next step on the main path, drawn`,
    `solid; **loops back to** (${count(loopsBackTo)}), work sent back to an earlier skill, drawn dashed;`,
    `**runs** (${count(calls)}), a skill this one runs as one of its own steps or whose output it needs,`,
    "written inside the box, never drawn. `test/pipeline.test.ts` fails on a cycle of hand-offs, a",
    "hand-off to an earlier stage, an edge the skill's own text never names, a job without an owner,",
    "and this file when it is stale. The stages are those of [`skills.md`](skills.md).",
  ];
}

/** `docs/pipeline.md`: what the pictures are, the overview, the router, then one picture per stage. */
export function render(skills: readonly Skill[], jobs: Jobs): string {
  return [
    ...intro(skills),
    "",
    "## The stages",
    "",
    "Each arrow stands for one or more edges between skills of the two stages.",
    "",
    ...fence(overview(skills)),
    "",
    "## Across every stage",
    "",
    ...across(skills, jobs),
    ...PICTURED.flatMap((st) => [
      "",
      `## ${STAGE_TITLES[st]}`,
      "",
      ...fence(stagePicture(skills, jobs, st)),
    ]),
    "",
  ].join("\n");
}

/** What `main` reads and writes through; a test replaces any of them. */
interface Deps {
  readonly root: string;
  readonly load: (root: string) => Promise<readonly Skill[]>;
  readonly jobs: Jobs;
  readonly log: (line: string) => void;
  readonly err: (line: string) => void;
}

const DEPS: Deps = {
  root: ROOT,
  load: loadSkills,
  jobs: JOBS,
  log: console.log,
  err: console.error,
};

/** `--check`: 0 when the file on disk is `text`, else 1 naming the fix. */
function compare(path: string, text: string, { log, err }: Deps): number {
  const current = existsSync(path) && readFileSync(path, "utf8") === text;
  if (current) log(`${OUT} is current`);
  else err(`${OUT} is stale: run npm run pipeline`);
  return current ? 0 : 1;
}

/** Write `docs/pipeline.md`, or with `--check` compare it. Refuses a broken pipeline either way. */
export async function main(
  argv: readonly string[],
  overrides: Partial<Deps> = {},
): Promise<number> {
  const deps = { ...DEPS, ...overrides };
  const skills = await deps.load(deps.root);
  const found = problems(skills, deps.jobs);
  found.forEach((p) => {
    deps.err(p);
  });
  if (found.length > 0) return 1;
  const text = render(skills, deps.jobs);
  const path = join(deps.root, OUT);
  if (argv.includes("--check")) return compare(path, text, deps);
  writeFileSync(path, text);
  deps.log(`wrote ${OUT}`);
  return 0;
}

// `isMain`, not a comparison with `file://${argv[1]}`: that is false through a symlink (consumer.mjs).
if (isMain(import.meta.url)) process.exit(await main(process.argv.slice(2)));
