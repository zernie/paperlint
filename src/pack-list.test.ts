/**
 * The pack list (`src/pack-list.ts`) over a process held in memory: the paths of `npm pack`'s JSON,
 * and an error that says how it failed — never an empty list, which would let every link through.
 */
import { expect, it } from "vitest";
import { scriptedProcess } from "./adapters/memory/index.ts";
import { packedPaths } from "./pack-list.ts";

const ENV = { PATH: "/bin" };

it("the paths of the first and only package npm lists, and the command it ran", () => {
  const run = scriptedProcess(() => ({
    kind: "exited",
    status: 0,
    stdout: JSON.stringify([
      { files: [{ path: "package.json" }, { path: "docs/a.md" }] },
    ]),
    stderr: "",
  }));
  // Guards: no tarball is written and no lifecycle script runs; the cwd is the package's.
  expect([packedPaths(run, "/pkg", ENV), run.calls]).toEqual([
    new Set(["package.json", "docs/a.md"]),
    [
      {
        file: "npm",
        args: ["pack", "--dry-run", "--json", "--ignore-scripts"],
        env: ENV,
        timeoutMs: 120_000,
        cwd: "/pkg",
      },
    ],
  ]);
});

it("a failed run throws, naming the exit and what npm said; so does a program that is not there", () => {
  const failing = scriptedProcess(() => ({
    kind: "exited",
    status: 254,
    stdout: "",
    stderr: "ENOENT package.json",
  }));
  const missing = scriptedProcess(() => ({ kind: "not-found", file: "npm" }));
  // Guards: a pack list that could not be read must not read as an empty one.
  expect(() => packedPaths(failing, "/pkg", ENV)).toThrow(
    "`npm pack --dry-run` in /pkg gave no pack list (exit 254: ENOENT package.json); the links of the shipped Markdown cannot be judged without it.",
  );
  expect(() => packedPaths(missing, "/pkg", ENV)).toThrow(
    "`npm pack --dry-run` in /pkg gave no pack list (not-found); the links of the shipped Markdown cannot be judged without it.",
  );
});

it("a reply that is not npm's list of packages with files throws, whatever way it is wrong", () => {
  const replying = (json: unknown) =>
    scriptedProcess(() => ({
      kind: "exited",
      status: 0,
      stdout: JSON.stringify(json),
      stderr: "",
    }));
  // Guards: a shape npm did not promise is an error and never an empty pack list.
  expect(
    [
      {},
      [1],
      [{}],
      [{ files: [1] }],
      [{ files: [{}] }],
      [{ files: [{ path: 3 }] }],
    ].map((json) => () => packedPaths(replying(json), "/pkg", ENV)),
  ).toHaveLength(6);
  [
    {},
    [1],
    [{}],
    [{ files: [1] }],
    [{ files: [{}] }],
    [{ files: [{ path: 3 }] }],
  ].forEach((json) => {
    expect(() => packedPaths(replying(json), "/pkg", ENV)).toThrow(
      "`npm pack --json` gave a list of packages with files.",
    );
  });
});
