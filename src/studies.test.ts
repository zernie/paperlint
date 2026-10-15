/**
 * `paperlint studies new|index <paper-dir>` (`src/studies.ts`) on paper folders held in memory. Both
 * halves: each command writes exactly the files it promises, and a run that cannot do what it was
 * asked writes nothing and says why, with the exit code (2 for the command line, 1 for the paper's
 * state).
 */
import { describe, expect, it } from "vitest";
import { memoryFiles, memoryListDir } from "./adapters/memory/index.ts";
import { studyRegistryCodec } from "./adapters/study-registry/index.ts";
import {
  indexBlock,
  registryText,
  studyReadme,
  withIndex,
  type Study,
  type StudyRegistry,
} from "./domain/study-registry.ts";
import { runStudies, type StudiesArgs } from "./studies.ts";

const CWD = "/work";
const DIR = "/work/papers/example";
const REPRO = `${DIR}/repro`;

const study = (over: Partial<Study> = {}): Study => ({
  id: "P1-S01",
  folder: "P1-S01-baseline",
  title: "Baseline",
  question: "q?",
  kind: "measurement",
  status: "done",
  date: "2026-10-01",
  result: "41 of 60",
  result_file: "r.tsv",
  in_paper: "yes",
  role: "counted",
  ...over,
});

const P1 = (...studies: Study[]): StudyRegistry => ({ prefix: "P1", studies });

const paper = (
  extra: Readonly<Record<string, string>> = {},
): Record<string, string> => ({
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  ...extra,
});

/** `studies` over `tree`, from `/work`: the exit code, what it printed, and the files after. */
function studies(
  a: Partial<StudiesArgs>,
  tree: Readonly<Record<string, string>>,
) {
  const files = memoryFiles(tree);
  const log: string[] = [];
  const err: string[] = [];
  const code = runStudies(
    {
      sub: "new",
      paperDir: "papers/example",
      title: undefined,
      extra: [],
      kind: null,
      ...a,
    },
    {
      files,
      listDir: memoryListDir(files),
      codec: studyRegistryCodec,
      cwd: CWD,
      today: "2026-10-15",
      log: (l) => log.push(l),
      err: (l) => err.push(l),
    },
  );
  const after = Object.fromEntries(
    [...files.map].map(([k, v]) => [k, new TextDecoder().decode(v)]),
  );
  return { code, log, err, after };
}

describe("studies new", () => {
  const before = paper({
    [`${REPRO}/studies.json`]: registryText(P1(study())),
    [`${REPRO}/README.md`]: "# Reproduction index\n\nIntro.\n",
    [`${REPRO}/P1-S01-baseline/README.md`]: "# s\n",
  });

  it("creates the folder's README.md, appends the row, regenerates the index", () => {
    const { code, log, err, after } = studies(
      { title: "Ablation of the guard", kind: "spike" },
      before,
    );
    const added: Study = {
      id: "P1-S02",
      folder: "P1-S02-ablation-of-the-guard",
      title: "Ablation of the guard",
      question: "",
      kind: "spike",
      status: "designing",
      date: "2026-10-15",
      in_paper: "no",
    };
    const r = P1(study(), added);
    expect({ code, err }).toEqual({ code: 0, err: [] });
    expect(after).toEqual({
      ...before,
      [`${REPRO}/P1-S02-ablation-of-the-guard/README.md`]: studyReadme(added),
      [`${REPRO}/studies.json`]: registryText(r),
      [`${REPRO}/README.md`]: `# Reproduction index\n\nIntro.\n\n${indexBlock(r)}\n`,
    });
    expect(log).toEqual([
      "created papers/example/repro/P1-S02-ablation-of-the-guard/README.md",
      "added P1-S02 to papers/example/repro/studies.json: kind spike, status designing, 2026-10-15",
      "wrote the index of 2 studies in papers/example/repro/README.md",
      "Next: write the study's one-sentence question in its row (`question`) and in its README.md. When it ends, set `status`, `result`, `result_file` and `in_paper` in its row, then run `npx paperlint studies index papers/example`.",
    ]);
  });

  it("is a measurement when no kind is named, and keeps a row's extra fields", () => {
    const { code, after } = studies({ title: "Second run" }, before);
    expect(code).toBe(0);
    const r = JSON.parse(after[`${REPRO}/studies.json`] ?? "") as {
      studies: Study[];
    };
    expect(r.studies.map((s) => [s.id, s.kind, s["role"]])).toEqual([
      ["P1-S01", "measurement", "counted"],
      ["P1-S02", "measurement", undefined],
    ]);
  });

  it("writes repro/README.md when there is none", () => {
    const { [`${REPRO}/README.md`]: _gone, ...tree } = before;
    const { code, after } = studies({ title: "Second run" }, tree);
    expect(code).toBe(0);
    expect(after[`${REPRO}/README.md`]).toMatch(/^# Reproduction index\n\n<!-- studies:begin/u);
  });

  describe("refuses, writing nothing", () => {
    it.each([
      [
        "no title",
        { title: undefined },
        2,
        'studies new needs the study\'s title: npx paperlint studies new <paper-dir> "<title>" [--kind <kind>]',
      ],
      [
        "an unknown kind",
        { title: "x", kind: "benchmark" },
        2,
        "--kind benchmark is not a kind of study: one of measurement, spike, tooling, data, artifact, salvage",
      ],
      [
        "a title over eight words",
        { title: "one two three four five six seven eight nine" },
        2,
        "the title has 9 words; a title is a plain name of at most 8 — the detail goes in the row's `question`",
      ],
      [
        "an argument past the title",
        { title: "x", extra: ["y"] },
        2,
        "studies new takes the paper's folder and one title — `y` is one argument too many (quote a title of several words)",
      ],
    ] as const)("%s", (_why, a, code, line) => {
      const out = studies(a, before);
      expect([out.code, out.err, out.after]).toEqual([code, [line], before]);
    });

    it("a folder that already exists", () => {
      const tree = { ...before, [`${REPRO}/P1-S02-second-run/notes.md`]: "x" };
      const out = studies({ title: "Second run" }, tree);
      expect([out.code, out.err, out.after]).toEqual([
        1,
        [
          "papers/example/repro/P1-S02-second-run/ already exists; it is never overwritten. Register it by hand, or remove it and run this again.",
        ],
        tree,
      ]);
    });

    it("a paper with no studies.json: names the file, and does not guess the prefix", () => {
      const tree = paper();
      const out = studies({ title: "x" }, tree);
      expect([out.code, out.err, out.after]).toEqual([
        1,
        [
          'papers/example/repro/studies.json does not exist. Its prefix is the paper\'s own choice — a capital letter, then capitals or digits, one per paper (P1) — so write the file, then run this again:\n\n{ "prefix": "P1", "studies": [] }',
        ],
        tree,
      ]);
    });

    it("a studies.json that is not a registry", () => {
      const tree = paper({ [`${REPRO}/studies.json`]: "{" });
      const out = studies({ title: "x" }, tree);
      expect([out.code, out.err]).toEqual([
        1,
        ["papers/example/repro/studies.json is not a study registry: not JSON"],
      ]);
    });
  });
});

describe("studies index", () => {
  const r = P1(study());

  it("regenerates the block in place", () => {
    const tree = paper({
      [`${REPRO}/studies.json`]: registryText(r),
      [`${REPRO}/README.md`]: `# I\n\n${indexBlock(P1())}\n\nTail.\n`,
    });
    const { code, log, err, after } = studies(
      { sub: "index", paperDir: "papers/example" },
      tree,
    );
    expect({ code, log, err }).toEqual({
      code: 0,
      log: ["wrote the index of 1 study in papers/example/repro/README.md"],
      err: [],
    });
    expect(after).toEqual({
      ...tree,
      [`${REPRO}/README.md`]: `# I\n\n${indexBlock(r)}\n\nTail.\n`,
    });
  });

  it("says so and writes nothing when the index is in sync", () => {
    const tree = paper({
      [`${REPRO}/studies.json`]: registryText(r),
      [`${REPRO}/README.md`]: withIndex("# I\n", r),
    });
    const out = studies({ sub: "index" }, tree);
    expect([out.code, out.log, out.after]).toEqual([
      0,
      ["the index in papers/example/repro/README.md is in sync with 1 study"],
      tree,
    ]);
  });

  it("refuses a title, which only `new` takes", () => {
    const tree = paper({ [`${REPRO}/studies.json`]: registryText(r) });
    const out = studies({ sub: "index", title: "x" }, tree);
    expect([out.code, out.err]).toEqual([
      2,
      [
        "studies index takes only the paper's folder — `x` is one argument too many",
      ],
    ]);
  });
});

describe("studies — the command line", () => {
  it.each([
    [
      "no subcommand",
      { sub: undefined },
      "studies needs a subcommand: new or index — npx paperlint studies new <paper-dir> \"<title>\" [--kind <kind>] · npx paperlint studies index <paper-dir>",
    ],
    [
      "an unknown subcommand",
      { sub: "add" },
      "unknown subcommand `studies add`: new or index — npx paperlint studies new <paper-dir> \"<title>\" [--kind <kind>] · npx paperlint studies index <paper-dir>",
    ],
    [
      "no paper folder",
      { sub: "index", paperDir: undefined },
      "studies index needs the paper's folder: npx paperlint studies index <paper-dir>",
    ],
    [
      "a folder that is no paper",
      { sub: "index", paperDir: "papers" },
      "papers is not a paper folder: it has no PIPELINE-STATUS.md",
    ],
  ] as const)("refuses %s with 2", (_why, a, line) => {
    const out = studies(a, paper());
    expect([out.code, out.err, out.log]).toEqual([2, [line], []]);
  });
});
