import assert from "node:assert/strict";
import { test } from "node:test";
import { exitCodeFor, type ExitCode, type ShimOutcome } from "./exit-code.ts";

/** Every outcome × both modes: [outcome, without --strict, with --strict]. */
const TABLE: readonly (readonly [ShimOutcome, ExitCode, ExitCode])[] = [
  ["written", 0, 0],
  // Guards: in CI a missing banal is an environment error, not a skip that reads as a pass.
  ["no-geometry", 0, 1],
  ["unreadable", 0, 1],
  ["no-such-path", 1, 1],
  // Guards: "the artifact is not built" is its own code, told apart from "extraction crashed".
  ["no-artifact", 3, 3],
  ["usage", 2, 2],
];

for (const [outcome, local, strict] of TABLE)
  test(`exitCodeFor: ${outcome}`, () => {
    assert.equal(exitCodeFor(outcome, { strict: false }), local);
    assert.equal(exitCodeFor(outcome, { strict: true }), strict);
  });
