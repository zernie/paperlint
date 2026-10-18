/**
 * The modules that read a study's folder may not import the `Files` port — checked against the
 * repository's own ESLint config, the way test/eslint-bib-parser.test.ts checks the bibtex fence.
 *
 * `src/study-folder.ts` is the one reader that walks a study's paths without following a symbolic
 * link (#227); the order rule, the gate, the index's input and the mode reader take a `StudyFolder`.
 * The fence shares its rule id with the bibtex one, so these files must keep that entry too.
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

const PLANTED = [
  'import type { Files } from "./ports/files.ts";',
  "export type Reader = Files;",
].join("\n");

const PLANTED_BIB = [
  'import { parse } from "@retorquere/bibtex-parser";',
  "export { parse };",
].join("\n");

const FENCED = [
  "src/study-modes.ts",
  "src/study-gate.ts",
  "src/study-index-input.ts",
  "src/outputs-before-decision-rule.ts",
];

test(
  "an import of the Files port in a module that reads a study's folder is an error; in the readers of the registry and the README it is not",
  { timeout: 30_000 },
  async () => {
    assert.deepEqual(
      [
        ...(await Promise.all(FENCED.map((p) => fenced(p, PLANTED)))),
        await fenced("src/study-folder.ts", PLANTED),
        await fenced("src/study-registry-rule.ts", PLANTED),
        await fenced("src/studies.ts", PLANTED),
      ],
      [1, 1, 1, 1, 0, 0, 0],
    );
  },
);

test(
  "the same files are still fenced from the bibtex parser: the later block repeats that entry",
  { timeout: 30_000 },
  async () => {
    assert.deepEqual(
      await Promise.all(FENCED.map((p) => fenced(p, PLANTED_BIB))),
      [1, 1, 1, 1],
    );
  },
);
