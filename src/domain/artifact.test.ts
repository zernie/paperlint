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
    "a required name with a folder",
    { dir: "a", required: ["docs/README"] },
    `"artifact.required" must be a list of top-level names without an extension ("README", "LICENSE"), got ["docs/README"]`,
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
    ["READMEFIRST.md", false],
  ])("%s → %s", (name, yes) => {
    expect(answers(name, "README")).toBe(yes);
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

describe("one wrapper folder around every path (GitHub's Download ZIP, Zenodo, OSF) is looked through", () => {
  const REQ = ["README", "LICENSE"];

  it("🔴 a wrapped artifact holding README and LICENSE: nothing missing", () => {
    expect(
      missingRequired(REQ, ["repo-main/README.md", "repo-main/LICENSE"]),
    ).toEqual([]);
  });

  it("a wrapped artifact without a README: README missing", () => {
    expect(
      missingRequired(REQ, ["repo-main/LICENSE", "repo-main/docs/README.md"]),
    ).toEqual(["README"]);
  });

  it("two top folders are not unwrapped", () => {
    expect(missingRequired(REQ, ["a/README.md", "b/LICENSE"])).toEqual(REQ);
  });

  it("a top-level file beside one folder is not unwrapped", () => {
    expect(
      missingRequired(REQ, ["notes.txt", "a/README.md", "a/LICENSE"]),
    ).toEqual(REQ);
  });

  it("🔴 a promise's glob matches inside the wrapper", () => {
    expect(
      brokenPromises({ data: "data/*.csv" }, ["artifact/data/x.csv"]),
    ).toEqual([]);
  });
});

describe("listedPaths — a committed list as zipinfo -1 or find writes it", () => {
  it("drops blank lines, folder entries and a leading ./", () => {
    expect(
      listedPaths(".\n./README.md\nprompts/\nprompts/a.md\r\n\n  LICENSE  \n"),
    ).toEqual(["README.md", "prompts/a.md", "LICENSE"]);
  });
});
