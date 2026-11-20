/**
 * `artifact/required-files` and `artifact/promised` (`src/artifact-rules.ts`) on papers held in
 * memory: each finding, as ESLint words it, for a folder and for a committed list; silence when the
 * artifact holds what the paper declares, and when it declares nothing.
 */
import { describe, expect, it } from "vitest";
import { memoryFiles, memoryListTree } from "./adapters/memory/index.ts";
import { ARTIFACT_RULE_LEVELS, artifactRules } from "./artifact-rules.ts";

const DIR = "/work/papers/p";
type Name = "required-files" | "promised";

/** Rule `name` over one paper's PIPELINE-STATUS.md: each message, as ESLint words it. */
function lint(
  name: Name,
  settings: object | string | null,
  extra: Record<string, string> = {},
  file = "PIPELINE-STATUS.md",
): string[] {
  const files = memoryFiles({
    ...(settings === null
      ? {}
      : {
          [`${DIR}/paperlint.json`]:
            typeof settings === "string" ? settings : JSON.stringify(settings),
        }),
    ...extra,
  });
  const rule = artifactRules({ files, listTree: memoryListTree(files) })[name];
  const out: string[] = [];
  rule
    .create({
      filename: `${DIR}/${file}`,
      sourceCode: { getLocFromIndex: () => ({ line: 1, column: 0 }) },
      report: (d) => {
        out.push(
          Object.entries(d.data).reduce(
            (m, [k, v]) => m.split(`{{${k}}}`).join(String(v)),
            rule.meta.messages[d.messageId] ?? "",
          ),
        );
      },
    })
    .root?.();
  return out;
}

const REQUIRED = { required: ["README", "LICENSE"] };
const PROMISES = { promises: { prompts: "**/prompts/*.md" } };
const CLEAN = {
  [`${DIR}/artifact/README.md`]: "# artifact\n",
  [`${DIR}/artifact/LICENSE`]: "MIT\n",
  [`${DIR}/artifact/data/prompts/a.md`]: "a\n",
};

describe("artifact/required-files", () => {
  it("🔴 a required name missing at the top level: one finding per name", () => {
    expect(
      lint(
        "required-files",
        { artifact: { dir: "artifact", ...REQUIRED } },
        { [`${DIR}/artifact/docs/README.md`]: "x" },
      ),
    ).toEqual([
      'the artifact (artifact) has no top-level README — any extension counts (README.md, README.txt, README); "artifact.required" in paperlint.json asks for one',
      'the artifact (artifact) has no top-level LICENSE — any extension counts (LICENSE.md, LICENSE.txt, LICENSE); "artifact.required" in paperlint.json asks for one',
    ]);
  });

  it("🔴 a folder that does not exist", () => {
    expect(
      lint("required-files", { artifact: { dir: "artifact", ...REQUIRED } }),
    ).toEqual([
      'the artifact folder artifact ("artifact.dir" in paperlint.json, relative to the paper) does not exist or is not a folder, so its required names cannot be checked',
    ]);
  });

  it("🔴 a list that does not exist, and one that names nothing", () => {
    const settings = { artifact: { files: "artifact.txt", ...REQUIRED } };
    expect(lint("required-files", settings)).toEqual([
      'the artifact\'s list of paths artifact.txt ("artifact.files" in paperlint.json, relative to the paper) does not exist, so its required names cannot be checked',
    ]);
    expect(
      lint("required-files", settings, {
        [`${DIR}/artifact.txt`]: "\n./\nprompts/\n",
      }),
    ).toEqual([
      "the artifact's list of paths artifact.txt names no file, so its required names cannot be checked — write one path per line, relative to the artifact's root, as `zipinfo -1` or `find . -type f` print them",
    ]);
  });

  it("silent when the folder holds them, any extension, any case", () => {
    expect(
      lint(
        "required-files",
        { artifact: { dir: "artifact", ...REQUIRED } },
        {
          [`${DIR}/artifact/readme.txt`]: "x",
          [`${DIR}/artifact/LICENSE`]: "x",
        },
      ),
    ).toEqual([]);
  });

  it("silent when the committed list holds them", () => {
    expect(
      lint(
        "required-files",
        { artifact: { files: "artifact.txt", ...REQUIRED } },
        { [`${DIR}/artifact.txt`]: "./README.md\n./LICENSE.txt\n" },
      ),
    ).toEqual([]);
  });

  it.each<[string, object | string | null]>([
    ["no paperlint.json", null],
    ["no artifact", { extends: null }],
    ["an artifact that requires nothing", { artifact: { dir: "gone" } }],
    ["a paperlint.json that does not parse — pdf/profile says so", "{"],
  ])("silent with %s", (_, settings) => {
    expect(lint("required-files", settings)).toEqual([]);
  });

  it("judged once per paper, on PIPELINE-STATUS.md only", () => {
    expect(
      lint(
        "required-files",
        { artifact: { dir: "artifact", ...REQUIRED } },
        {},
        "paper.tex",
      ),
    ).toEqual([]);
  });
});

describe("artifact/promised", () => {
  it("🔴 a promise whose glob matches nothing: one finding per promise", () => {
    expect(
      lint(
        "promised",
        {
          artifact: {
            dir: "artifact",
            promises: { ...PROMISES.promises, runs: "runs/*.jsonl" },
          },
        },
        CLEAN,
      ),
    ).toEqual([
      'the artifact promise "runs" (runs/*.jsonl) matches no path of the artifact (artifact): the paper says the artifact holds it — add the files, or correct the glob in "artifact.promises"',
    ]);
  });

  it("🔴 a folder that does not exist", () => {
    expect(
      lint("promised", { artifact: { dir: "artifact", ...PROMISES } }),
    ).toEqual([
      'the artifact folder artifact ("artifact.dir" in paperlint.json, relative to the paper) does not exist or is not a folder, so its promises cannot be checked',
    ]);
  });

  it("silent when every promise matches, in a folder or a list", () => {
    expect(
      lint("promised", { artifact: { dir: "artifact", ...PROMISES } }, CLEAN),
    ).toEqual([]);
    expect(
      lint(
        "promised",
        { artifact: { files: "artifact.txt", ...PROMISES } },
        { [`${DIR}/artifact.txt`]: "data/\ndata/prompts/a.md\n" },
      ),
    ).toEqual([]);
  });

  it("silent for an artifact that promises nothing", () => {
    expect(
      lint("promised", { artifact: { dir: "artifact", ...REQUIRED } }),
    ).toEqual([]);
  });
});

it("the level: both on, as errors — and silent for a paper that declares no artifact", () => {
  expect(ARTIFACT_RULE_LEVELS).toEqual({
    "artifact/required-files": "error",
    "artifact/promised": "error",
  });
});
