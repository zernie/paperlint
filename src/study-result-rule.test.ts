/**
 * `repro/study-result` (`src/study-result-rule.ts`) on paper folders held in memory, run the way
 * ESLint runs it. Both halves: a done study on a ready plan v2 whose result shows every gate is
 * silent, as is every study the rule does not judge (not done, no plan, a plan v1, a draft, a plan
 * that does not parse); a missing or short result is reported on the scorecard's first line.
 */
import { describe, expect, it } from "vitest";
import {
  memoryFiles,
  memoryListDir,
  memoryListEntries,
} from "./adapters/memory/index.ts";
import { studyRegistryCodec } from "./adapters/study-registry/index.ts";
import { PLAN_V2 } from "./domain/study-gates.ts";
import {
  planText,
  registryText,
  type Study,
  type StudyPlan,
} from "./domain/study-registry.ts";
import { resultMessage } from "./domain/study-result.ts";
import {
  RESULT_RULE_LEVELS,
  resultStudies,
  studyResultRules,
} from "./study-result-rule.ts";

const DIR = "/work/papers/example";
const FOLDER = "P1-S01-readings";

const row = (over: Partial<Study> = {}): Study => ({
  id: "P1-S01",
  folder: FOLDER,
  title: "Readings",
  question: "Do readings disagree?",
  kind: "measurement",
  status: "done",
  date: "2026-11-01",
  in_paper: "no",
  result: "0.31",
  result_file: "result.json",
  plan: "plan.json",
  ...over,
});

const V2: StudyPlan = {
  $schema: PLAN_V2,
  question: "Do readings disagree?",
  population: { source: "repos", draw: { kind: "all", method: "census" } },
  arms: [],
  primary_outcome: "share",
  author_check: null,
  mode: {
    kind: "decide_before_run",
    outputs: ["result.json"],
    decision: { file: `repro/${FOLDER}/decision.md`, note: "the draw" },
    we_lose_if: { result: "share_upper95", below: 0.2 },
  },
  second_check: [{ step: "admissible", min_kappa: 0.6 }],
  self_test: { made_by: "selftest.mjs" },
  funnel: ["clone failed"],
  recall_audit: { n_files: 20, min_recall: 0.6 },
};

const GOOD = {
  share_upper95: 0.31,
  kappa: { admissible: 0.64 },
  self_test: { passed: 9, failed: 0 },
  funnel: { "clone failed": 1 },
  recall_audit: { files: 20, units_in_files: 40, extracted: 30 },
};

/** A paper whose registry has `s`, its plan `plan` (text), and `result` as result.json (none when null). */
const tree = (
  s: Study,
  plan: string | null,
  result: string | null,
): Record<string, string> => ({
  [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
  [`${DIR}/repro/studies.json`]: registryText({ prefix: "P1", studies: [s] }),
  ...(plan === null ? {} : { [`${DIR}/repro/${FOLDER}/plan.json`]: plan }),
  ...(result === null
    ? {}
    : { [`${DIR}/repro/${FOLDER}/result.json`]: result }),
});

const deps = (t: Readonly<Record<string, string>>) => {
  const files = memoryFiles(t);
  return {
    files,
    listDir: memoryListDir(files),
    entries: memoryListEntries(files),
    codec: studyRegistryCodec,
  };
};

/** The rule's messages over `t`, reached through `file`. */
const lint = (
  t: Readonly<Record<string, string>>,
  file = `${DIR}/PIPELINE-STATUS.md`,
): readonly {
  readonly id: string;
  readonly text: string;
  readonly line: number;
}[] => {
  const rule = studyResultRules(deps(t))["study-result"];
  const out: { id: string; text: string; line: number }[] = [];
  rule
    .create({
      filename: file,
      sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
      report: (d) => {
        out.push({
          id: d.messageId,
          text: String(d.data.text),
          line: d.loc.start.line,
        });
      },
    })
    .root?.();
  return out;
};

describe("repro/study-result — silent", () => {
  it("on a done study whose result shows every gate", () => {
    expect(lint(tree(row(), planText(V2), JSON.stringify(GOOD)))).toEqual([]);
  });

  it("on every study it does not judge", () => {
    const v1: StudyPlan = {
      ...V2,
      $schema: undefined,
      mode: undefined,
      second_check: undefined,
      self_test: undefined,
      funnel: undefined,
      recall_audit: undefined,
    };
    const exploratoryNone: StudyPlan = {
      ...V2,
      mode: { kind: "exploratory", reason: "a look" },
      second_check: "none",
      self_test: "none",
      funnel: "none",
      recall_audit: "none",
    };
    const cases = [
      tree(row({ status: "running" }), planText(V2), null),
      tree(row({ plan: undefined }), null, null),
      tree(row(), null, null),
      tree(row({ kind: "spike" }), planText(v1), null),
      tree(row(), planText({ ...V2, funnel: null }), null),
      tree(row(), "not json", null),
      tree(row(), planText(exploratoryNone), "{}"),
    ];
    // Guards: only a done study on a ready plan v2 is asked for a result.
    expect(cases.map((t) => lint(t))).toEqual(cases.map(() => []));
  });

  it("on any file but the scorecard", () => {
    expect(lint(tree(row(), planText(V2), null), `${DIR}/paper.tex`)).toEqual(
      [],
    );
  });
});

describe("repro/study-result — reported", () => {
  it("a done study with no result.json, on the scorecard's first line, with the domain's text", () => {
    expect(lint(tree(row(), planText(V2), null))).toEqual([
      {
        id: "no-result-file",
        text: resultMessage({ problem: "no-result-file", id: "P1-S01" }),
        line: 1,
      },
    ]);
  });

  it("a result.json that is not one, and one whose claim lost unsaid", () => {
    expect(
      lint(tree(row(), planText(V2), '{"kappa": 3}')).map((r) => r.id),
    ).toEqual(["result-unreadable"]);
    expect(
      lint(
        tree(
          row(),
          planText(V2),
          JSON.stringify({ ...GOOD, share_upper95: 0.1 }),
        ),
      ).map((r) => r.id),
    ).toEqual(["claim-lost"]);
  });

  it("a kappa outside -1..1 (a percentage written as 75) makes result.json unreadable, naming its path", () => {
    const kappa = (k: number) =>
      lint(
        tree(
          row(),
          planText(V2),
          JSON.stringify({ ...GOOD, kappa: { ...GOOD.kappa, admissible: k } }),
        ),
      );
    const [high] = kappa(75);
    // Guards: both ends of the range, and the edges themselves, which are kappas.
    expect([
      high?.id,
      high?.text.includes("kappa.admissible"),
      kappa(-1.5).map((r) => r.id),
      kappa(1).map((r) => r.id),
      kappa(-1).map((r) => r.id),
    ]).toEqual([
      "result-unreadable",
      true,
      ["result-unreadable"],
      [],
      ["kappa"],
    ]);
  });

  it("resultStudies reads the gates of the plan and the state of the result", () => {
    expect(
      resultStudies(DIR, deps(tree(row(), planText(V2), "x"))).map((s) => [
        s.we_lose_if,
        s.state.kind,
      ]),
    ).toEqual([[{ result: "share_upper95", below: 0.2 }, "unreadable"]]);
  });

  it("is an error in paperlint's config", () => {
    expect(RESULT_RULE_LEVELS).toEqual({ "repro/study-result": "error" });
  });
});

describe("repro/study-result — the recall audit", () => {
  it("a recall audit on too few files or below its bar is reported; one that counts more extracted than found is unreadable", () => {
    const audit = (c: Record<string, number>) =>
      lint(
        tree(row(), planText(V2), JSON.stringify({ ...GOOD, recall_audit: c })),
      );
    const [over] = audit({ files: 20, units_in_files: 10, extracted: 11 });
    // Guards: 12 of 20 is exactly the bar of 0.6 and passes; 11 of 20 does not.
    expect([
      audit({ files: 20, units_in_files: 20, extracted: 12 }).map((r) => r.id),
      audit({ files: 20, units_in_files: 20, extracted: 11 }).map((r) => r.id),
      audit({ files: 19, units_in_files: 20, extracted: 12 }).map((r) => r.id),
      over?.id,
      over?.text.includes("recall_audit"),
      audit({ files: 20, units_in_files: 0, extracted: 0 }).map((r) => r.id),
    ]).toEqual([
      [],
      ["recall"],
      ["recall-sample"],
      "result-unreadable",
      true,
      ["result-unreadable"],
    ]);
  });
});

describe("repro/study-result — a plan in a subfolder", () => {
  it("reads result.json beside the plan, not at the top of the study's folder", () => {
    const nested = {
      [`${DIR}/PIPELINE-STATUS.md`]: "# status\n",
      [`${DIR}/repro/studies.json`]: registryText({
        prefix: "P1",
        studies: [row({ plan: "design/plan.json" })],
      }),
      [`${DIR}/repro/${FOLDER}/design/plan.json`]: planText(V2),
      [`${DIR}/repro/${FOLDER}/design/result.json`]: JSON.stringify(GOOD),
    };
    expect(lint(nested)).toEqual([]);
    const atTop = {
      ...Object.fromEntries(
        Object.entries(nested).filter(
          ([k]) => !k.endsWith("design/result.json"),
        ),
      ),
      [`${DIR}/repro/${FOLDER}/result.json`]: JSON.stringify(GOOD),
    };
    expect(lint(atTop).map((m) => m.id)).toEqual(["no-result-file"]);
  });
});
