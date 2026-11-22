/**
 * parseFm on the inputs the shipped corpus never contains: frontmatter that is not a mapping or
 * not YAML.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { parseFm } from "./skill-corpus.mjs";

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

test("parseFm returns the mapping of a valid frontmatter", () => {
  assert.deepEqual(
    parseFm('name: x\ndescription: "a: b"\nallowed-tools: [Read]'),
    {
      name: "x",
      description: "a: b",
      "allowed-tools": ["Read"],
    },
  );
});
