/**
 * `local/js-needs-reason`: both halves on planted files, through ESLint's own `Linter`, then the
 * real configuration on a planted new file, then an existing file through the repository's bulk
 * suppressions (`eslint-suppressions.json`), with and without them.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { ESLint, Linter } from "eslint";
import { test } from "vitest";
import { z } from "zod";
import { useTempDir, writeTree } from "../test/support.ts";
import rules from "./js-needs-reason.ts";

const ROOT = join(import.meta.dirname, "..");

/** The module as ESLint's `Plugin` type: its rules are typed against `rule-context.ts`, not ESLint's. */
const isPlugin = (p: unknown): p is ESLint.Plugin =>
  typeof p === "object" && p !== null && "rules" in p;
const plugin: ESLint.Plugin = isPlugin(rules)
  ? rules
  : assert.fail("js-needs-reason.ts does not export a plugin");
const MESSAGE =
  "New code is TypeScript (#78): write this file as .ts, or open it with " +
  "`// JavaScript, not TypeScript: evidence|fixture|config-loader — <why>` " +
  "(evidence kept exactly as it ran; a fixture checked as JavaScript; a config a loader " +
  "that cannot read TypeScript reads).";

/** The rule's messages for `code` as the file `rel`. */
const lint = (rel: string, code: string) =>
  new Linter({ cwd: ROOT })
    .verify(
      code,
      [
        {
          files: ["**/*.{js,mjs,cjs}"],
          plugins: { local: plugin },
          rules: {
            "local/js-needs-reason": "error",
          },
        },
      ],
      { filename: join(ROOT, rel) },
    )
    .map((m) => ({ rule: m.ruleId, line: m.line, message: m.message }));
const FIRES = [{ rule: "local/js-needs-reason", line: 1, message: MESSAGE }];

test("a new .mjs without a reason fails; .js and .cjs too", () => {
  assert.deepEqual(lint("scripts/new.mjs", "export const x = 1;\n"), FIRES);
  assert.deepEqual(lint("scripts/new.js", "export const x = 1;\n"), FIRES);
  assert.deepEqual(lint("scripts/new.cjs", "module.exports = 1;\n"), FIRES);
  // An empty file has no statement to come before, and still names no reason.
  assert.deepEqual(lint("scripts/empty.mjs", ""), FIRES);
});

test("a new file that names an accepted reason at its top passes", () => {
  for (const reason of ["evidence", "fixture", "config-loader"])
    assert.deepEqual(
      lint(
        "scripts/new.mjs",
        `// JavaScript, not TypeScript: ${reason} — why\nexport const x = 1;\n`,
      ),
      [],
    );
  assert.deepEqual(
    lint(
      "bin/new.mjs",
      "#!/usr/bin/env node\n/**\n * JavaScript, not TypeScript: evidence — kept as it ran.\n */\nexport const x = 1;\n",
    ),
    [],
  );
});

test("a reason that is not on the list, or that comes after the code, fails", () => {
  assert.deepEqual(
    lint(
      "scripts/new.mjs",
      "// JavaScript, not TypeScript: smaller — fewer bytes\nexport const x = 1;\n",
    ),
    FIRES,
  );
  assert.deepEqual(
    lint(
      "scripts/new.mjs",
      "export const x = 1;\n// JavaScript, not TypeScript: fixture — late\n",
    ),
    FIRES,
  );
});

/** The repository's own `eslint` CLI on one file: exit code and this rule's findings. */
function cli(
  file: string,
  extra: readonly string[] = [],
): { status: number | null; findings: number } {
  const r = spawnSync(
    process.execPath,
    [
      join(ROOT, "node_modules", "eslint", "bin", "eslint.js"),
      "--format",
      "json",
      ...extra,
      file,
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  const findings = z
    .array(
      z.object({
        messages: z.array(z.object({ ruleId: z.string().nullable() })),
      }),
    )
    .parse(JSON.parse(r.stdout))
    .flatMap((f) => f.messages)
    .filter((m) => m.ruleId === "local/js-needs-reason").length;
  return { status: r.status, findings };
}
const WORK = useTempDir("js-needs-reason-");

test("an existing JavaScript file is suppressed by eslint-suppressions.json, and only by it", () => {
  const old = join(ROOT, "scripts", "rules-see-files.mjs");
  assert.deepEqual(cli(old), { status: 0, findings: 0 });
  const none = writeTree(WORK, { "none.json": "{}\n" });
  assert.deepEqual(
    cli(old, ["--suppressions-location", join(none, "none.json")]),
    { status: 1, findings: 1 },
  );
}, 120_000);

test("the repository's configuration runs the rule on a new file", async () => {
  const eslint = new ESLint({ cwd: ROOT });
  const found = (
    await eslint.lintText("export const x = 1;\n", {
      filePath: join(ROOT, "scripts", "planted-new-file.mjs"),
    })
  ).flatMap((r) => r.messages.map((m) => m.ruleId));
  assert.deepEqual(
    found.filter((id) => id === "local/js-needs-reason"),
    ["local/js-needs-reason"],
  );
}, 120_000);
