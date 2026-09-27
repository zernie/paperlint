/**
 * rules-see-files' gate: a temp repository whose config declares a rule on a glob matching nothing.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { useTempDir, writeTree } from "../test/support.mjs";
import { main as seeMain } from "./rules-see-files.mjs";

const capture = () => {
  const out = [];
  const io = { log: (s) => out.push(s), err: (s) => out.push(`E ${s}`) };
  return { out, io };
};

const root = useTempDir("rules-see-files-");

test("rules-see-files: a rule declared on a glob that matches nothing is named and fails", async () => {
  writeTree(root, {
    "see/eslint.config.mjs":
      'export default [{ files: ["**/*.js"], rules: { "no-debugger": "error" } }, { files: ["**/*.nothing"], rules: { "no-undef": "error", "eqeqeq": "off" } }];\n',
    "see/a.js": "export const a = 1;\n",
    "see/package.json": '{ "type": "module" }\n',
  });
  const { out, io } = capture();
  const code = await seeMain({ cwd: `${root}/see`, ...io });
  assert.deepEqual(
    { code, out },
    {
      code: 1,
      out: [
        "   1  no-debugger",
        "   0  no-undef",
        "\n2 rule(s) declared, 2 file(s) linted.",
        "\n✗ 1 rule(s) saw NO file and were never invoked:\n    no-undef\n\n" +
          "  A rule that is never invoked reports exactly what a rule that passed reports.\n" +
          "  Fix the glob it is declared on, or delete the declaration — do not leave it green.",
      ],
    },
  );
});

test("rules-see-files: every rule seeing a file passes — asked with a trailing slash, and as a program", async () => {
  writeTree(root, {
    "ok/eslint.config.mjs":
      'export default [{ files: ["**/*.js"], rules: { "no-debugger": ["error"] } }];\n',
    "ok/a.js": "export const a = 1;\n",
    "ok/package.json": '{ "type": "module" }\n',
  });
  const { out, io } = capture();
  const code = await seeMain({ cwd: `${root}/ok/`, ...io });
  assert.deepEqual(
    { code, out },
    {
      code: 0,
      out: [
        "   1  no-debugger",
        "\n1 rule(s) declared, 2 file(s) linted.",
        "✓ every declared rule was enabled for at least one file on disk.",
      ],
    },
  );
  const run = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./rules-see-files.mjs", import.meta.url))],
    { cwd: `${root}/ok`, encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /✓ every declared rule was enabled/);
});
