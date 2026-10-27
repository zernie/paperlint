import assert from "node:assert/strict";
import { test } from "vitest";
import { absolutePath, asPaperPath, joinPath, paperPath } from "./paths.ts";

test("absolutePath keeps an absolute path as it is", () => {
  assert.equal(absolutePath("/a/b"), "/a/b");
});

test("absolutePath refuses a relative path instead of letting the process's cwd decide it", () => {
  assert.throws(() => absolutePath("a/b"), /not an absolute path: a\/b/);
});

test("joinPath stays under its absolute base", () => {
  assert.equal(joinPath(absolutePath("/a"), "b", "c"), "/a/b/c");
});

test("paperPath: one spelling per file of the paper, and nothing outside it", () => {
  assert.deepEqual(paperPath("./versions/a.tex"), {
    ok: true,
    value: "versions/a.tex",
  });
  assert.deepEqual(paperPath("versions//b/../a.tex"), {
    ok: true,
    value: "versions/a.tex",
  });
  for (const bad of ["../x.tex", "versions/../../x", "/abs/x", "", ".", "a\\b"])
    assert.deepEqual(paperPath(bad), {
      ok: false,
      error: `\`${bad}\` is not a path inside the paper folder`,
    });
});

test("asPaperPath keeps a composed path, and throws on one that is not one spelling inside the paper", () => {
  assert.equal(
    asPaperPath("versions/c/submitted.pdf"),
    "versions/c/submitted.pdf",
  );
  assert.throws(
    () => asPaperPath("versions/./x"),
    /not a path inside the paper folder/,
  );
});
