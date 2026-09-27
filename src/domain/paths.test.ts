import assert from "node:assert/strict";
import { test } from "vitest";
import { absolutePath, joinPath } from "./paths.ts";

test("absolutePath keeps an absolute path as it is", () => {
  assert.equal(absolutePath("/a/b"), "/a/b");
});

test("absolutePath refuses a relative path instead of letting the process's cwd decide it", () => {
  assert.throws(() => absolutePath("a/b"), /not an absolute path: a\/b/);
});

test("joinPath stays under its absolute base", () => {
  assert.equal(joinPath(absolutePath("/a"), "b", "c"), "/a/b/c");
});
