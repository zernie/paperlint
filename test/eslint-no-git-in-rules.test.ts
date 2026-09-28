/**
 * A rule may not ask git — checked by the repository's own ESLint config, on the rule sources in
 * `eslint-rules/`, whatever their extension.
 *
 * Why the property matters is written where the selectors are declared (`eslint.config.mjs`,
 * `GIT_IN_A_RULE`): a sha is a pointer that routine maintenance deletes, and a shallow CI checkout
 * does not have it at all. Until #128 this was a hand-written script that picked rule sources by
 * the `.mjs` extension, so after the move to TypeScript it checked none of them and stayed green.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { test } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// Type-aware config: ESLint builds the TypeScript program before the first file. 2.4 s alone, past
// vitest's 5 s default under coverage beside the rest of the suite (same as eslint-layers.test.ts).
const eslint = new ESLint({ cwd: ROOT });

/** Messages of the repository's config for `source` as a rule module at `eslint-rules/<name>`. */
async function lintRule(name: string, source: string): Promise<string[]> {
  const [result] = await eslint.lintText(source, {
    filePath: join(ROOT, "eslint-rules", name),
  });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-syntax")
    .map((m) => m.message);
}

test(
  "a rule that runs git is an error, whichever spawner and however it is imported",
  { timeout: 30_000 },
  async () => {
    const src = [
      'import { execSync, spawnSync } from "node:child_process";',
      'import * as cp from "node:child_process";',
      'execSync("git cat-file -e abc123");',
      'spawnSync("git", ["log"]);',
      'cp.execFileSync("git", ["rev-parse", "HEAD"]);',
    ].join("\n");
    const messages = await lintRule("planted.mjs", src);
    assert.equal(messages.length, 3, messages.join("\n"));
    assert.ok(messages.every((m) => m.includes("git")));
  },
);

test(
  "the words and other programs are not findings: comments, strings, a non-git spawn",
  { timeout: 30_000 },
  async () => {
    const src = [
      'import { execSync } from "node:child_process";',
      "// A rule used to call git cat-file here.",
      'const doc = "git cat-file -e is what paper/source used to run";',
      'execSync("pdflatex paper.tex");',
      'execSync("gitk");',
      "export { doc };",
    ].join("\n");
    assert.deepEqual(await lintRule("clean.mjs", src), []);
  },
);

test(
  "the TypeScript rule sources get the same selectors, and tests of rules do not",
  { timeout: 30_000 },
  async () => {
    const selectors = async (file: string): Promise<string[]> => {
      const config: unknown = await eslint.calculateConfigForFile(
        join(ROOT, file),
      );
      const rules =
        typeof config === "object" && config !== null && "rules" in config
          ? config.rules
          : undefined;
      const entry =
        typeof rules === "object" &&
        rules !== null &&
        "no-restricted-syntax" in rules
          ? rules["no-restricted-syntax"]
          : undefined;
      return (Array.isArray(entry) ? entry : []).flatMap((o: unknown) =>
        typeof o === "object" &&
        o !== null &&
        "selector" in o &&
        typeof o.selector === "string"
          ? [o.selector]
          : [],
      );
    };
    const onRule = await selectors("eslint-rules/paper-stages.ts");
    assert.ok(
      onRule.some((s) => s.includes("git")),
      `eslint-rules/paper-stages.ts is not checked for git:\n${onRule.join("\n")}`,
    );
    // The `as unknown as` ban of the TypeScript block must survive: a later block REPLACES a rule's
    // options, it does not merge them.
    assert.ok(onRule.some((s) => s.includes("TSUnknownKeyword")));
    const onTest = await selectors("eslint-rules/paper-stages.test.mjs");
    assert.ok(
      !onTest.some((s) => s.includes("git")),
      "a test may plant a git call",
    );
  },
);
