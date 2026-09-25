import assert from "node:assert/strict";
import { test } from "node:test";
import { installedState, sha256Hex, verifyPin } from "./install.ts";
import { parseSha256 } from "./pin.ts";

const bytes = new TextEncoder().encode("banal");
const source = { url: "file:///x", sha256: sha256Hex(bytes) };

test("verifyPin: the pinned bytes pass; others are refused with both hashes", () => {
  assert.ok(verifyPin(bytes, source).ok);
  const r = verifyPin(new TextEncoder().encode("other"), source);
  assert.equal(!r.ok && r.error.expected, source.sha256);
});

test("installedState: absent, other bytes, pinned — one predicate for install and --check", () => {
  assert.equal(installedState(null, source).kind, "absent");
  // Guards: the pin is checked on every run — a changed file is not trusted.
  assert.equal(installedState(new Uint8Array([1]), source).kind, "other-bytes");
  assert.equal(installedState(bytes, source).kind, "pinned");
});

test("parseSha256 refuses a typo in a pin", () => {
  assert.throws(() => parseSha256("abc"), /not a sha256/);
});
