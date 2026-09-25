/**
 * The `Workspace` contract against a real temp directory: the directory exists inside the scope and
 * is gone after it, whether the scope returned or threw; `write` puts a file in it, runnable when
 * asked. What banal stages through it is `src/adapters/banal/invocation.test.ts`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll as after, test } from "vitest";
import { tmpWorkspace } from "./workspace.io.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "paperlint-ws-test-")));
after(() => rmSync(root, { recursive: true, force: true }));

test("the directory exists inside the scope and is gone after it", () => {
  const ws = tmpWorkspace(root);
  const dir = ws.within("paperlint-banal-", (s) => {
    assert.ok(existsSync(s.dir));
    return s.dir;
  });
  // Guards: cleanup — a paper's text must not pile up in the temp directory, one copy per build.
  assert.equal(existsSync(dir), false);
});

test("the directory is gone after a throw too", () => {
  let seen = "";
  assert.throws(() =>
    tmpWorkspace(root).within("paperlint-banal-", (s) => {
      seen = s.dir;
      throw new Error("boom");
    }),
  );
  assert.equal(existsSync(seen), false);
});

test("🔴 write: the file lands in the scope's directory, and `exec` makes it runnable — from a path with a space and a quote", () => {
  const awkward = join(root, "it's a dir");
  mkdirSync(awkward);
  tmpWorkspace(awkward).within("paperlint-ws-", (s) => {
    const plain = s.write("data.txt", "hello", "read");
    assert.equal(readFileSync(plain, "utf8"), "hello");
    const script = s.write("run", "#!/bin/sh\necho ran\n", "exec");
    // Guards: the exec bit — banal runs the staged stub as a program, and a 0644 file is refused.
    const r = spawnSync(script, [], { encoding: "utf8" });
    assert.equal(r.stdout, "ran\n");
    assert.equal(statSync(plain).mode & 0o111, 0);
  });
});
