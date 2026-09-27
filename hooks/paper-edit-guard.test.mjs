/**
 * paper-edit-guard's Bash scan on the shapes the hooks harness does not carry: a `>` inside quotes
 * or escaped (not a redirection), a target spelled with backslashes (read through them), a target
 * ended by a delimiter, and a mutator that moves a paper source AWAY — a write `writesTo` does not
 * see, which the `touches` fallback catches. Each case runs the hook the way a consumer's settings
 * run it: `vigiles hook-runtime run-program`, from a throwaway project.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  hookConsumer,
  onBash,
  runShippedHook,
} from "../test/hook-consumer.mjs";
import { useTempDir } from "../test/support.mjs";

const dir = hookConsumer(useTempDir("paper-edit-guard-"), {
  "papers/alpha/PIPELINE-STATUS.md": "# S\n",
});
/** `>` built rather than typed: a literal one here would be a redirection to the guard's own scan. */
const GT = String.fromCharCode(62);
const P = "papers/alpha/paper.md";

/** The guard's exit code for one Bash command: 2 denies, 0 lets it through. */
const guard = (command) =>
  runShippedHook("paper-edit-guard", onBash(command), dir).exitCode;

test("a `>` inside quotes, after an escaped quote, or escaped itself is not a redirection", () => {
  assert.deepEqual(
    [
      guard(`echo "a ${GT} ${P}"`),
      guard(`echo "a \\" ${GT} b"`),
      guard(`echo a\\${GT} ${P}`),
    ],
    [0, 0, 0],
  );
});

test("a redirection target is read through backslashes, quoted or not, and ends at a delimiter", () => {
  assert.deepEqual(
    [
      guard(`echo x ${GT} "papers/alpha/pa\\per.md"`),
      guard(`echo x ${GT} papers/alpha/pa\\per.md`),
      guard(`echo x ${GT}${P}; true`),
    ],
    [2, 2, 2],
  );
});

test("moving a paper source away is a write to it: denied", () => {
  assert.equal(guard(`mv ${P} /tmp/elsewhere.md`), 2);
});
