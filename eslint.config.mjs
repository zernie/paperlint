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
import { texLanguage } from "./eslint-rules/latex-language.mjs";
import texBuild from "./eslint-rules/tex-build.mjs";
import markdown from "@eslint/markdown";
import localRules from "./eslint-rules/temp-root-realpath.mjs";
import portRules from "./eslint-rules/install-path-literals.mjs";
import n from "eslint-plugin-n";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The complexity set, shared by the TypeScript block and the ratchet below. Every function
// measured over these limits on 2026-09-24 was either refactored under them (the #59 build code)
// or pinned at its current maximum in RATCHET.
const MAX_LINES = { max: 60, skipComments: true, skipBlankLines: true };

// 🔴 A CEILING, NOT A PERMISSION: each number is the file's measured maximum on 2026-09-24, so a
// function in these files can get simpler and cannot get worse. Lower a number when a refactor
// lowers the maximum; never raise one. Paying the debt down is issue #72. A file leaves this table
// when it passes the shared limits.
const RATCHET = {
  "src/init.ts": { complexity: 59, "max-lines-per-function": 219 },
  "src/cli.ts": { complexity: 43, "max-lines-per-function": 152 },
  "src/doctor.ts": { complexity: 38, "max-lines-per-function": 125 },
  "src/hooks-settings.ts": { complexity: 12, "max-depth": 4 },
  "src/structure.ts": { complexity: 12, "max-depth": 4 },
  "src/new-paper.ts": { complexity: 11 },
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
    ],
    "boundaries/files": [
      // `exclusive`: the root also matches the app pattern below, and is only the root.
      { category: "root", pattern: "src/cli.ts", exclusive: true },
      // Every other file at the top of src/ is app. A new one gets the full app rules.
      { category: "app", pattern: "src/*.ts" },
      { category: "test", pattern: "src/**/*.test.ts" },
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
 * `scripts/layer-legacy-frozen.mjs` freezes how many each file may carry. A NEW module that needs
 * the outside world is a new `*.io.ts` in the adapter of the program it talks to — not a disable.
 */
export const IO_GLOBALS = {
  files: ["src/**/*.ts"],
  ignores: ["src/cli.ts", "src/adapters/*/*.io.ts", "src/**/*.test.ts"],
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
  // three hand-written `.d.mts` type the `.mjs` modules `src/` imports. All tracked TypeScript.
  //
  // Measured on the first run (41727cd): 44 findings in 9 of 39 files, all in `src/`, plus one
  // `no-useless-escape` in a spec that had dropped a backslash from its compiled SKILL.md. The
  // #59 build files were refactored clean; the older CLI files sit in RATCHET, one block below.
  //
  // NOT TYPE-AWARE, deliberately: no rule here needs type information, and `npm run build`
  // (tsc, strict) already type-checks `src/` as the first gate of `npm run check`.
  //
  // NOT HERE: `port/js-install-path` (43 findings, 41 of them the specs' `.claude/skills/`
  // literals — issue #19's debt, `warn` for `.mjs` for the same reason; 2 in hooks-settings.ts,
  // which writes the consumer's settings and must name the install) and `n/no-missing-import`
  // (tsc already fails on an unresolved import in `src/`).
  {
    files: ["**/*.ts", "**/*.mts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin, local: localRules },
    rules: {
      // The same macOS-only defect as in the `.mjs` block; clean here, so it opens at `error`.
      "local/temp-root-realpath": "error",
      // A dead import is a sign of an incomplete edit. The TypeScript variant, because the core
      // rule does not understand type-only positions.
      "@typescript-eslint/no-unused-vars": "error",
      // `any` switches the checker off for everything it flows into — the gate that makes `src/`
      // TypeScript at all. Five older sites are pinned inline and named in #49.
      "@typescript-eslint/no-explicit-any": "error",
      // The behaviour rules of the `.mjs` block, for the same reasons: each changes what the code
      // DOES, not how it looks, and a regex that escapes the wrong thing searches for the wrong thing.
      "no-empty": "error",
      "no-constant-condition": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-fallthrough": "error",
      "no-useless-escape": "error",
      "no-control-regex": "error",
      "no-misleading-character-class": "error",
      "no-prototype-builtins": "error",
      // Branches per function. Ten is the rule's long-standing default; the worst function
      // measured was 59, and one that size cannot be read, only re-run.
      complexity: ["error", 10],
      // `x as unknown as T` tells the checker to look away: two spellings of one port were once
      // reconciled that way (#76). A real conversion is a function; a real subset needs no cast.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSAsExpression > TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
          message:
            "`as unknown as` switches the type checker off. Convert with a function, or fix the type.",
        },
      ],
      // Nesting beyond three blocks is where a step belongs in its own named function.
      "max-depth": ["error", 3],
      // Five positional parameters are a record without field names; pass an object instead.
      "max-params": ["error", 4],
      // A function longer than a screen is read in pieces, and its pieces then want names.
      "max-lines-per-function": ["error", MAX_LINES],
      // Three levels of callbacks is the ceiling before a promise chain or a named step is due.
      "max-nested-callbacks": ["error", 3],
    },
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
   * Meaning: 133 own `.mjs` — mutation engine, three hooks, scripts for 24 skills — went unchecked,
   * with green `npm run lint`. A tool that checks others' papers and not itself.
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
      "no-dupe-keys": "error",
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
];
