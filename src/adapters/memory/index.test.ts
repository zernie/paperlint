/** The in-memory test doubles keep the contracts of the ports they stand in for. */
import assert from "node:assert/strict";
import { test } from "vitest";
import { fixedDownload, memoryWorkspace } from "./index.ts";

test("memoryWorkspace: a `within` that throws is recorded as `threw`, and the error goes on", () => {
  const ws = memoryWorkspace();
  assert.throws(
    () =>
      ws.within("x-", (s) => {
        s.write("f", "body", "read");
        throw new Error("inside");
      }),
    /inside/,
  );
  assert.deepEqual(ws.ended, ["threw"]);
  assert.deepEqual(ws.written, [{ name: "f", content: "body", mode: "read" }]);
});

test("fixedDownload: bytes are handed back as they are, and every URL is recorded", () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const d = fixedDownload(bytes);
  assert.deepEqual(d.fetch("https://a", 1), { ok: true, value: bytes });
  assert.deepEqual(d.urls, ["https://a"]);
});
