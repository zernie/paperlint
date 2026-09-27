/**
 * The `Download` contract against the real curl, on `file://` URLs (no network): bytes come back,
 * the temp file is removed, and a missing curl is named as that.
 */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll as after, test } from "vitest";
import type { AbsolutePath } from "../../domain/paths.ts";
import { curlDownload, curlFailure } from "./download.io.ts";
import type { ProcessExit } from "../../ports/process.ts";
import { spawnProcess } from "../node/index.ts";

const root = realpathSync(
  mkdtempSync(join(tmpdir(), "paperlint-download-test-")),
);
after(() => {
  rmSync(root, { recursive: true, force: true });
});
const at = (...p: string[]) => join(root, ...p) as AbsolutePath;

const dl = (env: Record<string, string>) => {
  const tmp = at("dl-tmp");
  mkdirSync(tmp, { recursive: true });
  return { d: curlDownload({ run: spawnProcess(), env, tmpDir: tmp }), tmp };
};

test("Download: a file:// URL comes back as its bytes, and the temp file is gone", () => {
  const src = at("served");
  writeFileSync(src, "banal bytes");
  const { d, tmp } = dl({ PATH: "/usr/bin:/bin" });
  const r = d.fetch(pathToFileURL(src).href, 10_000);
  assert.equal(r.ok && new TextDecoder().decode(r.value), "banal bytes");
  assert.deepEqual(readdirSync(tmp), []);
});

test("Download: a URL that does not answer is a failure with curl's words", () => {
  const { d } = dl({ PATH: "/usr/bin:/bin" });
  const r = d.fetch(pathToFileURL(at("missing")).href, 10_000);
  assert.equal(r.ok, false);
  assert.ok(r.error.detail.length > 0);
});

test("🔴 Download: no curl on PATH is named as that, not as a failed URL", () => {
  const empty = at("empty-bin");
  mkdirSync(empty, { recursive: true });
  const { d } = dl({ PATH: empty });
  const r = d.fetch("https://example.test/banal", 10_000);
  // Guards: a missing curl is its own diagnosis — once, it read "spawnSync curl ENOENT".
  assert.deepEqual(!r.ok && r.error, { detail: "curl is not installed" });
});

test("curlFailure: every way curl can end, in its own words", () => {
  const cases: readonly [ProcessExit, string | null][] = [
    [{ kind: "exited", status: 0, stdout: "", stderr: "" }, null],
    [{ kind: "spawn-failed", message: "EACCES" }, "EACCES"],
    [
      { kind: "timed-out", afterMs: 40_000, stdout: "", stderr: "" },
      "no answer after 40000 ms",
    ],
    [{ kind: "exited", status: 22, stdout: "", stderr: "" }, "curl exited 22"],
    [
      {
        kind: "exited",
        status: 22,
        stdout: "",
        stderr: "curl: (22) 404\nmore",
      },
      "curl: (22) 404",
    ],
    [
      { kind: "signalled", signal: "SIGTERM", stdout: "", stderr: "" },
      "SIGTERM",
    ],
  ];
  for (const [exit, words] of cases) assert.equal(curlFailure(exit), words);
});

test("Download: curl exits 0 and writes nothing — a failure that says so, not empty bytes", () => {
  const tmp = at("dl-silent");
  mkdirSync(tmp, { recursive: true });
  const d = curlDownload({
    run: { run: () => ({ kind: "exited", status: 0, stdout: "", stderr: "" }) },
    env: {},
    tmpDir: tmp,
  });
  assert.deepEqual(d.fetch("https://example.test/banal", 1_000), {
    ok: false,
    error: { detail: "curl wrote no file" },
  });
  assert.deepEqual(readdirSync(tmp), []);
});
