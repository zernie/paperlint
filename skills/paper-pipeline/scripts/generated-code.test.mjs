/**
 * generated-code.mjs on the inputs its harness does not build: no argument, a directory that does
 * not exist, and a repro/ holding a dangling link, dot/dependency directories, trees deeper than
 * the scan's depth (more than eight, so the list is elided), and an allow row with no reason.
 */
import assert from "node:assert/strict";
import { symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir, writeTree } from "../../../test/support.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "generated-code.mjs",
);
const root = useTempDir("generated-code-");
const run = (...args) => runNode(SCRIPT, args);

test("no argument prints the usage; a directory that does not exist scanned nothing, and says so", () => {
  assert.deepEqual(run(), {
    status: 0,
    stdout: "",
    stderr: "usage: node generated-code.mjs <paper-dir> [--flags-only]\n",
  });
  const r = run(join(root, "nowhere"));
  assert.equal(r.status, 0);
  assert.match(
    r.stdout,
    /NOTHING WAS SCANNED: no repro\/ here or one level below/,
  );
});

test("repro/: a dangling link is passed over; skipped trees are named, more than eight elided; a reasonless allow row says so", () => {
  const deep = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      `repro/exp/d${String(i)}/deeper/x.py`,
      "print(1)\n",
    ]),
  );
  const dir = writeTree(join(root, "paper"), {
    ...deep,
    "repro/.cache/x.py": "",
    // eslint-disable-next-line port/js-install-path -- a fixture directory the scan must skip, not an install location
    "repro/node_modules/x.js": "",
    "repro/__pycache__/x.py": "",
    // Draws randomness unseeded: a NO_SEED finding, which the reasonless row below waves through.
    "repro/exp/run.py": "import random\nprint(random.random())\n",
    "repro/generated-code-grandfathered.txt": "exp/run.py\t*\n",
  });
  symlinkSync(join(root, "gone"), join(dir, "repro", "dangling.py"));
  const out = run(dir).stdout;
  assert.match(
    out,
    /• 3 tree\(s\) not entered — dependency, VCS and build trees[^\n]*\n {7}\.cache, __pycache__, node_modules/,
  );
  assert.match(
    out,
    /• 10 tree\(s\) not entered — nested deeper than 3 levels[^\n]*\n {7}(?:exp\/d\d\/deeper, ){7}exp\/d\d\/deeper … and 2 more/,
  );
  assert.match(out, / {7}exp\/run\.py · NO_SEED {2}→ {2}\(NO REASON GIVEN\)/);
});
