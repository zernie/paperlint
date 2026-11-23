/**
 * The one reader of `papersDir`: every spelling a project root resolves the same way is the same
 * directory, a list is several, and a path is placed among them by segments, not by its spelling.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { papersRoots, segmentsUnder, toPaths } from "./papers-roots.ts";

test("a papers directory given as a string or as a list normalises to a list; anything else to none", () => {
  assert.deepEqual(
    [
      toPaths(" papers "),
      toPaths(["a", "", 3, "b"]),
      toPaths(undefined),
      toPaths("  "),
      toPaths(null),
    ],
    [["papers"], ["a", "b"], [], [], []],
  );
});

test("every spelling that resolves to the same directory is the same absolute directory; none means the default", () => {
  const roots = (papersDir?: unknown) =>
    papersRoots({ opts: { papersDir }, root: "/p" });
  assert.deepEqual(
    [
      roots("./papers"),
      roots(".//papers//"),
      roots("x/../papers"),
      roots(),
      roots(["a", "/abs"]),
    ],
    [
      ["/p/papers"],
      ["/p/papers"],
      ["/p/papers"],
      ["/p/papers"],
      ["/p/a", "/abs"],
    ],
  );
});

test("a path is placed under the first directory that holds it, by its segments", () => {
  const roots = ["/p/a", "/p/papers"];
  assert.deepEqual(
    [
      segmentsUnder("/p/papers/x/paper.tex", roots),
      segmentsUnder("/p/a/y", roots),
      segmentsUnder("/p/papers", roots),
      segmentsUnder("/p/papers-old/x", roots),
      segmentsUnder("/elsewhere/papers/x", roots),
      segmentsUnder("/p/papers/..draft/paper.tex", roots),
    ],
    [["x", "paper.tex"], ["y"], null, null, null, ["..draft", "paper.tex"]],
  );
});
