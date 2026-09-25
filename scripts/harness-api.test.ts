/**
 * What makes a file a HARNESS. A `*.harness.*` file tests the agent surface, so it drives it through
 * vigiles: it imports `runHook`, `runHarnessTest` or `runEval` from `vigiles` (or a `vigiles/…`
 * entry point). Anything else is a plain unit test and is named `*.test.ts`, run by vitest.
 *
 * The rule is read from the file's IMPORTS, parsed with the TypeScript compiler — not from its
 * folder and not from a text search: a comment or a string that mentions `runHook` is not an import,
 * and `src/cli.harness.mjs` calls a function of rpp's own that happens to be called `runHook`.
 *
 * Harnesses that predate the rule and import none of the three are frozen in
 * `harness-api.frozen.json` (issue #77). That list only shrinks: an entry that now imports the API,
 * or that no longer exists, has to leave it.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FROZEN: readonly string[] = (
  JSON.parse(
    readFileSync(join(ROOT, "scripts", "harness-api.frozen.json"), "utf8"),
  ) as { harnesses: string[] }
).harnesses;

/** vigiles' agent-testing API — what a harness exists to call. */
export const AGENT_API = new Set(["runHook", "runHarnessTest", "runEval"]);

const isHarnessName = (path: string): boolean =>
  /\.harness\.[cm]?[jt]s$/.test(basename(path));

const fromVigiles = (spec: ts.Expression | undefined): boolean =>
  spec !== undefined &&
  ts.isStringLiteral(spec) &&
  (spec.text === "vigiles" || spec.text.startsWith("vigiles/"));

/** Names bound by `import { a, b as c } from "vigiles…"` — the EXPORTED names, a and b. */
function staticNames(node: ts.Node): string[] {
  if (!ts.isImportDeclaration(node) || !fromVigiles(node.moduleSpecifier))
    return [];
  const named = node.importClause?.namedBindings;
  if (!named || !ts.isNamedImports(named)) return [];
  return named.elements.map((e) => (e.propertyName ?? e.name).text);
}

/** Names destructured from `await import("vigiles…")`: `const { runHook } = await import(…)`. */
function dynamicNames(node: ts.Node): string[] {
  if (!ts.isVariableDeclaration(node) || !node.initializer) return [];
  if (!ts.isObjectBindingPattern(node.name)) return [];
  const init = ts.isAwaitExpression(node.initializer)
    ? node.initializer.expression
    : node.initializer;
  const isImport =
    ts.isCallExpression(init) &&
    init.expression.kind === ts.SyntaxKind.ImportKeyword &&
    fromVigiles(init.arguments[0]);
  if (!isImport) return [];
  return node.name.elements.map((e) => {
    const key = e.propertyName ?? e.name;
    return ts.isIdentifier(key) ? key.text : "";
  });
}

/** Does this source import at least one of vigiles' agent-testing functions? */
export function importsAgentApi(fileName: string, source: string): boolean {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      [...staticNames(node), ...dynamicNames(node)].some((n) =>
        AGENT_API.has(n),
      )
    )
      found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Harness-named files, among `paths`, that import none of the API and are not frozen. */
export function misnamed(
  files: ReadonlyMap<string, string>,
  frozen: readonly string[],
): string[] {
  return [...files]
    .filter(([p]) => isHarnessName(p) && !frozen.includes(p))
    .filter(([p, src]) => !importsAgentApi(p, src))
    .map(([p]) => p);
}

/** Frozen entries that must leave: gone from the tree, or now importing the API. */
export function mustLeave(
  files: ReadonlyMap<string, string>,
  frozen: readonly string[],
): string[] {
  return frozen.filter((f) => {
    const src = files.get(f);
    return src === undefined || importsAgentApi(f, src);
  });
}

/** Every harness-named file git knows about (tracked, or new and not ignored), with its source. */
function harnessesOnDisk(): Map<string, string> {
  const listed = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .filter(isHarnessName);
  return new Map(
    listed.map((p) => [p, readFileSync(join(ROOT, p), "utf8")] as const),
  );
}

test("every harness imports vigiles' agent-testing API, or is on the frozen list", () => {
  // Guards: the rule on the real tree — a new plain test named `*.harness.*` turns this red.
  assert.deepEqual(misnamed(harnessesOnDisk(), FROZEN), []);
});

test("the frozen list only shrinks", () => {
  // Guards: a renamed, deleted or converted harness must leave the list, or it stops meaning anything.
  assert.deepEqual(mustLeave(harnessesOnDisk(), FROZEN), []);
});

test("both halves, on planted files", () => {
  const plain = 'import assert from "node:assert";\nassert.ok(true);\n';
  const real = 'import { runHook } from "vigiles";\nrunHook("true", {});\n';
  const files = new Map([
    ["skills/x/x.harness.ts", plain],
    ["src/y.harness.mjs", real],
    [
      "hooks/h.harness.mjs",
      'const { runEval } = await import("vigiles/eval");\n',
    ],
    ["src/z.test.ts", plain],
  ]);
  // Guards: the fire half — a plain test named as a harness fails EVEN inside skills/.
  assert.deepEqual(misnamed(files, []), ["skills/x/x.harness.ts"]);
  // Guards: a file that is on the list but now imports the API has to leave it.
  assert.deepEqual(mustLeave(files, ["src/y.harness.mjs"]), [
    "src/y.harness.mjs",
  ]);
  // Guards: an entry whose file is gone has to leave it.
  assert.deepEqual(mustLeave(files, ["gone.harness.mjs"]), [
    "gone.harness.mjs",
  ]);
});

test("an import is what counts — not a mention, not a same-named local function", () => {
  // Guards: a comment and a string naming runHook do not make a harness.
  const mention =
    '// runHook\nconst s = "runHarnessTest";\nimport { x } from "vigiles";\n';
  assert.equal(importsAgentApi("a.harness.mjs", mention), false);
  // Guards: rpp's own `runHook` (src/cli.ts) is not vigiles'.
  assert.equal(
    importsAgentApi(
      "b.harness.mjs",
      'import { runHook } from "../src/cli.ts";\n',
    ),
    false,
  );
  // Guards: an aliased import still counts by the name vigiles exports.
  assert.equal(
    importsAgentApi(
      "c.harness.mjs",
      'import { runHook as hook } from "vigiles";\n',
    ),
    true,
  );
});
