/**
 * The `Workspace` contract against a real temp directory: the directory exists inside the scope and
 * is gone after it, whether the scope returned or threw; `stage` writes both files, the stub
 * executable, and the stub answers `-v` through the same shell banal uses.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll as after, test } from "vitest";
import { shQuote, stageBanalInput } from "../../core/banal/invocation.ts";
import { tmpWorkspace } from "./workspace.io.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-ws-test-")));
after(() => rmSync(root, { recursive: true, force: true }));

test("the directory exists inside the scope and is gone after it", () => {
  const ws = tmpWorkspace(root);
  const dir = ws.within("rpp-banal-", (s) => {
    assert.ok(existsSync(s.dir));
    return s.dir;
  });
  // Guards: cleanup — a paper's text must not pile up in the temp directory, one copy per build.
  assert.equal(existsSync(dir), false);
});

test("the directory is gone after a throw too", () => {
  let seen = "";
  assert.throws(() =>
    tmpWorkspace(root).within("rpp-banal-", (s) => {
      seen = s.dir;
      throw new Error("boom");
    }),
  );
  assert.equal(existsSync(seen), false);
});

test("🔴 stage: the stub answers `-v` through the shell, from a path with a space and a quote", () => {
  const awkward = join(root, "it's a dir");
  mkdirSync(awkward);
  tmpWorkspace(awkward).within("rpp-banal-", (s) => {
    const staged = s.stage(stageBanalInput([]));
    assert.ok(existsSync(staged.xml));
    // Guards: banal runs `$PDFTOHTML -v 2>&1 |` through /bin/sh, unquoted.
    const v = spawnSync("/bin/sh", ["-c", `${shQuote(staged.stub)} -v 2>&1`], {
      encoding: "utf8",
    });
    assert.equal(v.stdout.trim(), "pdftohtml version 24.02.0");
    const convert = spawnSync(staged.stub, ["-xml", "paper.pdf", "out"], {
      encoding: "utf8",
    });
    assert.equal(convert.status, 1);
    assert.match(convert.stderr, /only answers -v/);
  });
});
