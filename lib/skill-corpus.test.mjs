/**
 * skill-corpus.mjs's pure readers on the inputs the shipped corpus never contains: frontmatter
 * that is not a mapping or not YAML, and an `allowed-tools` that is absent.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { parseFm, toolList } from "./skill-corpus.mjs";

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
