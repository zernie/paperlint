/**
 * `local/js-needs-reason`: both halves on planted files, through ESLint's own `Linter`, then the
 * real configuration on a planted new file, then the grandfathered list against the disk.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ESLint, Linter } from "eslint";
import { test } from "vitest";
import { z } from "zod";
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

/** The rule's messages for `code` as the file `rel`, with `old` grandfathered. */
const lint = (rel: string, code: string, old: readonly string[] = []) =>
  new Linter({ cwd: ROOT })
    .verify(
      code,
      [
        {
          files: ["**/*.{js,mjs,cjs}"],
          plugins: { local: plugin },
          rules: {
            "local/js-needs-reason": ["error", { grandfathered: [...old] }],
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

test("a grandfathered file passes without a reason", () => {
  assert.deepEqual(
    lint("scripts/old.mjs", "export const x = 1;\n", ["scripts/old.mjs"]),
    [],
  );
});

test("the repository's configuration runs the rule on a new file and spares an old one", async () => {
  const eslint = new ESLint({ cwd: ROOT });
  const rules = async (filePath: string): Promise<(string | null)[]> =>
    (
      await eslint.lintText("export const x = 1;\n", {
        filePath: join(ROOT, filePath),
      })
    ).flatMap((r) => r.messages.map((m) => m.ruleId));
  assert.deepEqual(
    (await rules("scripts/planted-new-file.mjs")).filter(
      (id) => id === "local/js-needs-reason",
    ),
    ["local/js-needs-reason"],
  );
  assert.deepEqual(
    (await rules("scripts/rules-see-files.mjs")).filter(
      (id) => id === "local/js-needs-reason",
    ),
    [],
  );
}, 120_000);

test("the grandfathered list only shrinks: every entry is a tracked JavaScript file, sorted, once", () => {
  const listed = z
    .array(z.string())
    .parse(
      JSON.parse(
        readFileSync(
          join(ROOT, "eslint-rules", "js-grandfathered.json"),
          "utf8",
        ),
      ),
    );
  const tracked = new Set(
    execFileSync("git", ["ls-files", "*.js", "*.mjs", "*.cjs"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean),
  );
  assert.deepEqual(
    listed.filter((f) => !tracked.has(f)),
    [],
    "remove these from js-grandfathered.json: the file is gone or no longer JavaScript",
  );
  assert.deepEqual(listed, [...new Set(listed)].sort());
});
