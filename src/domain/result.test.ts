import assert from "node:assert/strict";
import { test } from "vitest";
import { andThen, err, map, match, ok, type Result } from "./result.ts";

const half = (n: number): Result<number, string> =>
  n % 2 === 0 ? ok(n / 2) : err(`${n} is odd`);

test("map and andThen run on ok and pass an error through untouched", () => {
  assert.deepEqual(
    map(ok(2), (n) => n + 1),
    ok(3),
  );
  assert.deepEqual(andThen(ok(8), half), ok(4));
  // Guards: an error short-circuits — the function after it is not called.
  assert.deepEqual(
    andThen(half(3), () => assert.fail("called after an error")),
    err("3 is odd"),
  );
});

test("match picks the branch by `ok`", () => {
  const say = (r: Result<number, string>) =>
    match(r, { ok: (n) => `got ${n}`, err: (e) => `no: ${e}` });
  assert.equal(say(half(4)), "got 2");
  assert.equal(say(half(5)), "no: 5 is odd");
});
