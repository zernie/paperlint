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
 * The floor itself is pinned: lines, statements, functions and branches are all 100, `npm run
 * coverage` checks them, and CI runs that script — lowering any of the three links fails here.
 *
 * Two more gates close the ways around a 100% threshold (owner's rule for #52):
 *   - no measured source carries a coverage-ignore comment (`c8`/`v8`/`istanbul`/`node:coverage
 *     ignore`) — an effect a test cannot reach is made injectable instead;
 *   - the exclude list is PINNED: a new pattern fails here until this file names it, with its
 *     reason, on purpose.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { globSync, readFileSync } from "node:fs";
import { dirname, join, matchesGlob, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import ts from "typescript";
import { test } from "vitest";
import { z } from "zod";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFIG = z
  .object({
    lines: z.number(),
    statements: z.number(),
    functions: z.number(),
    branches: z.number(),
    excludeAfterRemap: z.boolean(),
    include: z.array(z.string()),
    exclude: z.array(z.string()),
    extension: z.array(z.string()),
    typeOnly: z.array(z.string()),
    evalOnly: z.array(z.string()),
  })
  .parse(JSON.parse(readFileSync(join(ROOT, ".c8rc.json"), "utf8")));

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
        !(
          ts.isImportDeclaration(s) &&
          s.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword
        ) &&
        !(ts.isExportDeclaration(s) && s.isTypeOnly),
    )
    .map((s) => ts.SyntaxKind[s.kind]);
}

/** Every relative module specifier a source imports, statically or with `import("…")`. */
/**
 * The package's subpath imports (`#lib/*`, `#eslint-rules/*`), each as its prefix and the source
 * file pattern its `paperlint-source` condition names — so an import written `#lib/x` is followed
 * to `lib/x.ts` like a relative one, instead of being skipped as a bare package name.
 */
const SUBPATHS = Object.entries(
  z
    .object({
      imports: z.record(
        z.string().endsWith("/*"),
        z.object({ "paperlint-source": z.string() }),
      ),
    })
    .parse(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")))
    .imports,
).map(([key, t]) => ({
  prefix: key.slice(0, -"*".length),
  target: t["paperlint-source"],
}));

/** Where a specifier points inside the repository: a relative path, or a subpath import's source. */
function resolvedSpecifier(fileName: string, spec: string): string[] {
  if (spec.startsWith(".")) return [resolve(dirname(fileName), spec)];
  return SUBPATHS.filter(({ prefix }) => spec.startsWith(prefix)).map(
    ({ prefix, target }) =>
      resolve(ROOT, target.replace("*", spec.slice(prefix.length))),
  );
}

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
    if (spec && ts.isStringLiteral(spec))
      found.push(...resolvedSpecifier(fileName, spec.text));
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

/** Every tracked file c8 could load as code — the extensions it is configured to measure. */
function trackedSources(): string[] {
  const r = spawnSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout
    .split("\0")
    .filter((f) => CONFIG.extension.some((x) => f.endsWith(x)))
    .sort();
}
const isIncluded = (f: string): boolean =>
  CONFIG.include.some((p) => matchesGlob(f, p));
const isExcluded = (f: string): boolean =>
  CONFIG.exclude.some((p) => matchesGlob(f, p));
const isMeasured = (f: string): boolean => isIncluded(f) && !isExcluded(f);

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
    if (kids.length > 0) {
      kids.forEach(visit);
      return;
    }
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
  // The scan covers exactly what c8 measures: the same set, derived from the tracked files.
  assert.deepEqual(files, trackedSources().filter(isMeasured));
  assert.ok(files.length > 0);
  const offenders = files.filter((f) =>
    comments(f, readFileSync(join(ROOT, f), "utf8")).some((c) =>
      IGNORE.test(c),
    ),
  );
  assert.deepEqual(offenders, []);
});

test("the floor is 100 on all four measures, and the script that checks it cannot loosen it", () => {
  assert.deepEqual(
    [CONFIG.lines, CONFIG.statements, CONFIG.functions, CONFIG.branches],
    [100, 100, 100, 100],
  );
  const pkg = z
    .object({ scripts: z.record(z.string(), z.string()) })
    .parse(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")));
  // Pinned whole: c8's command-line flags override .c8rc.json, so `--lines 50` or `--exclude "**"`
  // added here would bypass every threshold and the pinned exclude list below.
  assert.equal(
    pkg.scripts["coverage"],
    'NODE_OPTIONS="--import=./test/coverage-src.ts $NODE_OPTIONS" c8 --check-coverage npm test --',
  );
});

/** The gates job and the one step of it that runs coverage, read from the parsed workflow. */
const StepSchema = z.looseObject({
  run: z.string().optional(),
  if: z.unknown().optional(),
  "continue-on-error": z.unknown().optional(),
});
const JobSchema = z.looseObject({
  if: z.unknown().optional(),
  "continue-on-error": z.unknown().optional(),
  steps: z.array(StepSchema).optional(),
});
type Step = z.infer<typeof StepSchema>;
type Job = z.infer<typeof JobSchema>;
export function coverageSteps(
  workflow: string,
): { job: string; definition: Job; step: Step }[] {
  const ci = z
    .looseObject({ jobs: z.record(z.string(), JobSchema) })
    .parse(yaml.load(workflow));
  return Object.entries(ci.jobs).flatMap(([job, definition]) =>
    (definition.steps ?? [])
      .filter((step) => (step.run ?? "").trim().startsWith("npm run coverage"))
      .map((step) => ({ job, definition, step })),
  );
}

const DRAFT_GATE =
  "github.event_name != 'pull_request' || github.event.pull_request.draft == false";

/** Why CI's coverage step would not fail the run on a coverage drop — empty when it would. */
export function coverageStepHoles(workflow: string): string[] {
  const found = coverageSteps(workflow);
  const [only, ...more] = found;
  if (only === undefined || more.length > 0)
    return [
      `expected one step running \`npm run coverage\`, found ${String(found.length)}`,
    ];
  const { job, definition, step } = only;
  return [
    ...(job === "gates" ? [] : [`the step is in job ${job}, not gates`]),
    ...(definition.if === DRAFT_GATE
      ? []
      : [
          `job ${job} runs if ${JSON.stringify(definition.if)}, not only the draft gate`,
        ]),
    ...("continue-on-error" in definition
      ? [`job ${job} has continue-on-error`]
      : []),
    ...(step.if === undefined
      ? []
      : [`the step has if: ${JSON.stringify(step.if)}`]),
    ...("continue-on-error" in step ? ["the step has continue-on-error"] : []),
    ...(step.run?.trim() === "npm run coverage -- --no-skip"
      ? []
      : [
          `the step runs ${JSON.stringify(step.run)}, not \`npm run coverage -- --no-skip\``,
        ]),
  ];
}

test("CI runs the coverage step in the gates job, unconditionally past the draft gate, and fails on it", () => {
  const ci = readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  assert.deepEqual(coverageStepHoles(ci), []);
});

test("coverageStepHoles names every way to keep CI green over a coverage drop", () => {
  const wf = (step: string, jobIf = DRAFT_GATE, job = "gates") =>
    [
      "jobs:",
      `  ${job}:`,
      `    if: ${JSON.stringify(jobIf)}`,
      "    steps:",
      "      - name: coverage",
      `        run: npm run coverage -- --no-skip${step}`,
    ].join("\n");
  assert.deepEqual(
    [
      coverageStepHoles(wf("")),
      coverageStepHoles(wf("\n        continue-on-error: true")),
      coverageStepHoles(wf("\n        if: false")),
      coverageStepHoles(wf("", "false")),
      coverageStepHoles(wf("", DRAFT_GATE, "other")),
      coverageStepHoles("jobs:\n  gates:\n    steps: []\n"),
    ],
    [
      [],
      ["the step has continue-on-error"],
      ["the step has if: false"],
      ['job gates runs if "false", not only the draft gate'],
      ["the step is in job other, not gates"],
      ["expected one step running `npm run coverage`, found 0"],
    ],
  );
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
    "**/*.harness.*",
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
    // build output (the coverage run resolves it to src/ — test/coverage-src.ts)
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
    // dated research records kept as evidence for the skills' prose and the prior-art notes
    "skills/**/repro/**",
    "skills/**/references/**",
    "docs/prior-art/repro/**",
    // the test runner's own configuration, read by vitest, not code the package runs
    "vitest.config.ts",
  ]);
  assert.deepEqual(CONFIG.include, [
    "bin/**",
    "src/**/*.ts",
    "lib/**",
    "eslint-rules/**",
    "hooks/**",
    "skills/**",
    "scripts/**",
    "eslint.config.mjs",
  ]);
  assert.deepEqual(CONFIG.typeOnly, [
    "src/types.ts",
    "src/ports/*.ts",
    "src/domain/page-layout.ts",
    "eslint-rules/rule-context.ts",
  ]);
  assert.deepEqual(CONFIG.evalOnly, [
    "lib/skill-eval-kit.mjs",
    "lib/skill-eval-fixture.ts",
    "lib/trigger-ledger.mjs",
  ]);
});

test("every tracked source is either measured or excluded by a pattern named above", () => {
  // A new directory outside `include` would otherwise be invisible to c8 and to this file alike.
  assert.deepEqual(
    trackedSources().filter((f) => !isIncluded(f) && !isExcluded(f)),
    [],
  );
});
