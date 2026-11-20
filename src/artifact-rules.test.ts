/**
 * `artifact/required-files` and `artifact/promised` (`src/artifact-rules.ts`) where real ESLint never
 * takes them: a `paperlint.json` that `paperlint lint` refuses before ESLint runs, and a file other
 * than `PIPELINE-STATUS.md`. Each finding is in `src/rule-cases.test.ts`, through the CLI.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles, memoryListTree } from "./adapters/memory/index.ts";
import { ARTIFACT_RULE_LEVELS, artifactRules } from "./artifact-rules.ts";

const DIR = "/work/papers/p";
const DECLARED = JSON.stringify({
  artifact: { dir: "gone", required: ["README"], promises: { p: "*.md" } },
});

/** How many findings each rule makes on the paper's `file`, its paperlint.json being `settings`. */
function counts(settings: string, file = "PIPELINE-STATUS.md"): number[] {
  const files = memoryFiles({ [`${DIR}/paperlint.json`]: settings });
  const rules = artifactRules({ files, listTree: memoryListTree(files) });
  return [rules["required-files"], rules.promised].map((rule) => {
    const out: string[] = [];
    rule
      .create({
        filename: `${DIR}/${file}`,
        sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
        report: (d) => {
          out.push(d.messageId);
        },
      })
      .root?.();
    return out.length;
  });
}

describe("the artifact rules", () => {
  it("🔴 the declared folder missing: each rule reports it on PIPELINE-STATUS.md", () => {
    expect(counts(DECLARED)).toEqual([1, 1]);
  });

  it("judged once per paper: silent on any other file", () => {
    expect(counts(DECLARED, "paper.tex")).toEqual([0, 0]);
  });

  it("silent on a paperlint.json that does not parse — pdf/profile says so", () => {
    expect(counts("{")).toEqual([0, 0]);
  });

  it("the level: both on, as errors — silent for a paper that declares no artifact", () => {
    expect(ARTIFACT_RULE_LEVELS).toEqual({
      "artifact/required-files": "error",
      "artifact/promised": "error",
    });
  });
});
