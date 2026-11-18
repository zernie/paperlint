/**
 * THE SKILL PIPELINE IS DATA, AND IT CANNOT DRIFT.
 *
 * Each `skills/<name>/SKILL.md.spec.ts` exports `flow`: its stage, the skills it hands work to, and
 * the skills it loops back to, as imports of their specs. `skills/jobs.ts` maps each job on a paper's
 * text to its one owner spec. `scripts/pipeline.ts` draws both into `docs/pipeline.md`. Each check
 * below fires on a planted defect and stays quiet on the real skills.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { JOBS } from "../skills/jobs.ts";
import {
  findCycle,
  jobProblems,
  loadSkills,
  main,
  missing,
  render,
  unnamedTargets,
  type Skill,
} from "../scripts/pipeline.ts";
import { useTempDir, writeTree } from "./support.ts";

const ROOT = join(import.meta.dirname, "..");
const REAL = await loadSkills(ROOT);

/** A planted skill: `handsTo` and `loopsBackTo` name other planted skills, `text` is its SKILL.md. */
function planted(
  spec: Readonly<
    Record<
      string,
      { hands?: readonly string[]; loops?: readonly string[]; text?: string }
    >
  >,
): readonly Skill[] {
  const byName = (n: string) => ({ name: n });
  return Object.entries(spec).map(([name, s]) => ({
    name,
    text: s.text ?? `# ${name}\n`,
    flow: {
      stage: "draft",
      handsTo: () => (s.hands ?? []).map(byName),
      loopsBackTo: () => (s.loops ?? []).map(byName),
    },
  }));
}

/** What `main` printed, and its exit code. */
async function run(
  argv: readonly string[],
  deps: Parameters<typeof main>[1],
): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, {
    ...deps,
    log: (l) => out.push(l),
    err: (l) => err.push(l),
  });
  return { code, out, err };
}

describe("(a) every skill folder declares its flow, and nothing it names is missing", () => {
  it("the real skills: one per folder with a SKILL.md, each with a flow", () => {
    // Guards: a wrong directory would make every check below pass on an empty list.
    expect(REAL.length).toBeGreaterThan(10);
    expect(REAL.filter((s) => s.flow === undefined)).toEqual([]);
    expect(missing(REAL)).toEqual([]);
  });

  it("a folder whose spec exports no flow fails by name", async () => {
    const root = useTempDir("pipeline-noflow-");
    writeTree(root, {
      "skills/lonely-skill/SKILL.md": "# lonely-skill\n",
      "skills/lonely-skill/SKILL.md.spec.ts":
        'export default { name: "lonely-skill" };\n',
      "skills/no-skill-here/notes.txt": "not a skill: no SKILL.md\n",
    });
    const skills = await loadSkills(root);
    expect(skills).toEqual([
      { name: "lonely-skill", text: "# lonely-skill\n", flow: undefined },
    ]);
    expect(missing(skills)).toEqual([
      "skills/lonely-skill/SKILL.md.spec.ts exports no `flow`",
    ]);
  });

  it("a handover to a skill that has no folder fails by name", () => {
    expect(missing(planted({ "a-skill": { hands: ["gone-skill"] } }))).toEqual([
      '"a-skill" hands to "gone-skill", which is not a skill folder',
    ]);
    expect(missing(planted({ "a-skill": { loops: ["gone-skill"] } }))).toEqual([
      '"a-skill" loops back to "gone-skill", which is not a skill folder',
    ]);
  });
});

describe("(b) the hands-to arrows form no cycle; loops back are excluded", () => {
  it("the real skills have none", () => {
    expect(findCycle(REAL)).toBeUndefined();
  });

  it("a planted cycle fails with its path", () => {
    const skills = planted({
      "a-skill": { hands: ["b-skill"] },
      "b-skill": { hands: ["c-skill"] },
      "c-skill": { hands: ["a-skill"] },
    });
    expect(findCycle(skills)).toBe(
      "cycle in handsTo: a-skill → b-skill → c-skill → a-skill (mark the edge that returns as loopsBackTo)",
    );
  });

  it("the same arrows with the returning one as a loop back are clean", () => {
    const skills = planted({
      "a-skill": { hands: ["b-skill"] },
      "b-skill": { hands: ["c-skill"] },
      "c-skill": { loops: ["a-skill"] },
    });
    expect(findCycle(skills)).toBeUndefined();
  });
});

describe("(c) docs/pipeline.md is the generator's output", () => {
  it("on disk it equals a fresh generation", () => {
    expect(readFileSync(join(ROOT, "docs/pipeline.md"), "utf8")).toBe(
      render(REAL, JOBS),
    );
  });

  it("run as a program, --check passes on the real repository", () => {
    const r = spawnSync(
      process.execPath,
      [join(ROOT, "scripts/pipeline.ts"), "--check"],
      { encoding: "utf8" },
    );
    expect({ status: r.status, stderr: r.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
  });

  it("a stale file fails --check; writing it makes --check pass", async () => {
    const root = useTempDir("pipeline-stale-");
    writeTree(root, { "docs/pipeline.md": "# an old diagram\n" });
    const deps = { root, load: () => Promise.resolve(REAL), jobs: JOBS };
    expect(await run(["--check"], deps)).toEqual({
      code: 1,
      out: [],
      err: ["docs/pipeline.md is stale: run npm run pipeline"],
    });
    expect(await run([], deps)).toEqual({
      code: 0,
      out: ["wrote docs/pipeline.md"],
      err: [],
    });
    expect(readFileSync(join(root, "docs/pipeline.md"), "utf8")).toBe(
      render(REAL, JOBS),
    );
    expect(await run(["--check"], deps)).toEqual({
      code: 0,
      out: ["docs/pipeline.md is current"],
      err: [],
    });
  });

  it("a missing file fails --check", async () => {
    const root = useTempDir("pipeline-none-");
    const deps = { root, load: () => Promise.resolve(REAL), jobs: JOBS };
    expect((await run(["--check"], deps)).code).toBe(1);
  });
});

describe("main refuses a broken pipeline", () => {
  it("before anything is written", async () => {
    const root = useTempDir("pipeline-broken-");
    const skills = planted({
      "a-skill": { hands: ["b-skill"], text: "b-skill" },
      "b-skill": { hands: ["a-skill"], text: "a-skill" },
    });
    const deps = { root, load: () => Promise.resolve(skills), jobs: {} };
    expect(await run([], deps)).toEqual({
      code: 1,
      out: [],
      err: [
        "cycle in handsTo: a-skill → b-skill → a-skill (mark the edge that returns as loopsBackTo)",
      ],
    });
    expect(() => readFileSync(join(root, "docs/pipeline.md"))).toThrow();
  });
});

describe("(d) a handover the handing skill's own text never names", () => {
  it("the real skills name every skill they hand to or loop back to", () => {
    expect(unnamedTargets(REAL)).toEqual([]);
  });

  it("a planted handover fails, and a name inside a longer name does not count", () => {
    const skills = planted({
      "a-skill": {
        hands: ["b-skill"],
        loops: ["c-skill"],
        text: "Hand the rows to `b-skill-two`. Then run c-skill again.",
      },
      "b-skill": {},
      "c-skill": {},
    });
    expect(unnamedTargets(skills)).toEqual([
      "a-skill hands to b-skill, but its SKILL.md never names it",
    ]);
  });
});

describe("(e) every job has one owner, and the owner is a skill", () => {
  it("the real jobs", () => {
    expect(Object.keys(JOBS).length).toBeGreaterThan(5);
    expect(jobProblems(JOBS, REAL)).toEqual([]);
  });

  it("a job with no owner, and a job owned by no skill folder, fail by name", () => {
    expect(
      jobProblems(
        { "find typos": undefined, "count pages": { name: "page-counter" } },
        REAL,
      ),
    ).toEqual([
      'job "find typos" has no owner',
      'job "count pages" is owned by "page-counter", which is not a skill folder',
    ]);
  });
});
