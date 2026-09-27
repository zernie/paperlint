/**
 * The exclusions in `.c8rc.json` are CLAIMS about the excluded files, and each claim is checked
 * here — otherwise an exclusion is the quiet way to make coverage go up.
 *
 *   - `typeOnly`: files with no runtime code. c8's `all` counts every line of a file no test
 *     loaded, and a types-only module compiles to nothing, so it can never be "covered". The
 *     claim is checked on the syntax tree: a file listed here that grows a function or a constant
 *     fails this test and must leave the list.
 *   - `evalOnly`: support for the PAID `*.eval.mjs` evaluations, which `npm test` never runs. The
 *     claim is that nothing but an eval (or another eval-only module) imports them.
 */
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { test } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(readFileSync(join(ROOT, ".c8rc.json"), "utf8")) as {
  exclude: string[];
  typeOnly: string[];
  evalOnly: string[];
};

const expand = (patterns: readonly string[]): string[] =>
  patterns.flatMap((p) => globSync(p, { cwd: ROOT })).sort();

/** Statements that emit JavaScript — anything but interfaces, type aliases and type-only imports/exports. */
export function runtimeStatements(fileName: string, source: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest);
  return sf.statements
    .filter(
      (s) =>
        !ts.isInterfaceDeclaration(s) &&
        !ts.isTypeAliasDeclaration(s) &&
        !(ts.isImportDeclaration(s) && s.importClause?.isTypeOnly) &&
        !(ts.isExportDeclaration(s) && s.isTypeOnly),
    )
    .map((s) => ts.SyntaxKind[s.kind]);
}

/** Every relative module specifier a source imports, statically or with `import("…")`. */
export function importedPaths(fileName: string, source: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const spec = ts.isImportDeclaration(node)
      ? node.moduleSpecifier
      : ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? node.arguments[0]
        : undefined;
    if (spec && ts.isStringLiteral(spec) && spec.text.startsWith("."))
      found.push(resolve(dirname(fileName), spec.text));
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

test("the named exclusion lists are part of c8's exclude, and match files", () => {
  for (const list of [CONFIG.typeOnly, CONFIG.evalOnly]) {
    assert.deepEqual(
      list.filter((p) => !CONFIG.exclude.includes(p)),
      [],
    );
    assert.ok(expand(list).length >= list.length);
  }
});

test("runtimeStatements tells a types-only module from one with code", () => {
  assert.deepEqual(
    [
      runtimeStatements(
        "a.ts",
        'import type { X } from "./x";\nexport type Y = X;\ninterface Z {}\n',
      ),
      runtimeStatements("b.ts", "export type Y = 1;\nexport const y = 1;\n"),
    ],
    [[], ["FirstStatement"]],
  );
});

test("every typeOnly exclusion has no runtime code", () => {
  const offenders = expand(CONFIG.typeOnly)
    .map(
      (f) =>
        [f, runtimeStatements(f, readFileSync(join(ROOT, f), "utf8"))] as const,
    )
    .filter(([, rt]) => rt.length > 0);
  assert.deepEqual(offenders, []);
});

test("every evalOnly exclusion is imported only by an eval or another evalOnly module", () => {
  const evalOnly = new Set(expand(CONFIG.evalOnly).map((f) => join(ROOT, f)));
  const sources = globSync("**/*.{mjs,ts}", {
    cwd: ROOT,
    exclude: (p) => p === "node_modules" || p === "dist" || p === "coverage",
  });
  const importers = sources.flatMap((f) => {
    const abs = join(ROOT, f);
    return importedPaths(abs, readFileSync(abs, "utf8"))
      .filter((target) => evalOnly.has(target))
      .map(() => f);
  });
  const outsiders = importers.filter(
    (f) => !f.endsWith(".eval.mjs") && !evalOnly.has(join(ROOT, f)),
  );
  assert.deepEqual(
    { outsiders, anyImporter: importers.length > 0 },
    {
      outsiders: [],
      anyImporter: true,
    },
  );
});
