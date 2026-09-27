/**
 * The module paths a consumer may import from the installed package — derived, never listed.
 *
 * Two sources, both read from what the consumer actually has:
 *
 * - the docs: every `paperlint/…` specifier imported in a JavaScript or TypeScript code block of a
 *   shipped `docs/*.md`. The docs are the promise; a documented import that fails is a broken
 *   promise, whatever the tests of the source tree say.
 * - the modules: `paperlint/lib/<name>.mjs` and `paperlint/eslint-rules/<name>.mjs` for every
 *   module of those two directories the package ships, compiled (`dist/…/<name>.js`) or not yet
 *   converted (`lib/<name>.mjs`). Before the TypeScript build these were the files themselves, and
 *   consumers import them by that name; moving a module to `dist/` must not move its public name.
 */
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import MarkdownIt from "markdown-it";
import ts from "typescript";

const PACKAGE = "paperlint";

/** Code-block languages whose imports are module specifiers. */
const CODE = new Set(["js", "mjs", "javascript", "ts", "mts", "typescript"]);

/** The string-literal specifiers imported (statically or dynamically) by one module's source. */
export function importSpecifiers(source: string): string[] {
  const file = ts.createSourceFile(
    "block.mts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The `paperlint/…` specifiers imported in the code blocks of one markdown document. */
export function documentedSpecifiers(markdown: string): string[] {
  return new MarkdownIt()
    .parse(markdown, {})
    .filter(
      (t) =>
        t.type === "fence" && CODE.has(t.info.trim().split(/\s+/)[0] ?? ""),
    )
    .flatMap((t) => importSpecifiers(t.content))
    .filter((s) => s.startsWith(`${PACKAGE}/`));
}

/** Module names in `dir` with `suffix`, tests and harnesses excluded; `[]` when `dir` is absent. */
function modules(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(suffix) && !f.endsWith(".d.ts"))
    .map((f) => f.slice(0, -suffix.length))
    .filter((n) => !/\.(test|harness)$/.test(n));
}

/** Every `paperlint/lib/<name>.mjs` and `paperlint/eslint-rules/<name>.mjs` the package ships. */
export function modulePaths(installed: string): string[] {
  return ["lib", "eslint-rules"].flatMap((dir) => {
    const names = new Set([
      ...modules(join(installed, "dist", dir), ".js"),
      ...modules(join(installed, dir), ".mjs"),
    ]);
    return [...names].sort().map((n) => `${PACKAGE}/${dir}/${n}.mjs`);
  });
}
