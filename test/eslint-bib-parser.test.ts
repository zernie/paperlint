/**
 * The bibtex parser is fenced to its adapter — checked by the repository's own ESLint config.
 *
 * `src/adapters/bibtex/` is the one place that knows `@retorquere/bibtex-parser`; every other file
 * reads a `.bib` through the `BibReader` port (`src/ports/bib-reader.ts`). Three readers of `.bib`
 * text grew in this package before there was one; the config is what stops a fourth.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { test } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// Type-aware config: ESLint builds the TypeScript program before the first file (as in
// eslint-layers.test.ts), past vitest's 5 s default under coverage.
const eslint = new ESLint({ cwd: ROOT });

const RULE = "n/no-restricted-import";

/** The fence's findings for `source` linted as the file at `path` (relative to the repository). */
async function fenced(path: string, source: string): Promise<number> {
  const [result] = await eslint.lintText(source, {
    filePath: join(ROOT, path),
  });
  const messages = result?.messages ?? [];
  // Guards: a file the parser refused is linted by no rule — zero findings that prove nothing.
  assert.deepEqual(
    messages.filter((m) => m.fatal === true).map((m) => m.message),
    [],
    path,
  );
  return messages.filter((m) => m.ruleId === RULE).length;
}

/** Three imports of the parser — a value, a type, a dynamic subpath — planted in a TypeScript file. */
const PLANTED_TS = [
  'import { parse } from "@retorquere/bibtex-parser";',
  'import type { Entry } from "@retorquere/bibtex-parser";',
  'export const later = () => import("@retorquere/bibtex-parser/dist/esm/index.js");',
  "export { parse };",
  "export type { Entry };",
].join("\n");
/** The same in a script of a skill, which is JavaScript: a value and a dynamic subpath. */
const PLANTED_JS = [
  'import { parse } from "@retorquere/bibtex-parser";',
  'export const later = () => import("@retorquere/bibtex-parser/dist/esm/index.js");',
  "export { parse };",
].join("\n");

// The config is type-aware: a planted text is linted as an EXISTING file of the project, or the
// TypeScript parser refuses a path its program does not hold.
test(
  "an import of the parser outside its adapter is an error — app, domain, another adapter, a skill's script",
  { timeout: 30_000 },
  async () => {
    const counts = await Promise.all([
      fenced("src/references.ts", PLANTED_TS),
      fenced("src/domain/paper-sources.ts", PLANTED_TS),
      fenced("src/adapters/latex/index.ts", PLANTED_TS),
      fenced("skills/verify-citations/scripts/bib-authors.mjs", PLANTED_JS),
    ]);
    assert.deepEqual(counts, [3, 3, 3, 2]);
  },
);

test(
  "the adapter itself, as it is on disk, and its test are not",
  { timeout: 30_000 },
  async () => {
    const own = (p: string) => fenced(p, readFileSync(join(ROOT, p), "utf8"));
    assert.deepEqual(
      [
        await own("src/adapters/bibtex/index.ts"),
        await fenced("src/adapters/bibtex/index.test.ts", PLANTED_TS),
      ],
      [0, 0],
    );
  },
);
