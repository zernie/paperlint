/**
 * A paper with one study of a given mode, held in memory, and `paperlint studies <sub>` run over it
 * with a stand-in for git — what the tests of `gate` and of the index's mode columns share.
 *
 * The stand-in git answers `committed` from a table of states, by absolute path, and `order` with one
 * set of facts for every study.
 */
import { memoryFiles, memoryListDir } from "../src/adapters/memory/index.ts";
import { studyRegistryCodec } from "../src/adapters/study-registry/index.ts";
import type { DecideFirst, StudyMode } from "../src/domain/study-mode.ts";
import {
  planText,
  registryText,
  type Study,
  type StudyPlan,
} from "../src/domain/study-registry.ts";
import type {
  Committed,
  GitHistory,
  GitOrder,
  OrderFacts,
} from "../src/ports/git-history.ts";
import { runStudies, type StudiesArgs } from "../src/studies.ts";

export const DIR = "/work/papers/example";
export const S = `${DIR}/repro/P1-S01-outcome`;
export const SHA = "f".repeat(40);
export const DATE = "2026-10-16T15:23:00+05:00";

/** The study decided before its run: one output, its decision beside its plan. */
export const DECIDED: DecideFirst = {
  kind: "decide_before_run",
  outputs: ["RESULTS.md"],
  decision: { file: "repro/P1-S01-outcome/decision.md", note: "exclusions" },
};

export const planOf = (mode: StudyMode | undefined): StudyPlan => ({
  question: "Does the hint help?",
  population: { source: "tasks", draw: { kind: "all", method: "census" } },
  arms: [],
  primary_outcome: "pass rate",
  author_check: null,
  mode,
});

export const ROW: Study = {
  id: "P1-S01",
  folder: "P1-S01-outcome",
  title: "Outcome",
  question: "q?",
  kind: "measurement",
  status: "running",
  date: "2026-10-01",
  in_paper: "no",
  plan: "plan.json",
};

/** A paper with the study, its plan, and `extra`. */
export const tree = (
  extra: Readonly<Record<string, string>> = {},
  plan: StudyPlan = planOf(DECIDED),
  row: Study = ROW,
): Record<string, string> => ({
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/repro/studies.json`]: registryText({ prefix: "P1", studies: [row] }),
  [`${S}/README.md`]: "# outcome\n",
  [`${S}/plan.json`]: planText(plan),
  ...extra,
});

const dec = (b: Uint8Array): string => new TextDecoder().decode(b);

/**
 * git answering from `table` (absolute path → state; a path not in it was never committed), and with
 * `order` for every study's history.
 */
export const fakeGit = (
  table: Readonly<Record<string, Committed>>,
  order: OrderFacts = { kind: "unknown", why: "no history in this test" },
): GitHistory & GitOrder => ({
  committed: (_paper, file) => table[file] ?? { kind: "not-committed" },
  order: () => order,
});

/** `studies <sub> papers/example <id>` over `t`: the exit code, what it printed, and the files after. */
export function studies(
  sub: string,
  t: Readonly<Record<string, string>>,
  over: Partial<StudiesArgs> = {},
  o: {
    readonly git?: Readonly<Record<string, Committed>>;
    readonly order?: OrderFacts;
  } = {},
) {
  const files = memoryFiles(t);
  const log: string[] = [];
  const errs: string[] = [];
  const code = runStudies(
    {
      sub,
      paperDir: "papers/example",
      title: "P1-S01",
      extra: [],
      kind: null,
      ...over,
    },
    {
      files,
      listDir: memoryListDir(files),
      codec: studyRegistryCodec,
      cwd: "/work",
      today: "2026-10-16",
      git: fakeGit(o.git ?? {}, o.order),
      log: (l) => log.push(l),
      err: (l) => errs.push(l),
    },
  );
  const after = Object.fromEntries([...files.map].map(([k, v]) => [k, dec(v)]));
  return { code, log, err: errs, after };
}
