import assert from "node:assert/strict";
import { test } from "vitest";
import { actionRef } from "./action-ref.ts";

/** [the running package's version, the ref `paperlint init` may pin the action to]. */
const TABLE: readonly (readonly [string | undefined, string | null])[] = [
  ["1.2.3", "v1.2.3"],
  ["1.0.0", "v1.0.0"],
  ["10.20.30", "v10.20.30"],
  // Guards: a git checkout / `npm link` carries the unreleased placeholder — there is no tag for it.
  ["0.0.0-semantically-released", null],
  // Guards: only a plain release is known to have a tag; anything else stays the placeholder.
  ["1.2.3-beta.1", null],
  ["v1.2.3", null],
  ["1.2", null],
  ["", null],
  ["latest", null],
  [" 1.2.3", null],
  // Guards: the CLI could not read its own manifest — no version, no pin.
  [undefined, null],
];

for (const [version, ref] of TABLE)
  test(`actionRef(${JSON.stringify(version)})`, () => {
    assert.equal(actionRef(version), ref);
  });
