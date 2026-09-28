/**
 * ESLint configuration for this repository's OWN fixtures.
 *
 * It is not the configuration a consumer will use — a consumer points the same block at the
 * path of its own paper (`papers/<name>/paper.tex` or wherever the source actually lives).
 * What is reusable here is the SHAPE: one plugin object carrying both the language and the
 * rules that read LaTeX source, one `language:` line, and an explicit severity per rule.
 *
 * 🔴 The glob matters more than it looks. A rule whose glob matches nothing is not "clean" —
 * it is never invoked, and the run reports exactly the same green as a rule that passed. That
 * is why `scripts/rules-see-files.mjs` exists and why it runs as part of the test suite:
 * every rule declared below must be enabled for at least one file that is actually on disk.
 */
import { texLanguage } from "#eslint-rules/latex-language";
import texBuild from "#eslint-rules/tex-build";
import markdown from "@eslint/markdown";
import localRules from "#eslint-rules/temp-root-realpath";
import portRules from "#eslint-rules/install-path-literals";
import n from "eslint-plugin-n";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import functional from "eslint-plugin-functional";
import sonarjs from "eslint-plugin-sonarjs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The complexity set, shared by the TypeScript block and the ratchet below. Every function
// measured over these limits on 2026-09-24 was either refactored under them (the #59 build code)
// or pinned at its current maximum in RATCHET.
const TS_FILES = ["**/*.ts", "**/*.mts"];

/** Collection helpers come from Remeda; these would be a second library for the same job. */
const ONE_COLLECTION_LIBRARY = ["lodash", "lodash-es", "ramda"].map((name) => ({
  name,
  message: "use remeda (see CLAUDE.md)",
}));

/** An import of a skill's file, from code of the package itself (#133). */
const NO_SKILLS = [
  {
    regex: "(^|/)skills/",
    message:
      "The package's own code does not import from skills/: a skill is a consumer, not storage (#133). Move what you need into src/ or lib/.",
  },
];

/** `x as unknown as T` tells the checker to look away (#76). Shared: a block REPLACES a rule's options. */
const AS_UNKNOWN_AS = {
  selector:
    "TSAsExpression > TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
  message:
    "`as unknown as` switches the type checker off. Convert with a function, or fix the type.",
};

/**
 * A RULE MAY NOT ASK GIT. `paper/source` once bound a paper's stage to a commit sha and checked it
 * with `git cat-file -e`; of four recorded shas, one still resolved ninety minutes later, because
 * squash-merge and `gc` delete commits as routine. And `actions/checkout` fetches one commit, so
 * under CI even a live sha does not resolve: the rule is red where it must hold and green locally.
 * A rule reads the files ESLint gives it. Matched on the AST: a spawner called with the program
 * `git` (or a shell line starting with `git `). Two things pass, deliberately: opening `.git/` with
 * `fs`, and a program name assembled at runtime.
 */
const SPAWNERS = "exec|execSync|execFile|execFileSync|spawn|spawnSync|fork";
const GIT_IN_A_RULE = [
  `CallExpression[callee.name=/^(${SPAWNERS})$/][arguments.0.value=/^git( |$)/]`,
  `CallExpression[callee.property.name=/^(${SPAWNERS})$/][arguments.0.value=/^git( |$)/]`,
].map((selector) => ({
  selector,
  message:
    "A rule may not run git: a sha is deleted by routine maintenance and absent from a shallow CI checkout. Read the file content ESLint passes the rule.",
}));

/** Source code: a function is one job, and thirty lines is where a second job starts to hide. */
const MAX_LINES = { max: 30, skipComments: true, skipBlankLines: true };
/**
 * Tests keep sixty: a `describe`/`it` callback is a list of cases, not a function to split, and
 * cutting it by line count scatters one scenario across helpers nobody reads twice.
 */
const MAX_LINES_TESTS = { ...MAX_LINES, max: 60 };
const TEST_FILES = [
  "**/*.test.{ts,mts}",
  "**/*.harness.{ts,mts}",
  "**/*.e2e.{ts,mts}",
  "test/**/*.{ts,mts}",
];

// 🔴 A CEILING, NOT A PERMISSION: each number is the file's measured maximum on the day its limit
// arrived (complexity and depth on 2026-09-24, the files #78 moved to TypeScript on 2026-09-27,
// cognitive complexity and the 30-line source limit on 2026-09-28), so a function in these files
// can get simpler and cannot get worse. Lower a number when a refactor lowers the maximum; never
// raise one. Paying the debt down is issue #137. A file leaves this table when it passes the
// shared limits.
const RATCHET = {
  "eslint-rules/latex-language.ts": {
    complexity: 68,
    "sonarjs/cognitive-complexity": 98,
    "max-lines-per-function": 314,
    "max-depth": 4,
  },
  "eslint-rules/paper-stages.ts": {
    complexity: 15,
    "sonarjs/cognitive-complexity": 21,
    "max-lines-per-function": 105,
  },
  "eslint-rules/paper-typography.ts": {
    complexity: 29,
    "sonarjs/cognitive-complexity": 41,
    "max-lines-per-function": 50,
    "max-depth": 5,
  },
  "eslint-rules/pdf-last-page-balance.ts": { "max-lines-per-function": 31 },
  "eslint-rules/review-frontmatter.ts": { "max-lines-per-function": 46 },
  "eslint-rules/temp-root-realpath.ts": { complexity: 13 },
  "eslint-rules/tex-build.ts": { "max-lines-per-function": 34 },
  "lib/agent-cli-version.ts": { "max-lines-per-function": 42 },
  "lib/markdown.ts": { complexity: 12 },
  "scripts/check.ts": {
    "sonarjs/cognitive-complexity": 13,
    "max-lines-per-function": 39,
  },
  "skills/plan-paper-timeline/fixtures/fake-google-calendar.ts": {
    "max-lines-per-function": 31,
  },
  "src/adapters/curl/download.io.ts": { "max-lines-per-function": 39 },
  "src/adapters/references/index.ts": { "max-lines-per-function": 36 },
  "src/build-engine.ts": { "max-lines-per-function": 33 },
  "src/build.ts": {
    "sonarjs/cognitive-complexity": 13,
    "max-lines-per-function": 41,
  },
  "src/cli.ts": {
    complexity: 43,
    "sonarjs/cognitive-complexity": 30,
    "max-lines-per-function": 152,
  },
  "src/doctor.ts": {
    complexity: 38,
    "sonarjs/cognitive-complexity": 20,
    "max-lines-per-function": 125,
  },
  "src/domain/lookup-cache.ts": { "max-lines-per-function": 31 },
  "src/hooks-settings.ts": {
    complexity: 12,
    "max-lines-per-function": 42,
    "max-depth": 4,
  },
  "src/init.ts": {
    complexity: 59,
    "sonarjs/cognitive-complexity": 44,
    "max-lines-per-function": 219,
  },
  "src/latex-log.ts": { "sonarjs/cognitive-complexity": 12 },
  "src/link-skills.ts": { "max-lines-per-function": 32 },
  "src/new-paper.ts": { complexity: 11, "max-lines-per-function": 38 },
  "src/pdf-facts.ts": { "max-lines-per-function": 33 },
  "src/presets.ts": { "max-lines-per-function": 50 },
  "src/reference-rules.ts": { "max-lines-per-function": 36 },
  "src/references.ts": { "max-lines-per-function": 43 },
  "src/structure.ts": {
    complexity: 12,
    "sonarjs/cognitive-complexity": 24,
    "max-lines-per-function": 39,
    "max-depth": 4,
  },
  "src/toolchain.ts": { "max-lines-per-function": 50 },
};

// ── Hexagonal layers (src/CLAUDE.md, issue #76) ─────────────────────────────────────────
// TWO INDEPENDENT AXES, and a file has a position on each.
//
// A. KNOWLEDGE — whose vocabulary does the file speak, the paper's or one external program's?
//    domain  src/domain/        values and decisions in the paper's vocabulary
//    port    src/ports/         interfaces shaped by what the inside needs, never by what a tool does
//    app     src/*.ts           use cases over ports (the flat files; most are ratcheted, #76)
//    adapter src/adapters/<x>/  everything that exists because program/format <x> exists — pure
//                               parsers included. One element per folder, used through index.ts.
//    root    src/cli.ts         reads process.*, builds adapters, wires ports
// B. PURITY — can anything here fail for a reason not in its arguments? Effects (disk, process,
//    network, env) only in src/adapters/<x>/<y>.io.ts and the root.
//
// "Core" is deliberately not a layer name: the plugin's own `origin: "core"` means NODE BUILT-INS.
//
// Folders are ELEMENTS, single files are CATEGORIES (`boundaries/files`): that is v7's model — an
// element pattern is matched as a folder, and a file-shaped one is refused with a warning. So the
// root and the flat app files are categories, and the policies below select them with `file:`.

/** Modules that ARE effects. A file importing one must be an `io` file or the root. */
export const IO_MODULES = [
  "fs",
  "fs/promises",
  "child_process",
  "os",
  "net",
  "http",
  "https",
  "worker_threads",
  "readline",
  "readline/promises",
].flatMap((m) => [m, `node:${m}`]);

/** What the inside may import from outside the repository: types, pure path arithmetic, hashing. */
export const INSIDE_EXTERNALS = [
  "ts-essentials",
  "path",
  "node:path",
  "crypto",
  "node:crypto",
];
/** What the flat app files may import besides: Node's pure helpers, measured on the first v7 run. */
export const APP_EXTERNALS = [
  ...INSIDE_EXTERNALS,
  "util",
  "node:util",
  "url",
  "node:url",
  "module",
  "node:module",
];

const ORIGINS = ["external", "core"];
const modules = (source) => ({ to: { module: { origin: ORIGINS, source } } });
const elements = (...types) => ({ element: { types: { anyOf: types } } });
const APP = { file: { categories: "app" } };
const ROOT = { file: { categories: "root" } };

/**
 * Both axes in one plugin: axis A by element and category, axis B by the file category `io`.
 *
 * 🔴 `boundaries/root-path` IS LOAD-BEARING. Without it the plugin matches its patterns against
 * `process.cwd()` — not ESLint's `cwd` — so lint started from any other directory classifies no file
 * and the rule passes silently. Measured 2026-09-25: a core → adapter import produced zero findings
 * until the root was pinned. `root` is a parameter only so `test/eslint-layers.test.ts` can re-root
 * it at its fixture tree.
 *
 * 🔴 `checkAllOrigins: true` IS LOAD-BEARING TOO. The default checks local imports only, so every
 * `module:` policy below — all of axis B and the inside's library ban — would match nothing and
 * report nothing. The fixture `src/adapters/one/disk.ts` is what makes that loud.
 *
 * Policies are evaluated in order and the LAST one that matches decides, so the narrowing ones
 * (encapsulation, then axis B) come after the allows they narrow. A dependency no policy allows gets
 * the plugin's own message, which names both ends ("no policy allowing dependencies from file of
 * category "app" to elements of type "adapter""); custom messages sit only on the disallows.
 */
export const layerBoundaries = (root) => ({
  files: ["src/**/*.ts"],
  plugins: { boundaries },
  settings: {
    "boundaries/root-path": root,
    // `#lib/*` and `#eslint-rules/*` are package.json subpath imports; the Node resolver the plugin
    // defaults to does not read that map and leaves them unresolved, i.e. unknown. The TypeScript
    // resolver reads it, and with the repository's source condition lands on the `.ts` file, which
    // is classified as the js-module element it is.
    "import/resolver": {
      typescript: {
        conditionNames: ["paperlint-source", "types", "import", "node"],
      },
    },
    "boundaries/elements": [
      { type: "port", pattern: "src/ports", partialMatch: false },
      { type: "domain", pattern: "src/domain", partialMatch: false },
      // One element PER ADAPTER FOLDER, so adapter → other adapter is a cross-element import.
      {
        type: "adapter",
        pattern: "src/adapters/*",
        partialMatch: false,
        capture: ["name"],
      },
      // The package's plain-JS modules. Named so an import of one is classified, not unknown.
      {
        type: "js-module",
        pattern: "(eslint-rules|hooks|lib|skills)",
        partialMatch: false,
        capture: ["kind"],
      },
      // test/support.ts — shared helpers for tests. Only the `test` category may import it: the
      // policies below allow tests any element, and allow no other file this one.
      { type: "test-support", pattern: "test", partialMatch: false },
    ],
    "boundaries/files": [
      // `exclusive`: the root also matches the app pattern below, and is only the root.
      { category: "root", pattern: "src/cli.ts", exclusive: true },
      // Every other file at the top of src/ is app. A new one gets the full app rules.
      { category: "app", pattern: "src/*.ts" },
      // A harness is a test too: it drives the code through vigiles instead of vitest.
      { category: "test", pattern: "src/**/*.{test,harness}.ts" },
      // AXIS B: purity is a category, orthogonal to the element.
      { category: "io", pattern: "src/adapters/*/*.io.ts" },
    ],
  },
  rules: {
    // 🔴 An unclassified file is invisible to the rules below: a new `src/lib/x.ts` could import an
    // adapter from anywhere and nothing would fire. So every linted file must be a declared element
    // or category, and every import must resolve to one.
    "boundaries/no-unknown-files": "error",
    "boundaries/no-unknown-dependencies": "error",
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        checkAllOrigins: true,
        policies: [
          // ── AXIS A: who may know whom (jMolecules: Application → Port, never → Adapter) ──
          { from: elements("domain"), allow: { to: elements("domain") } },
          { from: elements("port"), allow: { to: elements("domain", "port") } },
          { from: APP, allow: { to: [elements("domain", "port"), APP] } },
          // An adapter knows the domain and the ports (jMolecules#306's allowance), never the app,
          // never another adapter.
          {
            from: elements("adapter"),
            allow: { to: elements("domain", "port") },
          },
          {
            from: ROOT,
            allow: { to: [{ element: { type: "*" } }, APP] },
          },
          // The package's `.mjs` half is read by the outside layers and the flat app files, never
          // by the domain or a port.
          {
            from: [elements("adapter"), APP, ROOT],
            allow: { to: elements("js-module") },
          },
          // ── libraries and built-ins (the plugin calls Node built-ins origin "core") ──
          {
            from: elements("domain", "port"),
            allow: modules(INSIDE_EXTERNALS),
          },
          { from: APP, allow: modules(APP_EXTERNALS) },
          {
            from: [elements("adapter"), ROOT],
            allow: { to: { module: { origin: ORIGINS } } },
          },
          // Tests may import anything, fakes included …
          {
            from: { file: { categories: "test" } },
            allow: {
              to: [
                { element: { type: "*" } },
                APP,
                ROOT,
                { module: { origin: ORIGINS } },
              ],
            },
          },
          // … but everyone, tests too, reaches an adapter through its index.ts. (Imports inside one
          // adapter are internal to its element and not checked.)
          {
            disallow: {
              to: {
                element: { type: "adapter", fileInternalPath: "!index.ts" },
              },
            },
            message:
              "{{ dependency.source }} is inside an adapter: import its index.ts (src/CLAUDE.md, layers).",
          },
          // ── AXIS B: effects only in io files, tests and the root ──
          // Written as "nobody, then these three" rather than "everyone but these three": a file
          // with no category has `categories: null`, and a `noneOf` query never matches null — so the
          // negative form silently exempts every plain file. Measured on `adapters/one/disk.ts`.
          {
            disallow: {
              to: { module: { origin: "core", source: IO_MODULES } },
            },
            message:
              "I/O ({{ dependency.source }}) in a file that is not *.io.ts. Effects live in src/adapters/<tool>/<x>.io.ts or src/cli.ts; this file takes a port (src/CLAUDE.md, purity). Legacy sites carry `-- legacy I/O, moves behind a port in #76`.",
          },
          {
            from: { file: { categories: ["io", "test", "root"] } },
            allow: { to: { module: { origin: "core", source: IO_MODULES } } },
          },
        ],
      },
    ],
  },
});

/**
 * The globals the plugin cannot see: `process` and `fetch` are not imports. Same scope as axis B.
 * Files that did I/O before the layers existed carry an `eslint-disable-next-line` naming #76 above
 * each such import or use; `reportUnusedDisableDirectives: "error"` turns a disable that suppresses
 * nothing into a finding, so an exemption leaves the moment its I/O does, and
 * `scripts/layer-legacy-frozen.ts` freezes how many each file may carry. A NEW module that needs
 * the outside world is a new `*.io.ts` in the adapter of the program it talks to — not a disable.
 */
export const IO_GLOBALS = {
  files: ["src/**/*.ts"],
  ignores: [
    "src/cli.ts",
    "src/adapters/*/*.io.ts",
    "src/**/*.test.ts",
    "src/**/*.harness.ts",
  ],
  linterOptions: { reportUnusedDisableDirectives: "error" },
  rules: {
    "no-restricted-globals": [
      "error",
      {
        name: "process",
        message:
          "The environment is an input: the root reads it and passes a value in (src/CLAUDE.md, purity).",
      },
      {
        name: "fetch",
        message: "Network access is an adapter's *.io.ts file.",
      },
    ],
  },
};

const ceiling = (rule, n) =>
  rule === "max-lines-per-function"
    ? ["error", { ...MAX_LINES, max: n }]
    : ["error", n];

/**
 * New code is TypeScript (#78). A JavaScript file (`.js`, `.mjs`, `.cjs`) under any of these
 * directories is an error, whatever its name — the check is on the file's AST root, so a name with
 * any number of dots and an empty file are both caught. The directories are the ones already moved
 * to TypeScript; each later step of #78 adds the directories it converts, and the last one replaces
 * the list with every JavaScript file in the repository.
 */
const TYPESCRIPT_ONLY = [
  "src/adapters/**/*.{js,mjs,cjs}",
  "src/domain/**/*.{js,mjs,cjs}",
  "src/ports/**/*.{js,mjs,cjs}",
  // test/ itself and test/e2e — not test/fixtures/layers/eslint-rules, whose `rule.mjs` stands for
  // the JavaScript module it is linted as.
  "test/*.{js,mjs,cjs}",
  "test/e2e/**/*.{js,mjs,cjs}",
  "test/fixtures/layers/src/**/*.{js,mjs,cjs}",
  "fixtures/real-markdown-paper/**/*.{js,mjs,cjs}",
  "skills/paper-pipeline/scripts/fixtures/**/*.{js,mjs,cjs}",
  "skills/plan-paper-timeline/fixtures/**/*.{js,mjs,cjs}",
];

export default [
  // 🔴 TRANSIENT DIRECTORIES ARE NOT THE CORPUS, and leaving them in is a RACE, not sloppiness.
  // `paper-stages.harness.mjs` creates a temp tree under fixtures and removes it when done,
  // while `latex-language.harness.mjs` lints the whole repository to prove its glob matches
  // real files. Run in parallel, ESLint enumerates a path and then reads it, and the file can
  // be gone in between: ENOENT, in a harness that has nothing to do with either.
  //
  // Measured 2026-09-17: the race had been latent and surfaced the moment a 54th harness
  // shifted the scheduling. Nothing about the new harness was wrong — which is the point.
  // `docs/prior-art/repro/` is EVIDENCE, not source: those scripts are kept exactly as they were
  // run, so that a verdict in the design notes can be re-measured rather than argued with. Linting
  // them invites the next reader to tidy an unused import — and then the file on disk is no longer
  // the file that produced the number it backs.
  // `dist/` is tsc's OUTPUT (gitignored): its declaration files are generated from `src/`, so
  // linting them would report every finding twice and blame a file nobody edits.
  {
    ignores: [
      ".tmp-stages-src-*/",
      "fixtures/.tmp-*/",
      "docs/prior-art/repro/",
      "dist/",
    ],
  },
  // 🔴 THE PACKAGE'S TYPESCRIPT, and before 2026-09-24 no block matched it — the same silent
  // ignore the `.mjs` block below was written against, recurring for `.ts` (#49). `src/` is the
  // CLI and the build; the skill specs compile into the SKILL.md files the package ships; the
  // hand-written `.d.mts` files type the `.mjs` modules `src/` imports. All tracked TypeScript.
  //
  // Measured on the first run (41727cd): 44 findings in 9 of 39 files, all in `src/`, plus one
  // `no-useless-escape` in a spec that had dropped a backslash from its compiled SKILL.md. The
  // #59 build files were refactored clean; the older CLI files sit in RATCHET, one block below.
  //
  // TYPE-AWARE since 2026-09-27: typescript-eslint's `strictTypeChecked` preset, fed by
  // `tsconfig.test.json`, which now includes EVERY tracked `.ts`/`.mts` (the 24 skill specs and
  // `vitest.config.ts` had been in no tsconfig, so neither tsc nor this block type-checked them).
  // `parserOptions.project` rather than `projectService`: the service looks for the nearest
  // `tsconfig.json`, and the root one covers only the shipped `src/`, so every test, script and
  // spec would fall back to a default project. First run: 374 findings in 64 files, all fixed in
  // the same PR, none suppressed.
  //
  // NOT HERE: `port/js-install-path` (43 findings, 41 of them the specs' `.claude/skills/`
  // literals — issue #19's debt, `warn` for `.mjs` for the same reason; 2 in hooks-settings.ts,
  // which writes the consumer's settings and must name the install) and `n/no-missing-import`
  // (tsc already fails on an unresolved import).
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: TS_FILES,
  })),
  {
    files: TS_FILES,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.test.json",
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      local: localRules,
      sonarjs,
    },
    rules: {
      // The same macOS-only defect as in the `.mjs` block; clean here, so it opens at `error`.
      "local/temp-root-realpath": "error",
      // `any` switches the checker off for everything it flows into. The preset has it too; named
      // here so that dropping the preset cannot drop it.
      "@typescript-eslint/no-explicit-any": "error",
      // A type assertion (`x as T`, `<T>x`) is a claim the checker takes on trust (#126). A value
      // from outside is parsed or guarded where it enters; a brand is minted by its own checked
      // constructor. `as const` asserts nothing about the value and stays allowed.
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      // The behaviour rules of the `.mjs` block, for the same reasons: each changes what the code
      // DOES, not how it looks, and a regex that escapes the wrong thing searches for the wrong thing.
      "no-empty": "error",
      "no-constant-condition": "error",
      // `no-unreachable` is switched off by the preset's `eslint-recommended` layer on the claim
      // that tsc reports it; tsc only greys unreachable code unless `allowUnreachableCode` is
      // false, so it is switched back on. (`no-dupe-keys` is dropped: tsc does fail on it.)
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "no-useless-escape": "error",
      "no-control-regex": "error",
      "no-misleading-character-class": "error",
      "no-prototype-builtins": "error",
      // Branches per function. Ten is the rule's long-standing default; the worst function
      // measured was 59, and one that size cannot be read, only re-run.
      complexity: ["error", 10],
      // `complexity` counts branches; cognitive complexity also charges NESTING, which is what makes
      // a function hard to read. Only this one rule of the plugin: its recommended set is a style
      // guide of its own, and each rule here is a decision.
      "sonarjs/cognitive-complexity": ["error", 10],
      // `x as unknown as T` tells the checker to look away: two spellings of one port were once
      // reconciled that way (#76). A real conversion is a function; a real subset needs no cast.
      "no-restricted-syntax": ["error", AS_UNKNOWN_AS],
      // Nesting beyond three blocks is where a step belongs in its own named function.
      "max-depth": ["error", 3],
      // Five positional parameters are a record without field names; pass an object instead.
      "max-params": ["error", 4],
      // A function longer than a screen is read in pieces, and its pieces then want names.
      "max-lines-per-function": ["error", MAX_LINES],
      // Three levels of callbacks is the ceiling before a promise chain or a named step is due.
      "max-nested-callbacks": ["error", 3],
      // A `switch` over a union names every member (or says `default:` on purpose): a state added
      // to the type is then a compile-time finding at every place that must handle it.
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  {
    files: TEST_FILES,
    rules: { "max-lines-per-function": ["error", MAX_LINES_TESTS] },
  },
  // Hexagonal layers, both axes (src/CLAUDE.md): knowledge by element, purity by file category.
  IO_GLOBALS,
  layerBoundaries(dirname(fileURLToPath(import.meta.url))),
  // The ratchet: per-file ceilings for the files written before the limits existed. See RATCHET.
  ...Object.entries(RATCHET).map(([file, max]) => ({
    files: [file],
    rules: Object.fromEntries(
      Object.entries(max).map(([rule, n]) => [rule, ceiling(rule, n)]),
    ),
  })),
  /**
   * 🔴 THIS BLOCK COVERS THE PACKAGE ITSELF, and before 2026-09-15 it was not here: the config held only
   * one block for `.tex` (I don't quote the glob inside this comment: the sequence
   * "star-slash" would close the comment itself — which is where I tripped), and a file with no block gets simply IGNORED by ESLint 9.
   * Meaning: 133 own `.mjs` — a since-removed mutation-testing engine, three hooks, scripts for
   * 24 skills — went unchecked, with green `npm run lint`. A tool that checks others' papers and
   * not itself.
   *
   * Measurement on the first run: 15 files with dead imports (`resolve`, `pathToFileURL`) and
   * orphaned constants — remnants of a move from `mine`, where those names were needed. All
   * cleaned to zero in the same commit, so the rule opens as a GATE on a clean corpus,
   * not as debt to be silenced.
   *
   * ⚠️ RULES ARE ENUMERATED, NOT TAKEN AS A SET, for two reasons. First: `@eslint/js` is not
   * a dependency, and pulling it for a preset costs more than it saves with six devDeps.
   * Second, more important: enumeration makes each inclusion a DECISION, just like in the .tex
   * block below, where each line has a reason.
   *
   * 🔴 WHAT IS DELIBERATELY NOT HERE: `require-atomic-updates`. It finds three issues in
   * `verify-cites.mjs` on a classic memoizer (read `cache[ck]` → `await` →
   * write). Read from the code: citation walk is sequential, and a race in the worst case
   * is a repeat network call with an equivalent result. So on THIS corpus
   * it is a false positive, and for an `error`-level rule a false positive is worse than a miss:
   * they turn it off the same day, and the rest stop being read with it.
   * In `eslint:recommended`, by the way, it is also not there.
   */
  {
    files: ["**/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module" },
    plugins: { local: localRules, port: portRules },
    rules: {
      // Rule 10's mechanical half, code side. `warn` and not `error`, unlike its neighbour
      // above: this one does NOT open on a clean corpus. Two shipped modules print a command
      // for a human that names an install-specific path, and neither is fixable by the
      // answer the skills get — a printed command has to be resolved through the port at
      // runtime. Nothing freezes that number: a ratchet would say "at least not worse" on the
      // same day the rule was written, which is how a removal turns into a decision to keep.
      // The severity only keeps `npx eslint .` from being red on a healthy clone, which is how
      // a rule gets switched off and its binary neighbours ignored with it.
      "port/js-install-path": "warn",
      // 🔴 `error`, AND THIS IS A DECISION, NOT A DEFAULT. The rule is opened by a GATE on a
      // clean corpus: all fifteen venues are allowed in the same commit, so there's no debt that
      // would have to be muted. Stricter than that: the defect it catches is REPRODUCED ONLY ON
      // macOS, and CI here is just one — `ubuntu-latest`. That is, on Linux this is the only
      // guard that could ever turn red, and `warn` would mean that no one would ever see it:
      // `eslint .` exits zero on warnings.
      "local/temp-root-realpath": "error",
      // A dead import is not style, it is a sign of an incomplete edit: it says a file once
      // did something else. Fifteen such surfaced from the move.
      "no-unused-vars": "error",
      // Below are rules that silently change BEHAVIOR, not appearance: empty `catch {}` block (swallowed
      // error — a documented failure mode of this repository), constant condition, duplicate key,
      // unreachable code, fallthrough in `case`.
      "no-empty": "error",
      "no-constant-condition": "error",
      // `no-unreachable` is switched off by the preset's `eslint-recommended` layer on the claim
      // that tsc reports it; tsc only greys unreachable code unless `allowUnreachableCode` is
      // false, so it is switched back on. (`no-dupe-keys` is dropped: tsc does fail on it.)
      "no-unreachable": "error",
      "no-fallthrough": "error",
      // Regexes: unnecessary escaping slash and control character in class — both findings about
      // a pattern searching for NOT what the author wrote. The subject of this repository is checks,
      // and a check searching for the wrong thing is green by construction.
      "no-useless-escape": "error",
      "no-control-regex": "error",
      "no-misleading-character-class": "error",
      "no-prototype-builtins": "error",
    },
  },
  /**
   * 🔴 AN IMPORT THAT RESOLVES TO NOTHING IS NOT A STYLE FINDING — it is a module that throws on
   * load. Nothing here noticed one for a week (#67): a fixture imported `lib/consumer.mjs`, a file
   * that has never existed in any commit, and no harness ever loads that fixture — the harness
   * only LINTS it, and the port rule reads string literals, not whether they resolve. The same
   * run found a second, older one: `lib/skill-eval-kit.mjs` dynamically imported
   * `vigiles/testing`, a subpath vigiles stopped exporting in v16, on a branch no caller had
   * taken yet.
   *
   * `n/no-missing-import` is the standard rule for this and covers relative AND package
   * specifiers, static and dynamic, against the real resolver. Its own block so the one
   * exception below does not leak into the other rules: the occupancy probe is EVIDENCE, kept
   * exactly as it was run in a scratch environment where `retext-*` was installed — the same
   * reason `docs/prior-art/repro/` is ignored globally above.
   */
  {
    files: ["**/*.mjs"],
    ignores: ["skills/paper-pipeline/references/occupancy-2026-08-06-probe/**"],
    plugins: { n },
    rules: { "n/no-missing-import": "error" },
  },
  /**
   * Rule 10's mechanical half, prose side — and this is where the debt actually is: 76
   * findings across 29 skills on a healthy checkout, every one of them a command that
   * resolves in one delivery channel and is absent in another.
   *
   * The severity is a statement about the CORPUS, exactly as in the .tex block below: the
   * finding itself is binary, but the corpus carries known debt that cannot be paid in the
   * commit that introduces the rule. That debt is an ISSUE with an owner, deliberately not a
   * frozen constant in a test — see the harness for why. `warn` keeps a clean clone from being
   * red until the paths are gone; when they are, this line becomes `error`.
   */
  {
    files: ["skills/**/*.md"],
    plugins: { markdown, port: portRules },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: { "port/md-install-path": "warn" },
  },
  {
    files: ["**/*.tex"],
    plugins: {
      // One plugin object carries BOTH the language and the rules: `tex/latex` is the
      // language, `tex/*` are the rules about the LaTeX source itself. ESLint permits this,
      // and a second plugin name would buy nothing.
      tex: { languages: { latex: texLanguage }, rules: texBuild },
    },
    language: "tex/latex",
    rules: {
      // `warn`, and that is an analysis rather than caution. The finding is NOT binary: a
      // promise in a shipped build is sometimes honest (something genuinely not released
      // yet), and the verdict "does this contradict the Availability paragraph" is a human
      // one — which is what the message says. There is also a demonstrable class of false
      // positives: "their replication will be published in 2027" is a sentence about SOMEONE
      // ELSE's work. An `error` that fails on a correct input gets switched off the same day,
      // and then the binary checks stop being read too.
      "tex/future-promise": "warn",
      // 🔴 `warn` HERE AND `error` IN A CONSUMER, on purpose. The finding itself is binary —
      // the macro is present or it is not — and it has a named exemption (`nonacm`), so in a
      // repository that lints a REAL paper it belongs at `error`: the cost of a miss is desk
      // rejection with no review, and that asymmetry is the whole argument. This
      // repository lints fixtures broken by construction, where the same severity
      // would only mean `npx eslint .` reds on a healthy checkout. Severity is
      // a statement about the CORPUS being linted, not the rule's certainty.
      "tex/acm-frontmatter-override": "warn",
    },
    // ⚠️ `npx eslint .` therefore reports six warnings on a healthy checkout: the four defect
    // fixtures are DEFECTIVE ON PURPOSE, and that is what makes the fire half of every harness
    // real. Do not silence them by adding an ignore — a rule that lints only clean inputs is
    // one whose firing path nothing exercises, which is rule 4 wearing a different hat. The
    // pass/fail signal lives in `npm test`, not in the warning count of `npm run lint`.
  },
  {
    files: ["**/*.{ts,mts,mjs,js,cjs}"],
    rules: {
      "no-restricted-imports": ["error", { paths: ONE_COLLECTION_LIBRARY }],
    },
  },
  // 🔴 THE LINTER DOES NOT READ A SKILL. Skills are consumers of the package, not its storage: the
  // venue presets once lived in a skill and were located through a skill's script, so renaming the
  // skill broke `paperlint lint` (#133). The package's own code — src/, eslint-rules/, lib/ — may
  // not import from skills/. Tests and harnesses may: they check the skills.
  {
    files: [
      "src/**/*.{ts,mts,mjs,js}",
      "eslint-rules/**/*.{ts,mts,mjs,js}",
      "lib/**/*.{ts,mts,mjs,js}",
    ],
    ignores: ["**/*.test.*", "**/*.harness.*"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: ONE_COLLECTION_LIBRARY, patterns: NO_SKILLS },
      ],
    },
  },
  // 🔴 NEW CODE IS FUNCTIONAL: no `let`, no mutation, no loops, readonly types. Old code is listed
  // in eslint-suppressions.json (ESLint's own bulk suppressions), which may only shrink: a fixed
  // site that is not pruned fails `npm run lint`, and #134 burns the list down. Tests may mutate
  // their fixtures.
  {
    files: ["src/**/*.ts", "eslint-rules/**/*.ts", "lib/**/*.ts"],
    ignores: ["**/*.test.*", "**/*.harness.*"],
    plugins: { functional },
    rules: {
      "functional/no-let": "error",
      "functional/immutable-data": "error",
      "functional/no-loop-statements": "error",
      "functional/prefer-immutable-types": [
        "error",
        { enforcement: "ReadonlyShallow", ignoreInferredTypes: true },
      ],
    },
  },
  // Rule sources, whatever their extension; tests and harnesses plant git calls on purpose.
  {
    files: ["eslint-rules/*.ts", "eslint-rules/*.mjs"],
    ignores: ["eslint-rules/*.test.*", "eslint-rules/*.harness.*"],
    rules: {
      "no-restricted-syntax": ["error", AS_UNKNOWN_AS, ...GIT_IN_A_RULE],
    },
  },
  // LAST, so no block above can replace its `no-restricted-syntax` options for these files (none
  // sets that rule for JavaScript today; being last keeps it that way).
  {
    files: TYPESCRIPT_ONLY,
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message: "New code is TypeScript (#78): write this file as .ts.",
        },
      ],
    },
  },
];
