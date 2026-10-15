/**
 * `repro/study-registered` (`src/study-registry-rule.ts`) on paper folders held in memory, run the way
 * ESLint runs it: `create`, then `root`. Both halves: a registered `repro/` with its index in sync is
 * silent; each defect — an unregistered folder, a dangling row, a bad id, `done` without a result,
 * `superseded` without a target, a stale index, a missing or unreadable registry — is reported once,
 * on the first line of `PIPELINE-STATUS.md`, with the domain's text.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles, memoryListDir } from "./adapters/memory/index.ts";
import { studyRegistryCodec } from "./adapters/study-registry/index.ts";
import {
  planTemplate,
  planText,
  registryText,
  studyMessage,
  withIndex,
  type Study,
  type StudyRegistry,
} from "./domain/study-registry.ts";
import {
  registryOf,
  STUDY_REGISTRY_RULE_LEVELS,
  studyFindings,
  studyRegistryRules,
} from "./study-registry-rule.ts";

const DIR = "/work/papers/example";
const SCAFFOLD = {
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/paper.tex`]: "\\documentclass{article}\n",
};

const study = (over: Partial<Study> = {}): Study => ({
  id: "P1-S01",
  folder: "P1-S01-baseline",
  title: "Baseline pass rate",
  question: "How often does the agent pass?",
  kind: "measurement",
  status: "designing",
  date: "2026-10-15",
  in_paper: "no",
  ...over,
});

/** A registered `repro/`: the registry, its index, and a README.md in each row's folder. */
const registered = (
  r: StudyRegistry,
  readme: string | null = withIndex("# Reproduction index\n", r),
): Record<string, string> => ({
  ...SCAFFOLD,
  [`${DIR}/repro/studies.json`]: registryText(r),
  ...(readme === null ? {} : { [`${DIR}/repro/README.md`]: readme }),
  ...Object.fromEntries(
    r.studies.map((s) => [`${DIR}/repro/${s.folder}/README.md`, "# s\n"]),
  ),
});

const P1 = (...studies: Study[]): StudyRegistry => ({ prefix: "P1", studies });

interface Reported {
  readonly messageId: string;
  readonly message: string;
  readonly line: number;
}

/** The rule over the folder `tree` describes, reached through `file` (default the scorecard). */
function lint(
  tree: Readonly<Record<string, string>>,
  file = `${DIR}/PIPELINE-STATUS.md`,
  name: "study-registered" | "study-plan-name" = "study-registered",
): Reported[] {
  const files = memoryFiles(tree);
  const rule = studyRegistryRules({
    files,
    listDir: memoryListDir(files),
    codec: studyRegistryCodec,
  })[name];
  const out: Reported[] = [];
  const visitor = rule.create({
    filename: file,
    sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
    report: (d) => {
      const template = rule.meta.messages[d.messageId] ?? "";
      const message = Object.entries(d.data).reduce(
        (m, [k, v]) => m.split(`{{${k}}}`).join(String(v)),
        template,
      );
      out.push({ messageId: d.messageId, message, line: d.loc.start.line });
    },
  });
  visitor.root?.();
  return out;
}

const messages = (tree: Readonly<Record<string, string>>): string[] =>
  lint(tree).map((r) => r.message);

describe("repro/study-registered — silent", () => {
  it("on a registered repro/ with its index in sync, beside tools/, data/ and byproducts", () => {
    const done = study({
      id: "P1-S02",
      folder: "P1-S02-ablation",
      status: "done",
      result: "41 of 60 pass",
      result_file: "out/results.tsv",
    });
    expect(
      lint({
        ...registered(P1(study(), done)),
        [`${DIR}/repro/P1-S02-ablation/out/results.tsv`]: "x\n",
        [`${DIR}/repro/tools/run.py`]: "x",
        [`${DIR}/repro/data/numbers.tsv`]: "x",
        [`${DIR}/repro/__pycache__/x.pyc`]: "x",
        [`${DIR}/repro/node_modules/a/index.js`]: "x",
        [`${DIR}/repro/.gitignore`]: "x",
      }),
    ).toEqual([]);
  });

  it("on a paper with no repro/", () => {
    expect(lint(SCAFFOLD)).toEqual([]);
  });

  it("on a repro/ with only its shared folders and no registry", () => {
    expect(
      lint({
        ...SCAFFOLD,
        [`${DIR}/repro/README.md`]: "# index\n",
        [`${DIR}/repro/tools/.gitkeep`]: "",
        [`${DIR}/repro/data/.gitkeep`]: "",
      }),
    ).toEqual([]);
  });

  it("on any file but PIPELINE-STATUS.md", () => {
    expect(
      lint(
        { ...SCAFFOLD, [`${DIR}/repro/spike-2026-10-12/README.md`]: "x" },
        `${DIR}/paper.tex`,
      ),
    ).toEqual([]);
  });
});

describe("repro/study-registered — reports, once each, on line 1", () => {
  it("an unregistered folder", () => {
    expect(
      lint({
        ...registered(P1(study())),
        [`${DIR}/repro/spike-2026-10-12/README.md`]: "x",
      }),
    ).toEqual([
      {
        messageId: "unregistered",
        message: studyMessage({
          problem: "unregistered",
          folder: "spike-2026-10-12",
          next: "P1-S02",
        }),
        line: 1,
      },
    ]);
  });

  it("a dangling row", () => {
    const tree = registered(P1(study()));
    const { [`${DIR}/repro/P1-S01-baseline/README.md`]: gone, ...rest } = tree;
    expect(gone).toBeDefined();
    expect(messages(rest)).toEqual([
      studyMessage({
        problem: "no-folder",
        id: "P1-S01",
        folder: "P1-S01-baseline",
      }),
    ]);
  });

  it("a bad id", () => {
    expect(
      messages(registered(P1(study({ id: "P1-S1", folder: "P1-S1-x" })))),
    ).toEqual([studyMessage({ problem: "bad-id", id: "P1-S1", prefix: "P1" })]);
  });
});

describe("repro/study-registered — reports a row's status and the index", () => {
  it("done without a result", () => {
    expect(messages(registered(P1(study({ status: "done" }))))).toEqual([
      studyMessage({
        problem: "no-result",
        id: "P1-S01",
        missing: ["result", "result_file"],
      }),
    ]);
  });

  it("done with a result_file that is not there", () => {
    expect(
      messages(
        registered(
          P1(study({ status: "done", result: "x", result_file: "r.tsv" })),
        ),
      ),
    ).toEqual([
      studyMessage({
        problem: "result-file",
        id: "P1-S01",
        path: "r.tsv",
        why: "missing",
      }),
    ]);
  });

  it("superseded without a target", () => {
    expect(messages(registered(P1(study({ status: "superseded" }))))).toEqual([
      studyMessage({
        problem: "no-successor",
        id: "P1-S01",
        superseded_by: null,
      }),
    ]);
  });

  it("a stale index", () => {
    const r = P1(study());
    expect(messages(registered(r, withIndex("# x\n", P1())))).toEqual([
      studyMessage({ problem: "stale-index", why: "differs" }),
    ]);
  });
});

describe("repro/study-registered — reports the registry itself, once", () => {
  it("study folders and no studies.json: one finding naming the file", () => {
    expect(
      lint({
        ...SCAFFOLD,
        [`${DIR}/repro/README.md`]: "# index\n",
        [`${DIR}/repro/b-2026-10-02/README.md`]: "x",
        [`${DIR}/repro/a-2026-10-01/README.md`]: "x",
        [`${DIR}/repro/tools/run.py`]: "x",
      }),
    ).toEqual([
      {
        messageId: "no-registry",
        message: studyMessage({
          problem: "no-registry",
          folders: ["a-2026-10-01", "b-2026-10-02"],
        }),
        line: 1,
      },
    ]);
  });

  it("a studies.json that is not a registry: one finding with the reasons", () => {
    expect(
      lint({
        ...SCAFFOLD,
        [`${DIR}/repro/studies.json`]: '{ "studies": [] }',
        [`${DIR}/repro/P1-S01-x/README.md`]: "x",
      }),
    ).toEqual([
      {
        messageId: "unreadable",
        message: studyMessage({
          problem: "unreadable",
          why: "prefix: Invalid input: expected string, received undefined",
        }),
        line: 1,
      },
    ]);
  });
});

describe("repro/study-registered — level", () => {
  it("is an error from the start", () => {
    expect(STUDY_REGISTRY_RULE_LEVELS).toEqual({
      "repro/study-registered": "error",
      "repro/study-plan-name": "warn",
    });
  });
});

describe("repro/study-registered — a directory where the registry should be", () => {
  it("is read as no registry, not thrown on (the disk adapter throws EISDIR on a directory)", () => {
    const files = {
      ...memoryFiles({}),
      isFile: () => false,
      readBytes: (): Uint8Array => {
        throw Object.assign(new Error("EISDIR"), { code: "EISDIR" });
      },
    };
    expect(registryOf(DIR, { files, codec: studyRegistryCodec })).toEqual({
      kind: "absent",
    });
  });
});

describe("repro/study-registered — a result_file the disk cannot hold", () => {
  it("reads as missing, and the disk is never asked (the disk adapter throws on a NUL)", () => {
    const r = P1(study({ status: "running", result_file: "a\u0000b.tsv" }));
    const files = memoryFiles({
      ...SCAFFOLD,
      [`${DIR}/repro/studies.json`]: registryText(r),
      [`${DIR}/repro/README.md`]: withIndex("# index\n", r),
      [`${DIR}/repro/P1-S01-baseline/README.md`]: "# s\n",
    });
    const probe = {
      ...files,
      isFile: (p: Parameters<typeof files.isFile>[0]): boolean => {
        if (p.includes("\0")) throw new Error("ERR_INVALID_ARG_VALUE");
        return files.isFile(p);
      },
    };
    expect(
      studyFindings(DIR, {
        files: probe,
        listDir: memoryListDir(files),
        codec: studyRegistryCodec,
      }).map((f) => f.problem),
    ).toEqual(["result-file"]);
  });
});

/** A plan as a study would hold it once the author has checked its drawn units. */
const FILLED = planText({
  question: "How many rules can a linter check?",
  population: {
    source: "the crawl of 2026-10-01",
    draw: { kind: "all", method: "census" },
  },
  arms: [],
  primary_outcome: "the share of rules a linter can check",
  author_check: { by: "A. Author", date: "2026-10-14", quote: "Go." },
});

/** A registry with a headline measurement of one running study whose row names `plan`. */
const HEADLINE = (plan: string): StudyRegistry => ({
  prefix: "P1",
  author: "A. Author",
  measurements: [
    {
      id: "M1",
      title: "Rule census",
      role: "headline",
      approval: { by: "A. Author", date: "2026-10-12", quote: "Yes." },
    },
  ],
  studies: [study({ status: "running", measurement: "M1", plan })],
});

describe("repro/study-registered — the plan a row names, read from its folder", () => {
  it("is silent on a plan.json the author checked", () => {
    expect(
      lint({
        ...registered(HEADLINE("plan.json")),
        [`${DIR}/repro/P1-S01-baseline/plan.json`]: FILLED,
      }),
    ).toEqual([]);
  });

  it("reports a plan that is not there", () => {
    expect(messages(registered(HEADLINE("plan.json")))).toEqual([
      studyMessage({
        problem: "bad-plan",
        id: "P1-S01",
        path: "plan.json",
        why: "missing",
      }),
    ]);
  });

  it("reports a plan that is not JSON, with the reason", () => {
    expect(
      messages({
        ...registered(HEADLINE("plan.json")),
        [`${DIR}/repro/P1-S01-baseline/plan.json`]: "{",
      }),
    ).toEqual([
      studyMessage({
        problem: "bad-plan",
        id: "P1-S01",
        path: "plan.json",
        why: "unreadable",
        reasons: "not JSON",
      }),
    ]);
  });

  it("reports a running study of the headline whose plan is still the template", () => {
    expect(
      lint({
        ...registered(HEADLINE("plan.json")),
        [`${DIR}/repro/P1-S01-baseline/plan.json`]: planText(planTemplate()),
      }).map((r) => [r.messageId, r.line]),
    ).toEqual([
      ["bad-plan", 1],
      ["author-check", 1],
    ]);
  });
});

describe("repro/study-registered — a plan the disk cannot hold", () => {
  it("reads as missing, and the disk is never asked", () => {
    const r = HEADLINE("a\u0000.json");
    const files = memoryFiles(registered(r));
    const probe = {
      ...files,
      isFile: (p: Parameters<typeof files.isFile>[0]): boolean => {
        if (p.includes("\0")) throw new Error("ERR_INVALID_ARG_VALUE");
        return files.isFile(p);
      },
    };
    expect(
      studyFindings(DIR, {
        files: probe,
        listDir: memoryListDir(files),
        codec: studyRegistryCodec,
      }).map((f) => f.problem),
    ).toEqual(["bad-plan"]);
  });
});

describe("repro/study-plan-name — a plan under its old name", () => {
  const OLD = {
    ...registered(HEADLINE("prereg.json")),
    [`${DIR}/repro/P1-S01-baseline/prereg.json`]: FILLED,
  };

  it("is read as the plan: repro/study-registered is silent", () => {
    expect(lint(OLD)).toEqual([]);
  });

  it("is reported by repro/study-plan-name, naming plan.json", () => {
    expect(lint(OLD, `${DIR}/PIPELINE-STATUS.md`, "study-plan-name")).toEqual([
      {
        messageId: "legacy-plan",
        message: studyMessage({
          problem: "legacy-plan",
          id: "P1-S01",
          path: "prereg.json",
        }),
        line: 1,
      },
    ]);
  });

  it("is silent on plan.json, and on any file but PIPELINE-STATUS.md", () => {
    const tree = {
      ...registered(HEADLINE("plan.json")),
      [`${DIR}/repro/P1-S01-baseline/plan.json`]: FILLED,
    };
    expect([
      lint(tree, `${DIR}/PIPELINE-STATUS.md`, "study-plan-name"),
      lint(OLD, `${DIR}/paper.tex`, "study-plan-name"),
    ]).toEqual([[], []]);
  });
});
