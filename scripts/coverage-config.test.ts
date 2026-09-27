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
 *
 * Two more gates close the ways around a 100% threshold (owner's rule for #52):
 *   - no measured source carries a coverage-ignore comment (`c8`/`v8`/`istanbul`/`node:coverage
 *     ignore`) — an effect a test cannot reach is made injectable instead;
 *   - the exclude list is PINNED: a new pattern fails here until this file names it, with its
 *     reason, on purpose.
 */
import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { dirname, join, matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { test } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG = JSON.parse(readFileSync(join(ROOT, ".c8rc.json"), "utf8")) as {
  include: string[];
  exclude: string[];
  extension: string[];
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

/** The files c8 measures: `include` globs, the configured extensions, minus every `exclude`. */
function measuredFiles(): string[] {
  return [...new Set(CONFIG.include.flatMap((p) => globSync(p, { cwd: ROOT })))]
    .filter((f) => CONFIG.extension.some((x) => f.endsWith(x)))
    .filter((f) => !CONFIG.exclude.some((x) => matchesGlob(f, x)))
    .sort();
}

/**
 * The text of every comment in a JS/TS source, read off the parsed tree — not by grep, which
 * cannot tell a comment from a string or a regex. Every comment is trivia around a token — leading
 * the token after it, or trailing the one before it on the same line — so the comment ranges
 * around every token (end-of-file included) are all of them.
 */
export function comments(fileName: string, source: string): string[] {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );
  const found = new Map<number, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isJSDoc(node)) return; // its text is the comment already collected before its node
    const kids = node.getChildren(sf);
    if (kids.length > 0) return kids.forEach(visit);
    for (const r of [
      ...(ts.getLeadingCommentRanges(source, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(source, node.end) ?? []),
    ])
      found.set(r.pos, source.slice(r.pos, r.end));
  };
  visit(sf);
  return [...found.entries()].sort(([a], [b]) => a - b).map(([, text]) => text);
}

const IGNORE = /\b(?:c8|v8|istanbul|node:coverage)\s+ignore\b/;

test("comments() finds comments and only comments — before a closing brace, in a template, at the end", () => {
  assert.deepEqual(
    comments(
      "a.ts",
      [
        'const s = "/* c8 ignore next */";',
        "const r = /x\\/y/; // v8 ignore",
        "const t = `${1 /* in a template */}`;",
        "try {",
        "  f();",
        "  /* c8 ignore start */",
        "} catch {}",
        "/* at the end */",
      ].join("\n"),
    ),
    [
      "// v8 ignore",
      "/* in a template */",
      "/* c8 ignore start */",
      "/* at the end */",
    ],
  );
});

test("no measured source carries a coverage-ignore comment", () => {
  const files = measuredFiles();
  const offenders = files.filter((f) =>
    comments(f, readFileSync(join(ROOT, f), "utf8")).some((c) =>
      IGNORE.test(c),
    ),
  );
  assert.ok(files.length > 100, `only ${String(files.length)} files measured`);
  assert.deepEqual(offenders, []);
});

test("dist/ is excluded BEFORE source maps: a direct load is not a second copy of src/", () => {
  // With `true`, a dist/ file remapped through its source map lands under src/ and escapes the
  // `dist/**` exclude — measured: the extract-pdf-facts shim, spawned without NODE_OPTIONS, added a
  // column-shifted duplicate of every function in the src/ modules it imported.
  assert.equal(CONFIG.excludeAfterRemap, false);
});

test("the exclude list is exactly the justified set", () => {
  assert.deepEqual(CONFIG.exclude, [
    // tests themselves
    "**/*.harness.mjs",
    "**/*.test.*",
    // PAID LLM evaluations, never run by `npm test`
    "**/*.eval.mjs",
    // skill sources vigiles compiles into SKILL.md
    "**/*.spec.ts",
    // type declarations
    "**/*.d.ts",
    "**/*.d.mts",
    // inputs the tests read
    "**/fixtures/**",
    // build output (the coverage run resolves it to src/ — test/coverage-src.mjs)
    "dist/**",
    // test support
    "test/**",
    // not sources: dependencies, the report itself
    "node_modules/**",
    "coverage/**",
    // typeOnly — checked above to hold no runtime code
    ...CONFIG.typeOnly,
    // evalOnly — checked above to be imported only by evals
    ...CONFIG.evalOnly,
    // dated research records kept as evidence for the skills' prose
    "skills/**/repro/**",
    "skills/**/references/**",
  ]);
  assert.deepEqual(CONFIG.typeOnly, [
    "src/types.ts",
    "src/ports/*.ts",
    "src/domain/page-layout.ts",
    "src/domain/paths.ts",
  ]);
  assert.deepEqual(CONFIG.evalOnly, [
    "lib/skill-eval-kit.mjs",
    "lib/skill-eval-fixture.mjs",
    "lib/trigger-ledger.mjs",
  ]);
});
