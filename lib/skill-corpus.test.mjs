/**
 * skill-corpus.mjs's pure readers on the inputs the shipped corpus never contains: frontmatter
 * that is not a mapping or not YAML, an `allowed-tools` that is absent, a skill with no record
 * block and one whose record block ends the file.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { parseFm, recordBlock, toolList } from "./skill-corpus.mjs";

const refusal = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e.message.split(". Almost")[0];
  }
};

test("parseFm refuses a list, a bare string and broken YAML, naming where", () => {
  assert.deepEqual(
    [
      refusal(() => parseFm("- a\n- b", "x/SKILL.md")),
      refusal(() => parseFm("just words")),
      refusal(() => parseFm("a: b: c")),
    ],
    [
      "x/SKILL.md: frontmatter is not valid YAML — parsed to a list, not a mapping",
      "frontmatter: frontmatter is not valid YAML — parsed to string, not a mapping",
      "frontmatter: frontmatter is not valid YAML — bad indentation of a mapping entry (1:5)",
    ],
  );
});

test("toolList of nothing is an empty contract, and a flow list or a comma scalar is split", () => {
  assert.deepEqual(
    [
      toolList(undefined),
      toolList("[Bash, Read]"),
      toolList(" Read , Write "),
      toolList(["Read ", ""]),
    ],
    [[], ["Bash", "Read"], ["Read", "Write"], ["Read"]],
  );
});

test("recordBlock: none without the heading; to the end of the file when it is the last section", () => {
  assert.deepEqual(
    [
      recordBlock("# S\n\n## Run me\n\nx\n"),
      recordBlock("# S\n\n## Record the verdict\n\nlast\n"),
    ],
    [null, "## Record the verdict\n\nlast\n"],
  );
});
