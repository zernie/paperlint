/**
 * verify-cites.mjs as a process — the way the verify-citations skill runs it, which is THROUGH A
 * SYMLINK (`.claude/skills/verify-citations -> …/skills/verify-citations`, made by `paperlint
 * init`). Only `--offline` runs here: the online resolvers are driven in-process with a fake
 * `fetch` (verify-cites.net.test.mjs), because a test must not depend on four live APIs.
 */
import assert from "node:assert/strict";
import { symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { runNode, useTempDir } from "../../../test/support.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const root = useTempDir("verify-cites-cli-");
// The skill's own address for the script: a link to the skill directory, as `paperlint init` makes.
symlinkSync(join(HERE, ".."), join(root, "verify-citations"));
const LINKED = join(root, "verify-citations", "scripts", "verify-cites.mjs");

test("run through the skill's symlink, the CLI runs at all (--help prints the usage)", () => {
  assert.deepEqual(runNode(LINKED, ["--help"]), {
    status: 0,
    stdout: "",
    stderr: "usage: verify-cites.mjs <cites.json | refs.bib | -> [--offline]\n",
  });
});
