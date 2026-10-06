/**
 * paper-edit-guard's Bash scan on the shapes the hooks harness does not carry: a `>` inside quotes
 * or escaped (not a redirection), a target spelled with backslashes (read through them), a target
 * ended by a delimiter, and a mutator that moves a paper source AWAY — a write `writesTo` does not
 * see, which the `touches` fallback catches. Each case runs the hook the way a consumer's settings
 * run it: `vigiles hook-runtime run-program`, from a throwaway project.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { hookConsumer, onBash, runShippedHook } from "../test/hook-consumer.ts";
import { useTempDir } from "../test/support.ts";

const dir = hookConsumer(useTempDir("paper-edit-guard-"), {
  "papers/alpha/PIPELINE-STATUS.md": "# S\n",
});
/** `>` built rather than typed: a literal one here would be a redirection to the guard's own scan. */
const GT = String.fromCharCode(62);
const P = "papers/alpha/paper.tex";

/** The guard's exit code for one Bash command: 2 denies, 0 lets it through. */
const guard = (command: string): number =>
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
      guard(`echo x ${GT} "papers/alpha/pa\\per.tex"`),
      guard(`echo x ${GT} papers/alpha/pa\\per.tex`),
      guard(`echo x ${GT}${P}; true`),
    ],
    [2, 2, 2],
  );
});

test("moving a paper source away is a write to it: denied", () => {
  assert.equal(guard(`mv ${P} /tmp/elsewhere.md`), 2);
});

test("a command cut off right after a backslash still names its target, quoted or not", () => {
  // The backslash escapes nothing — there is no next character — and the target read so far
  // is still a paper source.
  assert.deepEqual(
    [guard(`echo x ${GT} ${P}\\`), guard(`echo x ${GT} "${P}\\`)],
    [2, 2],
  );
});

test("a Markdown file under a paper is not a paper source: copying over it is let through", () => {
  // Guards: a paper's source is `paper.tex`; `paper.md` and `draft.md` are notes like any other.
  // (A redirection is refused for ANY file under the papers root, so the argv leg is the one
  // that says which files are sources.)
  assert.deepEqual(
    [
      guard("cp /tmp/x papers/alpha/paper.md"),
      guard("cp /tmp/x papers/alpha/draft.md"),
      guard(`cp /tmp/x ${P}`),
    ],
    [0, 0, 2],
  );
});
