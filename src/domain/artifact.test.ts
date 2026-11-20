/** A paper's `artifact` key, parsed, and what answers a bar file. */
import { describe, expect, it } from "vitest";
import { answers, parsePaperArtifact } from "./artifact.ts";

describe("parsePaperArtifact", () => {
  it("is null when the paper declares no artifact", () => {
    expect(parsePaperArtifact(undefined)).toEqual({ ok: true, value: null });
  });

  it("takes a folder and its promises", () => {
    expect(
      parsePaperArtifact({
        dir: "../artifact",
        promises: { prompts: "**/prompts/*.md" },
      }),
    ).toEqual({
      ok: true,
      value: { dir: "../artifact", promises: { prompts: "**/prompts/*.md" } },
    });
  });

  it("promises are optional: a folder alone is judged against the bar only", () => {
    expect(parsePaperArtifact({ dir: "artifact" })).toEqual({
      ok: true,
      value: { dir: "artifact", promises: {} },
    });
  });

  it.each<[string, unknown, string]>([
    ["not an object", "artifact", `"artifact" must be an object with a "dir"`],
    [
      "an unknown key",
      { dir: "a", promise: {} },
      `"artifact" has an unknown key "promise" — known: dir, promises`,
    ],
    [
      "no dir",
      { promises: {} },
      `"artifact.dir" must be a folder relative to the paper, got undefined`,
    ],
    [
      "an absolute dir",
      { dir: "/srv/artifact" },
      `"artifact.dir" must be a folder relative to the paper, got "/srv/artifact"`,
    ],
    [
      "an empty dir",
      { dir: "" },
      `"artifact.dir" must be a folder relative to the paper, got ""`,
    ],
    [
      "promises as a list",
      { dir: "a", promises: ["**/*.md"] },
      `"artifact.promises" must be an object of label → glob`,
    ],
    [
      "an empty glob",
      { dir: "a", promises: { prompts: "" } },
      `"artifact.promises" entry "prompts" must be a non-empty glob relative to "artifact.dir", got ""`,
    ],
    [
      "a glob that is not a string",
      { dir: "a", promises: { prompts: 3 } },
      `"artifact.promises" entry "prompts" must be a non-empty glob relative to "artifact.dir", got 3`,
    ],
    [
      "an empty label",
      { dir: "a", promises: { "": "*.md" } },
      `"artifact.promises" entry "" must be a non-empty glob relative to "artifact.dir", got "*.md"`,
    ],
  ])("refuses %s", (_, v, why) => {
    // Guards: each bad shape is refused with the one line naming the key and what it must be.
    expect(parsePaperArtifact(v)).toEqual({ ok: false, error: why });
  });
});

describe("answers — a top-level name answers a bar file by its name before any extension, case ignored", () => {
  it.each<[string, boolean]>([
    ["README.md", true],
    ["readme.txt", true],
    ["README", true],
    ["README.en.md", true],
    ["READMEFIRST.md", false],
    ["docs", false],
    [".README", false],
  ])("%s → %s", (name, yes) => {
    expect(answers(name, "README")).toBe(yes);
  });
});
