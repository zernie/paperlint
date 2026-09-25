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
import { after, test } from "node:test";
import type { AbsolutePath } from "../../core/ports.ts";
import { curlDownload } from "./download.ts";
import { spawnProcess } from "./process.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-download-test-")));
after(() => rmSync(root, { recursive: true, force: true }));
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
  assert.ok(!r.ok && r.error.detail.length > 0);
});

test("🔴 Download: no curl on PATH is named as that, not as a failed URL", () => {
  const empty = at("empty-bin");
  mkdirSync(empty, { recursive: true });
  const { d } = dl({ PATH: empty });
  const r = d.fetch("https://example.test/banal", 10_000);
  // Guards: a missing curl is its own diagnosis — once, it read "spawnSync curl ENOENT".
  assert.deepEqual(!r.ok && r.error, { detail: "curl is not installed" });
});
