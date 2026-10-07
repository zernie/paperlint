/**
 * The bibtex parser is fenced to its adapter — checked against the repository's own ESLint config.
 *
 * `src/adapters/bibtex/` is the one place that knows `@retorquere/bibtex-parser`; every other file
 * reads a `.bib` through the `BibReader` port (`src/ports/bib-reader.ts`). Three readers of `.bib`
 * text grew in this package before there was one; the config is what stops a fourth.
 *
 * HOW. The fence the config sets for a path is read from the config itself (`calculateConfigForFile`)
 * and run, alone, by ESLint's own `Linter` over the planted text, parsed without type information.
 * Not `lintText` with the whole config: it is type-aware, and under `CI=true` typescript-eslint infers
 * a single run and builds its program once, from the disk — so a planted text given the path of an
 * existing file is linted against that file's tree. Measured on CI (ubuntu and macOS, 2026-10-07) and
 * locally with `CI=true`: `max-lines-per-function` crashed reading line 81 of the five-line planted
 * text, the tree being `src/references.ts` as committed. The fence needs no types.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint, Linter } from "eslint";
import n from "eslint-plugin-n";
import tseslint from "typescript-eslint";
import { test } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// Loading eslint.config.mjs takes seconds under coverage beside the rest of the suite (as in
// eslint-layers.test.ts), past vitest's 5 s default.
const eslint = new ESLint({ cwd: ROOT });

const RULE = "n/no-restricted-import";

const isRuleEntry = (x: unknown): x is Linter.RuleEntry =>
  Array.isArray(x) && x.length > 0;

/** The fence as the repository's config sets it for the file at `path`, or "off". */
async function fenceAt(path: string): Promise<Linter.RuleEntry> {
  const config: unknown = await eslint.calculateConfigForFile(join(ROOT, path));
  const rules: unknown =
    typeof config === "object" && config !== null && "rules" in config
      ? config.rules
      : undefined;
  const entry: unknown =
    typeof rules === "object" && rules !== null && RULE in rules
      ? Object.entries(rules).find(([k]) => k === RULE)?.[1]
      : undefined;
  return isRuleEntry(entry) ? entry : "off";
}

/** The fence's findings for `source` as the file at `path` (relative to the repository). */
async function fenced(path: string, source: string): Promise<number> {
  const messages = new Linter({ configType: "flat" }).verify(
    source,
    [
      {
        // Named extensions: ESLint lints no file that only a universal `**/*` matches.
        files: ["**/*.{ts,mts,mjs,js,cjs}"],
        plugins: { n },
        languageOptions: { parser: tseslint.parser, sourceType: "module" },
        rules: { [RULE]: await fenceAt(path) },
      },
    ],
    { filename: join(ROOT, path) },
  );
  // Guards: a text the parser refused is linted by no rule — zero findings that prove nothing.
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
