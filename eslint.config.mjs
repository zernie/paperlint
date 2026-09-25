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
import reviewRules from "./eslint-rules/review-findings-cause.mjs";
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
// src/core/      pure: decisions, parsing, plans. No disk, no processes, no network, no env.
// src/adapters/  the only place that touches the outside world, behind a port the core declares.
// src/cli.ts     the composition root: reads the environment, builds adapters, calls the core.
export const CORE = "src/core/**/*.ts";
export const ADAPTERS = "src/adapters/**/*.ts";
export const COMPOSITION_ROOT = ["src/cli.ts"];

/** Modules that ARE effects. Importing one outside an adapter is the defect this gate names. */
export const IO_MODULES = [
  "fs",
  "fs/promises",
  "child_process",
  "os",
  "net",
  "http",
  "https",
  "worker_threads",
].flatMap((m) => [m, `node:${m}`]);

// Files that did I/O inline before the layers existed carry an `eslint-disable-next-line` naming
// #76 above each import or use; `reportUnusedDisableDirectives: "error"` (below) turns a disable
// that suppresses nothing into a finding, so an exemption leaves the moment its I/O does. A NEW
// exemption is a new, visible disable comment with its reason — a new module that needs the
// outside world is an adapter instead.

/** Where an effect may be written: adapters and the composition root. */
const IO_ALLOWED = [ADAPTERS, ...COMPOSITION_ROOT];

export const IO_BAN = {
  files: ["src/**/*.ts"],
  ignores: IO_ALLOWED,
  linterOptions: { reportUnusedDisableDirectives: "error" },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: IO_MODULES.map((name) => ({
          name,
          message:
            "I/O outside an adapter. Declare a port in src/core/ and implement it in src/adapters/ (src/CLAUDE.md).",
        })),
      },
    ],
    "no-restricted-globals": [
      "error",
      {
        name: "process",
        message:
          "The environment is an input: the composition root reads it and passes values in.",
      },
      {
        name: "fetch",
        message:
          "Network access is an adapter (src/adapters/), not core or command logic.",
      },
    ],
  },
};

/**
 * core imports neither adapters nor the app layer; adapters implement ports and never import the app.
 *
 * 🔴 `boundaries/root-path` IS LOAD-BEARING. Without it the plugin matches its patterns against
 * `process.cwd()` — not ESLint's `cwd` — so lint started from any other directory classifies no file
 * and the rule passes silently. Measured 2026-09-25: a core → adapter import produced zero findings
 * until the root was pinned. `root` is a parameter only so the test can lint a throwaway tree.
 */
export const layerBoundaries = (root) => ({
  files: ["src/**/*.ts"],
  plugins: { boundaries },
  settings: {
    "boundaries/root-path": root,
    "boundaries/elements": [
      { type: "core", mode: "full", pattern: CORE },
      { type: "adapter", mode: "full", pattern: ADAPTERS },
      { type: "app", mode: "full", pattern: "src/*.ts" },
    ],
  },
  rules: {
    "boundaries/dependencies": [
      "error",
      {
        default: "allow",
        rules: [
          {
            from: { type: "core" },
            disallow: { to: { type: ["adapter", "app"] } },
            message:
              "Hexagonal boundary: core (${file.type}) must not import ${dependency.type}. Depend on a port declared in src/core/; the composition root wires the adapter in.",
          },
          {
            from: { type: "adapter" },
            disallow: { to: { type: "app" } },
            message:
              "Hexagonal boundary: an adapter implements a core port and must not import the app layer (${dependency.type}).",
          },
        ],
      },
    ],
  },
});

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
  // Hexagonal layers: I/O only in adapters and the composition root; core imports neither.
  IO_BAN,
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
   * The package's first markdown rule — unit 1 of step 9 (moved from the consumer).
   * The block targets OWN fixtures: in the consumer the same plugin is applied to its
   * review report directory. `warn` for the same reason as .tex below: fixtures
   * are DELIBERATELY defective, and `error` would mean `npx eslint .` reds on a healthy
   * checkout. The signal lives in `npm test`, not in the warning count.
   */
  {
    files: ["fixtures/review-findings-cause/**/*.md"],
    plugins: { markdown, review: reviewRules },
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
    rules: { "review/findings-cause": "warn" },
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
