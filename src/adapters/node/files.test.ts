/** The `Files` contract against the real disk: absence is null, and writes go through `.part`. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll as after, test } from "vitest";
import type { AbsolutePath } from "../../domain/ports.ts";
import { nodeFiles } from "./files.io.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "rpp-files-test-")));
after(() => rmSync(root, { recursive: true, force: true }));
const at = (...p: string[]) => join(root, ...p) as AbsolutePath;

test("Files: a missing file reads as null and is not a file", () => {
  assert.equal(nodeFiles.readBytes(at("nope")), null);
  assert.equal(nodeFiles.isFile(at("nope")), false);
  assert.equal(nodeFiles.isFile(at()), false);
});

test("Files: writeAtomic creates the directory and leaves no .part behind", () => {
  const p = at("a", "b", "banal");
  nodeFiles.writeAtomic(p, new TextEncoder().encode("x"));
  assert.equal(
    new TextDecoder().decode(nodeFiles.readBytes(p) ?? undefined),
    "x",
  );
  assert.equal(existsSync(`${p}.part`), false);
});
