/** A paper's `artifact` key, parsed, and the two judgements over the artifact's paths. */
import { describe, expect, it } from "vitest";
import {
  answers,
  brokenPromises,
  listedPaths,
  missingRequired,
  parsePaperArtifact,
} from "./artifact.ts";

/** A bad shape, and the one line that refuses it. */
const REFUSED: readonly (readonly [string, unknown, string])[] = [
  [
    "not an object",
    "artifact",
    `"artifact" must be an object with a "dir" or a "files"`,
  ],
  [
    "an unknown key",
    { dir: "a", include: ["x"] },
    `"artifact" has an unknown key "include" — known: dir, files, required, promises`,
  ],
  [
    "neither dir nor files",
    { promises: {} },
    `"artifact" needs exactly one of "dir" (the artifact's folder) or "files" (a committed list of its paths), got neither`,
  ],
  [
    "both dir and files",
    { dir: "a", files: "a.txt" },
    `"artifact" needs exactly one of "dir" (the artifact's folder) or "files" (a committed list of its paths), got both`,
  ],
  [
    "an absolute dir",
    { dir: "/srv/artifact" },
    `"artifact.dir" must be a path relative to the paper, got "/srv/artifact"`,
  ],
  [
    "an empty files",
    { files: "" },
    `"artifact.files" must be a path relative to the paper, got ""`,
  ],
  [
    "a required name with a folder",
    { dir: "a", required: ["docs/README"] },
    `"artifact.required" must be a list of top-level names without an extension ("README", "LICENSE"), got ["docs/README"]`,
  ],
  [
    "a required name with an extension",
    { dir: "a", required: ["README.md"] },
    `"artifact.required" must be a list of top-level names without an extension ("README", "LICENSE"), got ["README.md"]`,
  ],
  [
    "promises as a list",
    { dir: "a", promises: ["**/*.md"] },
    `"artifact.promises" must be an object of label → glob`,
  ],
  [
    "an empty glob",
    { dir: "a", promises: { prompts: "" } },
    `"artifact.promises" entry "prompts" must be a non-empty glob relative to the artifact's root, got ""`,
  ],
  [
    "a glob that is not a string",
    { dir: "a", promises: { prompts: 3 } },
    `"artifact.promises" entry "prompts" must be a non-empty glob relative to the artifact's root, got 3`,
  ],
  [
    "an empty label",
    { dir: "a", promises: { "": "*.md" } },
    `"artifact.promises" entry "" must be a non-empty glob relative to the artifact's root, got "*.md"`,
  ],
];

describe("parsePaperArtifact", () => {
  it("is null when the paper declares no artifact", () => {
    expect(parsePaperArtifact(undefined)).toEqual({ ok: true, value: null });
  });

  it("takes a folder, the required names and the promises", () => {
    expect(
      parsePaperArtifact({
        dir: "../artifact",
        required: ["README", "LICENSE"],
        promises: { prompts: "**/prompts/*.md" },
      }),
    ).toEqual({
      ok: true,
      value: {
        source: { kind: "dir", path: "../artifact" },
        required: ["README", "LICENSE"],
        promises: { prompts: "**/prompts/*.md" },
      },
    });
  });

  it("takes a committed list instead of a folder; required and promises are optional", () => {
    expect(parsePaperArtifact({ files: "artifact-files.txt" })).toEqual({
      ok: true,
      value: {
        source: { kind: "files", path: "artifact-files.txt" },
        required: [],
        promises: {},
      },
    });
  });

  it.each(REFUSED)("refuses %s", (_, v, why) => {
    // Guards: each bad shape is refused with the one line naming the key and what it must be.
    expect(parsePaperArtifact(v)).toEqual({ ok: false, error: why });
  });
});

describe("answers — a top-level name answers a required name by its name before any extension, case ignored", () => {
  it.each<[string, boolean]>([
    ["README.md", true],
    ["readme.txt", true],
    ["README", true],
    ["README.en.md", true],
    ["READMEFIRST.md", false],
    [".README", false],
  ])("%s → %s", (name, yes) => {
    expect(answers(name, "README")).toBe(yes);
  });
});

describe("missingRequired — only the top level counts", () => {
  it("a README in a subfolder does not answer it; LICENSE without an extension does", () => {
    expect(
      missingRequired(["README", "LICENSE"], ["docs/README.md", "LICENSE"]),
    ).toEqual(["README"]);
  });
});

describe("brokenPromises — a promise matching no path", () => {
  it("names the label and the glob of each promise that matches nothing", () => {
    expect(
      brokenPromises({ prompts: "**/prompts/*.md", runs: "runs/*.jsonl" }, [
        "prompts/a.md",
        "README.md",
      ]),
    ).toEqual([["runs", "runs/*.jsonl"]]);
  });
});

describe("listedPaths — a committed list as zipinfo -1 or find writes it", () => {
  it("drops blank lines, folder entries and a leading ./", () => {
    expect(
      listedPaths(".\n./README.md\nprompts/\nprompts/a.md\r\n\n  LICENSE  \n"),
    ).toEqual(["README.md", "prompts/a.md", "LICENSE"]);
  });
});
