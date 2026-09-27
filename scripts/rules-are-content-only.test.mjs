/**
 * rules-are-content-only's gate over a consumer's `eslint-rules/`: temp trees with planted rules.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.mjs";
import { main as contentMain } from "./rules-are-content-only.mjs";

const capture = () => {
  const out = [];
  const io = { log: (s) => out.push(s), err: (s) => out.push(`E ${s}`) };
  return { out, io };
};

const root = useTempDir("content-only-");

test("rules-are-content-only: a rule asking git is a finding, clean rules pass", () => {
  writeTree(root, {
    "dirty/eslint-rules/asks-git.mjs":
      'import { execFileSync } from "node:child_process";\nexecFileSync("git", ["log"]);\n',
    "dirty/eslint-rules/clean.mjs": "export default {};\n",
    "clean/eslint-rules/clean.mjs": "export default {};\n",
  });
  const runs = ["dirty", "clean"].map((d) => {
    const { out, io } = capture();
    return [
      contentMain({ cwd: `${root}/${d}`, ...io }),
      out.map((l) => l.replace(root, "<root>").split(". ")[0]),
    ];
  });
  assert.deepEqual(runs, [
    [
      1,
      [
        "E asks-git.mjs: imports `git`",
        "rules-are-content-only: 2 rule sources under <root>/dirty, 1 findings",
      ],
    ],
    [
      0,
      ["rules-are-content-only: 1 rule sources under <root>/clean, 0 findings"],
    ],
  ]);
});
