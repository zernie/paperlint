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
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE).length;
}

const PLANTED = [
  'import { parse } from "@retorquere/bibtex-parser";',
  'import type { Entry } from "@retorquere/bibtex-parser";',
  'export const later = () => import("@retorquere/bibtex-parser/dist/esm/index.js");',
  "export { parse };",
  "export type { Entry };",
].join("\n");

test(
  "an import of the parser outside its adapter is an error — app, domain, another adapter, a skill's script",
  { timeout: 30_000 },
  async () => {
    const counts = await Promise.all(
      [
        "src/planted.ts",
        "src/domain/planted.ts",
        "src/adapters/latex/planted.ts",
        "skills/verify-citations/scripts/planted.mjs",
      ].map((p) => fenced(p, PLANTED)),
    );
    assert.deepEqual(counts, [3, 3, 3, 3]);
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
        await fenced("src/adapters/bibtex/planted.test.ts", PLANTED),
      ],
      [0, 0],
    );
  },
);
