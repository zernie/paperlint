import assert from "node:assert/strict";
import { test } from "vitest";
import { parseSha256, sha256Hex } from "./sha256.ts";

test("parseSha256 refuses a typo in a pin", () => {
  assert.throws(() => parseSha256("abc"), /not a sha256/);
});

test("sha256Hex hashes bytes into a value parseSha256 accepts", () => {
  const h = sha256Hex(new TextEncoder().encode("banal"));
  assert.equal(parseSha256(h), h);
});
