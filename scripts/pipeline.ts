#!/usr/bin/env node
/**
 * pipeline.ts — the skill pipeline, read from the skills themselves, checked, and drawn.
 *
 * Each `skills/<name>/SKILL.md.spec.ts` exports `flow`: its stage, the skills its text hands work to
 * (`handsTo`), and the skills it sends work back to (`loopsBackTo`), as imports of their specs, so a
 * misspelled or deleted skill fails the type-check. `skills/jobs.ts` maps each job on a paper's text
 * to its one owner. This script refuses a pipeline that:
 *
 *   1. has a skill folder whose spec exports no `flow`, or names a skill that has no folder;
 *   2. has a cycle in the hands-to arrows (a loop back is drawn, but not followed);
 *   3. hands to a skill the handing skill's own SKILL.md never names;
 *   4. has a job with no owner, or an owner that is not a skill folder;
 *
 * and then writes `docs/pipeline.md` (a Mermaid flowchart, a box per skill grouped by stage, each
 * box listing the jobs it owns). `--check` writes nothing and fails when the file on disk differs.
 *
 * Run: `npm run pipeline` (write) · `node scripts/pipeline.ts --check` (also `test/pipeline.test.ts`)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DepGraph, type DepGraphCycleError } from "dependency-graph";
import { z } from "zod";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { JOBS } from "../skills/jobs.ts";

/** The stages of `docs/skills.md`, in order, with the title each subgraph shows. */
const STAGE_TITLES = {
  across: "Across every stage",
  idea: "1 · Idea",
  venue: "2 · Venue",
  study: "3 · Study",
  draft: "4 · Draft",
  review: "5 · Review",
  submit: "6 · Submit",
  "camera-ready": "7 · Camera-ready",
  extend: "8 · Extend",
} as const;

export type Stage = keyof typeof STAGE_TITLES;
const STAGES = Object.keys(STAGE_TITLES) as readonly Stage[];

/** What a skill spec's default export carries that this script reads. */
export interface SkillSpec {
  readonly name: string;
}

/** The `flow` export of a skill spec. The lists are functions, so two specs may import each other. */
export interface Flow {
  readonly stage: Stage;
  readonly handsTo: () => readonly SkillSpec[];
  readonly loopsBackTo?: () => readonly SkillSpec[];
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

const isFunction = (v: unknown): v is () => unknown => typeof v === "function";
const SpecModule = z.object({
  default: z.object({ name: z.string() }),
  flow: z
    .object({
      stage: z.enum(STAGES as [Stage, ...Stage[]]),
      handsTo: z.custom<() => readonly SkillSpec[]>(isFunction),
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
const loopsBackTo = (s: Skill): readonly string[] =>
  (s.flow?.loopsBackTo?.() ?? []).map((t) => t.name);

/** Check 1: a folder whose spec exports no `flow`, and an arrow to a skill that has no folder. */
export function missing(skills: readonly Skill[]): string[] {
  const names = new Set(skills.map((s) => s.name));
  const arrows = (verb: string, of: (s: Skill) => readonly string[]) =>
    skills.flatMap((s) =>
      of(s)
        .filter((t) => !names.has(t))
        .map(
          (t) => `"${s.name}" ${verb} "${t}", which is not a skill folder`,
        ),
    );
  return [
    ...skills
      .filter((s) => s.flow === undefined)
      .map((s) => `skills/${s.name}/${SPEC} exports no \`flow\``),
    ...arrows("hands to", handsTo),
    ...arrows("loops back to", loopsBackTo),
  ];
}

/** Check 2: the first cycle in the hands-to arrows, as a message naming its path; loops back excluded. */
export function findCycle(skills: readonly Skill[]): string | undefined {
  const graph = new DepGraph<string>({ circular: false });
  skills.forEach((s) => graph.addNode(s.name));
  skills.forEach((s) =>
    handsTo(s)
      .filter((t) => graph.hasNode(t))
      .forEach((t) => graph.addDependency(s.name, t)),
  );
  try {
    graph.overallOrder();
    return undefined;
  } catch (e) {
    // `overallOrder` on a graph built only from `addNode` and `addDependency` between existing
    // nodes throws one thing: the cycle, with its path.
    const { cyclePath } = e as DepGraphCycleError;
    return `cycle in handsTo: ${cyclePath.join(" → ")} (mark the edge that returns as loopsBackTo)`;
  }
}

/** The skill-name tokens of a text: runs of lowercase letters, digits and hyphens. */
const tokens = (text: string): ReadonlySet<string> =>
  new Set(text.split(/[^a-z0-9-]+/));

/** Check 3: an arrow whose source's SKILL.md never names its target. One-way: data → text. */
export function unnamedTargets(skills: readonly Skill[]): string[] {
  return skills.flatMap((s) => {
    const named = tokens(s.text);
    return [
      ...handsTo(s).map((t) => ["hands to", t] as const),
      ...loopsBackTo(s).map((t) => ["loops back to", t] as const),
    ]
      .filter(([, t]) => !named.has(t))
      .map(([verb, t]) => `${s.name} ${verb} ${t}, but its SKILL.md never names it`);
  });
}

/** Check 4: a job with no owner, or an owner that is not a skill folder. */
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
    ...unnamedTargets(skills),
    ...jobProblems(jobs, skills),
  ];
}

/** A Mermaid id: `cold-read-diff` → `cold_read_diff` (a hyphen in an id can read as an arrow). */
const id = (name: string): string => name.replaceAll("-", "_");

/** A job key `find unclear sentences/the last edit` as a box line: `find unclear sentences (the last edit)`. */
const jobLine = (job: string): string => {
  const [what, scope] = job.split("/");
  return scope === undefined ? job : `${what} (${scope})`;
};

/** `docs/pipeline.md`: a subgraph per stage, a box per skill with its jobs, then the arrows. */
export function render(skills: readonly Skill[], jobs: Jobs): string {
  const owned = (name: string) =>
    Object.entries(jobs)
      .filter(([, owner]) => owner?.name === name)
      .map(([job]) => jobLine(job));
  const box = (s: Skill) =>
    `    ${id(s.name)}["${[`<b>${s.name}</b>`, ...owned(s.name)].join("<br/>")}"]`;
  const inStage = (stage: Stage) =>
    skills.filter((s) => s.flow?.stage === stage);
  const groups = STAGES.filter((stage) => inStage(stage).length > 0).flatMap(
    (stage) => [
      `  subgraph ${id(stage)}["${STAGE_TITLES[stage]}"]`,
      ...inStage(stage).map(box),
      "  end",
    ],
  );
  const arrows = skills.flatMap((s) => [
    ...handsTo(s).map((t) => `  ${id(s.name)} --> ${id(t)}`),
    ...loopsBackTo(s).map((t) => `  ${id(s.name)} -.-> ${id(t)}`),
  ]);
  const count = (of: (s: Skill) => readonly string[]) =>
    String(skills.reduce((n, s) => n + of(s).length, 0));
  return [
    "# The skill pipeline",
    "",
    "<!-- Generated by `npm run pipeline` from each skill's `flow` export and `skills/jobs.ts`. Do not edit by hand. -->",
    "",
    "Who hands work to whom, read from the skills themselves: each `skills/<name>/SKILL.md.spec.ts`",
    "exports `flow` (its stage, the skills its text hands work to, the skills it sends work back to),",
    "and `skills/jobs.ts` names the one owner of each job on a paper's text, listed in its box.",
    `A solid arrow hands work on (${count(handsTo)}); a dashed arrow loops back to a skill that runs earlier (${count(loopsBackTo)}).`,
    "`test/pipeline.test.ts` fails on a cycle of solid arrows, an arrow the skill's own text never",
    "names, a job without an owner, and this file when it is stale. The stages are those of",
    "[`skills.md`](skills.md).",
    "",
    "```mermaid",
    "flowchart TB",
    ...groups,
    ...arrows,
    "```",
    "",
  ].join("\n");
}

/** Write `docs/pipeline.md`, or with `--check` compare it. Refuses a broken pipeline either way. */
export async function main(
  argv: readonly string[],
  {
    root = ROOT,
    load = loadSkills,
    jobs = JOBS,
    log = console.log,
    err = console.error,
  }: {
    root?: string;
    load?: (root: string) => Promise<readonly Skill[]>;
    jobs?: Jobs;
    log?: (line: string) => void;
    err?: (line: string) => void;
  } = {},
): Promise<number> {
  const skills = await load(root);
  const found = problems(skills, jobs);
  if (found.length > 0) {
    found.forEach((p) => err(p));
    return 1;
  }
  const text = render(skills, jobs);
  const path = join(root, OUT);
  if (argv.includes("--check")) {
    const current = existsSync(path) && readFileSync(path, "utf8") === text;
    if (current) log(`${OUT} is current`);
    else err(`${OUT} is stale: run npm run pipeline`);
    return current ? 0 : 1;
  }
  writeFileSync(path, text);
  log(`wrote ${OUT}`);
  return 0;
}

// `isMain`, not a comparison with `file://${argv[1]}`: that is false through a symlink (consumer.mjs).
if (isMain(import.meta.url)) process.exit(await main(process.argv.slice(2)));
