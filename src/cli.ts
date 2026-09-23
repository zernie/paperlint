#!/usr/bin/env node
/**
 * `research-paper-pipeline lint [paths…]` — run every rule over the corpus of papers.
 *
 * 🔴 WHY THIS UTILITY EXISTS. Before it, "installation" meant: install the package AND WRITE BY
 * HAND sixty lines of ESLint flat config, listing ten rules, three languages and four `files`
 * blocks. That is, the tool dumped its own implementation onto the user: to count the bytes of a
 * pdf you first had to learn what `language: "tex/latex"` is. The rules still run under ESLint —
 * but that is INTERNAL machinery, and you no longer need to know it in order to run them.
 *
 * Two entry points into the tool, and both are whole now:
 *     npx research-paper-pipeline lint              ← here
 *     uses: zernie/research-paper-pipeline@<sha>    ← action.yml
 *
 * ⚠️ THE BOUNDARY THIS UTILITY HAS NO RIGHT TO ERASE: the consumer's data stays with the consumer.
 * The typography debt, the marker of the author-list check run, the field dictionary — all of that
 * is about ONE corpus, and wiring it into the package would repeat the defect that put the path
 * `.claude/skills/verify-citations/...` into a rule's message. So they live in the consumer's
 * `rpp.json`.
 *
 * 🔴 WHY THE COMMAND IS CALLED `lint` AND NOT `check`. It does exactly what everyone else calls by
 * that word: reads files, changes nothing, prints findings, exits non-zero. `check` is taken in the
 * ecosystem by another meaning — `cargo check`, `tsc --noEmit`, `npm run check` — it means "build,
 * but do not emit the artifact", that is, half of a BUILD. A package whose paper build comes first
 * has no right to occupy that word with a linter. `check` stays as an alias and prints what
 * replaced it: silently breaking someone else's workflow is worse than asking them to fix a line.
 */
import { ESLint, type Linter } from "eslint";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname, resolve, relative, basename, sep } from "node:path";
import markdown from "@eslint/markdown";
// @ts-expect-error — the helper lives in the .mjs half of the package (29 833 lines of rules and
// skill scripts), which this task does not rewrite. It has no types, and a harness pins its behaviour.
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";
export { isMain };
import type { Args, RppConfig, ConfigRead } from "./types.ts";
import {
  checkStructure,
  formatStructure,
  asEslintResults,
} from "./structure.ts";
import {
  BUILD_SCRIPTS,
  buildPaper,
  papersIn,
  formatResults,
  anyFailed,
  remedyFor,
} from "./build.ts";
import { doctor } from "./doctor.ts";
import { init } from "./init.ts";
// @ts-expect-error — the one source for the consumer's config key lives in the .mjs half of
// the package: the ESLint rules and the skill scripts import it too, and they are not TypeScript.
import { CONFIG_KEY } from "../lib/paper-config.mjs";
export { init };
export { nextSteps } from "./init.ts";

// @ts-expect-error — an ESLint rule in .mjs, it has no types
import paperStages from "../eslint-rules/paper-stages.mjs";
// @ts-expect-error — an ESLint rule in .mjs, it has no types
import researchQuestion from "../eslint-rules/paper-research-question.mjs";
// @ts-expect-error — an ESLint rule in .mjs, it has no types
import typography from "../eslint-rules/paper-typography.mjs";
// @ts-expect-error — an ESLint rule in .mjs, it has no types
import texBuild from "../eslint-rules/tex-build.mjs";
// @ts-expect-error — an ESLint rule in .mjs, it has no types
import docFields from "../eslint-rules/doc-fields.mjs";
// @ts-expect-error — an ESLint rule in .mjs, it has no types
import findingsCause from "../eslint-rules/review-findings-cause.mjs";

const USAGE = `research-paper-pipeline — machine-checkable gates for a paper kept in git

  npx rpp init [dir]                  set the project up: detect the papers directory, declare it
                                      in package.json, offer the CI step, report what is missing
  npx rpp lint [paths…]               run every rule over your papers
  npx rpp build <paper> | --all       build a paper with ITS OWN build script
                                      (--dry-run: name the script that WOULD run, and where none exists)
  npx rpp doctor                      say what is actually wired — and what only LOOKS wired
  npx rpp hook <name>                 run an editor hook (the plugin wiring calls this)
  npx rpp --help

lint:
  npx rpp lint [paths…] [--config <file.json>] [--json]

  <paths…>            where your papers live, e.g. papers. Optional ONLY because the declaration
                      names it — one of the two must name the scope. There is no default
                      of ".": linting whatever happens to be in the checkout is how a green
                      report over a scope nobody chose gets produced.
  --config <file>     read the settings from this file instead of the discovered one
  --json              machine-readable findings on stdout, nothing else on it
  --max-warnings <n>  fail when warnings exceed n. Default -1: warnings never fail, because
                      most findings here are advisory and a gate that fails on advice gets muted

settings — the \`research-paper-pipeline\` key of your package.json, found by walking up from the
current directory, the way every other tool in the stack finds its config. \`rpp.json\` is still
read as a deprecated fallback and the run says so. \`papers\` is required; the rest is optional:

  "research-paper-pipeline": {
    "papers":            "papers",
    "authorListCommand": "node scripts/bib-authors.mjs",
    "typographyDebt":    { "papers/my-paper": { "sectionSign": 12 } },
    "docFields":         { "read": { "values": ["full", "abstract", "none"] } },
    "reviewSince":       "2026-08-23",
    "minFindings":       3,
    "causeMarker":       "Cause:"
  }
`;

/** The config the user would otherwise write by hand. The data comes from `opts`, the mechanism is here. */
export function buildConfig(
  opts: RppConfig = {},
  texLanguage: unknown,
): unknown[] {
  const paperRules = { ...researchQuestion.rules, ...typography.rules };
  const typographyOpt = ["warn", { debt: opts.typographyDebt ?? {} }];
  const md = {
    language: "markdown/gfm",
    languageOptions: { frontmatter: "yaml" },
  };

  const cfg: any[] = [
    {
      files: ["**/PIPELINE-STATUS.md"],
      plugins: { markdown, paper: paperStages },
      ...md,
      rules: {
        "paper/stages": "error",
        "paper/source": "error",
        "paper/author-list": [
          "warn",
          opts.authorListCommand ? { command: opts.authorListCommand } : {},
        ],
      },
    },
    {
      files: ["**/paper.md", "**/draft.md"],
      plugins: { markdown, paper: { rules: paperRules } },
      ...md,
      rules: {
        "paper/research-question": "warn",
        "paper/typography": typographyOpt,
      },
    },
    {
      files: ["**/reviews/*.md"],
      plugins: {
        markdown,
        review: { rules: { ...findingsCause.rules } },
        doc: docFields,
      },
      ...md,
      rules: {
        /*
         * 🔴 THE DEFAULT IS ENGLISH SINCE 2026-09-17. It used to be the Russian word for "Cause:" —
         * a Russian word in a package whose interface is English. An `error`-level rule demanded
         * that a person put Cyrillic into their own file, and there was nothing to change the
         * marker with: `causeMarker` was not threaded through the CLI at all. The only way out was
         * to abandon the command and assemble the ESLint config by hand — that is, the defect
         * pushed you onto exactly the path the utility frees you from.
         * The Russian marker stays EXPRESSIBLE, but now as a value, not as the default.
         */
        "review/findings-cause": [
          "error",
          {
            minFindings: opts.minFindings ?? 3,
            ...(opts.causeMarker ? { causeMarker: opts.causeMarker } : {}),
            ...(opts.reviewSince ? { sinceCreated: opts.reviewSince } : {}),
          },
        ],
        ...(opts.docFields
          ? { "doc/fields": ["warn", { fields: opts.docFields }] }
          : {}),
      },
    },
  ];

  // `.tex` only if the language loaded: it pulls in the LaTeX parser, and dying because of it on a
  // corpus without a single `.tex` would be refusing to work where work is possible.
  if (texLanguage)
    cfg.push({
      files: ["**/paper.tex"],
      plugins: {
        tex: { languages: { latex: texLanguage }, rules: texBuild },
        paper: { rules: paperRules },
      },
      language: "tex/latex",
      rules: {
        "paper/research-question": "warn",
        "paper/typography": typographyOpt,
        "tex/future-promise": "warn",
        "tex/acm-frontmatter-override": "error",
      },
    });
  return cfg;
}

/**
 * The directory ESLint runs from. ESLint ignores every file outside it (#48), and
 * `paper/typography` reads its debt keys relative to it — keys the config writes from its own
 * directory. So: the deepest directory holding the config's directory and every path. With the
 * papers inside the config's directory, that is the config's directory itself.
 */
const lintRoot = (home: string, paths: readonly string[]): string =>
  commonDir([home, ...paths]);

/** The longest shared leading run of path segments. */
const commonDir = (paths: readonly string[]): string => {
  const [first = [], ...rest] = paths.map((p) => p.split(sep));
  const end = first.findIndex((part, i) =>
    rest.some((other) => other[i] !== part),
  );
  return first.slice(0, end === -1 ? undefined : end).join(sep) || sep;
};

export function parseArgs(argv: readonly string[]): Args {
  // `--help` is parsed BEFORE argv[0] becomes the command: otherwise `rpp --help` answers
  // "unknown command `--help`" — caught by the very first run of the utility.
  const out: Args = {
    cmd: null,
    paths: [],
    config: null,
    json: false,
    all: false,
    dryRun: false,
    // -1 = warnings NEVER fail the run. In this set most findings are advisory by design, and a
    // gate that fails on advice gets muted entirely.
    maxWarnings: -1,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("-")) out.cmd = rest.shift() ?? null;

  // 🔴 A FLAG WHOSE VALUE WAS TAKEN AWAY IS A REFUSAL, NOT A DEFAULT. The compiler found this
  // during the move to TypeScript: `rest[++i]` past the last argument gives `undefined`, and
  // `rpp lint --config` (the value forgotten, or eaten by a substitution in CI) silently turned
  // into "no config given" — that is, it went to auto-discovery and linted against SOMEONE ELSE'S
  // file, saying nothing. The failure is one-sided and toward silence, so it is cured by
  // behaviour, not by a type cast.
  const valueFor = (flag: string, i: number): string | undefined => {
    const v = rest[i];
    if (v === undefined) out.missingValue = flag;
    return v;
  };

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === undefined) continue;
    if (a === "--json") out.json = true;
    else if (a === "--all") out.all = true;
    else if (a === "--dry-run") out.dryRun = true;
    // `--options` was the first spelling and is kept working. It named the wrong thing — every
    // other tool in the stack calls this file its config — but a flag in someone's CI is not
    // ours to break.
    else if (a === "--config" || a === "--options")
      out.config = valueFor(a, ++i) ?? null;
    else if (a === "--max-warnings") {
      const v = valueFor(a, ++i);
      if (v !== undefined) out.maxWarnings = Number(v);
    } else if (a === "--help" || a === "-h") out.help = true;
    else out.paths.push(a);
  }
  return out;
}

export const CONFIG_NAME = "rpp.json";
export const PKG_NAME = "package.json";

/** Where the consumer's settings were found, and in which of the two carriers. */
export interface Declaration {
  readonly path: string;
  readonly kind: "package.json" | "rpp.json";
}

/**
 * 🔴 THE CLI HAD TO LEARN TO READ `package.json`, AND THAT IS NOT A SIDE ERRAND. `rpp init` now
 * writes ONE declaration, into the `package.json` key that the three hooks and `eslint-rules`
 * already read. Without this walker the install it produces would not work at all: `rpp lint`
 * would find no `rpp.json`, report "nothing to lint", and the consumer would be back to
 * declaring the same directory twice — the defect the single declaration removes (issue #33,
 * `docs/install.md`).
 *
 * `rpp.json` stays readable as a DEPRECATED fallback, and the read says so out loud. Silently
 * dropping a file this command used to write would break working setups on upgrade.
 *
 * The walk goes up to the filesystem root, the way eslint, prettier and tsc find theirs, so a run
 * from inside one paper sees the same settings as a run from the repository root. At each level
 * `package.json` wins over `rpp.json`: it is the carrier every other reader uses, so preferring
 * it is what keeps "one declaration" true rather than merely intended.
 */
export function findDeclaration(startDir: string): Declaration | null {
  let dir = resolve(startDir);
  for (;;) {
    const pkg = join(dir, PKG_NAME);
    if (existsSync(pkg) && declaresSettings(pkg))
      return { path: pkg, kind: "package.json" };
    const rpp = join(dir, CONFIG_NAME);
    if (existsSync(rpp)) return { path: rpp, kind: "rpp.json" };
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * A `package.json` WITHOUT the key is not a declaration and must not stop the walk — every
 * project on the way up has one, so stopping there would make the search find nothing, always.
 * An unparsable one is treated the same way here; `rpp doctor` is the command that reports it.
 */
const declaresSettings = (pkgPath: string): boolean => {
  try {
    return (
      JSON.parse(readFileSync(pkgPath, "utf8"))?.[CONFIG_KEY] !== undefined
    );
  } catch {
    return false;
  }
};

/** Kept as the one-line question "which file holds the settings" — callers that only need a path. */
export function findConfig(startDir: string): string | null {
  return findDeclaration(startDir)?.path ?? null;
}

/**
 * Reading the config, ONE reader for all commands. Pulled out of `run()` the moment a second
 * command needed the same config (`build`): two copies of this block would have drifted apart on
 * the very first edit — exactly the class that already cost us the empty-set guard in two places.
 *
 * @returns `{ opts, configPath }` on success, or `{ code }` — and then the caller exits with it.
 */
export function readConfig(
  a: Args,
  {
    log = console.log,
    err = console.error,
    cwd = process.cwd(),
  }: {
    log?: typeof console.log;
    err?: typeof console.error;
    cwd?: string;
  } = {},
): ConfigRead {
  // 🔴 THE CONFIG FINDS ITSELF. An explicit `--config` beats the discovered one — it was named out
  // loud, and a substitution is never silent. For an explicit path the FILE NAME decides the
  // carrier: the path here is a value, not a text to make guesses about, and `package.json` holds
  // the settings under a key.
  const decl: Declaration | null = a.config
    ? {
        path: a.config,
        kind: basename(a.config) === PKG_NAME ? "package.json" : "rpp.json",
      }
    : findDeclaration(cwd);
  const configPath = decl?.path ?? null;
  if (a.config && !existsSync(a.config)) {
    err(`config file not found: ${a.config}`);
    return { code: 2 };
  }

  let opts: RppConfig = {};
  if (decl && configPath) {
    let parsed: any;
    try {
      parsed = JSON.parse(readFileSync(configPath, "utf8"));
    } catch (e) {
      err(`${configPath} is not valid JSON: ${(e as Error).message}`);
      return { code: 2 };
    }
    opts = decl.kind === "package.json" ? (parsed?.[CONFIG_KEY] ?? {}) : parsed;
    // The discovered config is NAMED out loud. Otherwise a run from someone else's directory picks
    // up someone else's file and does not say so — and a typography-debt mismatch looks like a finding.
    //
    // 🔴 IN `--json` MODE — TO stderr. Machine output must be ONE parsable document: a line before
    // the array breaks any `| jq`, and it breaks it for the consumer, not for us. Caught not by a
    // test but by an attempt to wire our own action to this output; in the harness I first WORKED
    // AROUND this line (stripped the first line before JSON.parse) — that is, the workaround hid
    // the defect exactly where it should have been shouting.
    (a.json ? err : log)(`config: ${relative(cwd, configPath) || CONFIG_NAME}`);
    // 🔴 THE DEPRECATED CARRIER IS NAMED OUT LOUD, IT DOES NOT STOP BEING READ. The hooks read ONLY
    // package.json, so a consumer whose settings stayed in rpp.json lints one directory and guards
    // another — and both states look equally green.
    if (decl.kind === "rpp.json")
      (a.json ? err : log)(
        `  ⚠ ${CONFIG_NAME} is deprecated — move these keys under "${CONFIG_KEY}" in ${PKG_NAME}; ` +
          `the hooks read only that file. \`npx rpp init\` does it for you.`,
      );
  }

  // 🔴 `papers` IS A REQUIRED FIELD. The papers directory is the one thing without which the tool
  // does not know what it works on, and the one thing that cannot be guessed: a default of "." runs
  // the rules over the whole checkout and exits green over a scope nobody chose.
  if (decl && !hasPapers(opts)) {
    err(
      decl.kind === "package.json"
        ? `${decl.path} must declare \`papers\` — the directory your papers live in, e.g.\n` +
            `  { "${CONFIG_KEY}": { "papers": "papers" } }\n` +
            `It is the one thing this tool cannot guess. \`npx rpp init\` writes it for you.`
        : `${decl.path} must declare \`papers\` — the directory your papers live in, e.g.\n` +
            `  { "papers": "papers" }\n` +
            `It is the one thing this tool cannot guess.`,
    );
    return { code: 2 };
  }
  return { opts, configPath };
}

/** `papers` may be one directory or several; both spellings normalise to a list. */
export function toPaths(papers: unknown): string[] {
  if (typeof papers === "string") return papers.trim() ? [papers.trim()] : [];
  if (Array.isArray(papers))
    return papers.filter((x) => typeof x === "string" && x.trim());
  return [];
}

const hasPapers = (opts: RppConfig): boolean => toPaths(opts.papers).length > 0;

/**
 * `rpp hook <name>` — run an editor hook. It exists for ONE thing: so that the wiring does not
 * address the runtime from the project root.
 *
 * 🔴 WHAT IT WAS AND WHY IT BROKE. `hooks.json` called
 *     node "${CLAUDE_PROJECT_DIR}/node_modules/vigiles/dist/cli.js" hook-runtime run-program …
 * While `vigiles` was a PEER dependency this path was GUARANTEED: a peer is installed by the
 * consumer itself, into its own root. After the move to ordinary dependencies the guarantee was
 * gone, and a measurement showed it — one tarball, two managers:
 *     npm:  node_modules/vigiles/dist/cli.js   PRESENT
 *     pnpm: node_modules/vigiles/dist/cli.js   ABSENT (only research-paper-pipeline in the root)
 * The cost of the failure is asymmetric: `|| exit 2` stood on PreToolUse(Bash), that is, ANY
 * command was denied, including the one you fix it with.
 *
 * WHAT IT IS NOW. The wiring calls ITS OWN bin — `research-paper-pipeline` is a direct dependency,
 * so it lies in the root under any manager — and the runtime is resolved FROM THE POSITION OF THIS
 * FILE via `createRequire`. Wherever the manager laid the tree out, the resolver finds the same
 * thing an `import` from inside the package would.
 *
 * 🔴 AND `|| exit 2` IS REMOVED FROM THE SHELL. The decision to stop is a decision, and it is taken
 * here, in code. In the shell it meant "any mishap = block everything": the runtime was not found —
 * work stopped. Now a runtime that is not found complains LOUDLY and returns 0, while the hook's
 * real verdict (2 included) passes through. Silent degradation is worse than explicit degradation,
 * but blocking everything is worse than both.
 */
export function runHook(
  name: string | undefined,
  {
    err = console.error,
    run = spawnSync,
    // The resolver is injected so that "the runtime was not found" is checked by an assert and not
    // by deleting node_modules: a failure must be reproducible, not staged.
    // 🔴 WE RESOLVE THE PACKAGE, NOT A FILE INSIDE IT. `require.resolve("vigiles/dist/cli.js")`
    // DOES NOT WORK: the package's `exports` map hands out only "." and nine named subpaths, and
    // `./dist/cli.js` — even `./package.json` — is not among them:
    //     Package subpath './dist/cli.js' is not defined by "exports"
    // This is neither our oversight nor their bug: a closed export map is normal practice. So we
    // resolve the root entry ("." → dist/test.js), take its directory and put `cli.js` next to it —
    // the very file the package itself declares as its `bin`.
    resolve = (spec: string): string =>
      createRequire(import.meta.url).resolve(spec),
  }: {
    err?: typeof console.error;
    run?: typeof spawnSync;
    resolve?: (spec: string) => string;
  } = {},
): number {
  if (!name) {
    err(`\`hook\` needs a name, e.g. \`rpp hook paper-edit-guard\``);
    return 2;
  }
  const program = fileURLToPath(
    new URL(`../hooks/${name}.hook.mjs`, import.meta.url),
  );
  if (!existsSync(program)) {
    err(`unknown hook \`${name}\` — no such program at ${program}`);
    return 2;
  }
  let runtime;
  try {
    runtime = join(dirname(resolve("vigiles")), "cli.js");
    if (!existsSync(runtime))
      throw new Error(`resolved vigiles, but no cli.js beside it: ${runtime}`);
  } catch {
    err(
      `rpp: the hook runtime (vigiles) is not resolvable from ${fileURLToPath(new URL(".", import.meta.url))}.\n` +
        `The \`${name}\` hook is NOT running. Everything else — \`rpp lint\`, CI — is unaffected.\n` +
        `Reinstall this package so its dependencies are present.`,
    );
    return 0;
  }
  const r = run(
    process.execPath,
    [runtime, "hook-runtime", "run-program", program],
    {
      stdio: "inherit",
    },
  );
  return r.status ?? 0;
}

/**
 * 🔴 THE TARGET IS NAMED, "EVERYTHING" IS AN OPTION. That is how it is for everyone whose build is
 * expensive and has side effects: `make <target>`, `docker build <context>`, `latexmk paper.tex`;
 * with cargo, "the whole workspace" is turned on by a separate flag. A default of "build
 * everything" on a corpus of five papers is twenty pdflatex runs instead of one, and almost never
 * what was wanted.
 */
function runBuild(
  a: Args,
  {
    log,
    err,
    cwd,
  }: { log: typeof console.log; err: typeof console.error; cwd: string },
): number {
  const cfg = readConfig(a, { log, err, cwd });
  if (cfg.code !== undefined) return cfg.code;
  const { opts, configPath } = cfg;
  const candidates =
    Array.isArray(opts.buildScripts) && opts.buildScripts.length
      ? opts.buildScripts
      : BUILD_SCRIPTS;
  const roots = toPaths(opts.papers).map((rel) =>
    resolve(configPath ? dirname(configPath) : cwd, rel),
  );

  let targets;
  if (a.all) {
    targets = roots.flatMap((r) => papersIn(r));
    if (targets.length === 0) {
      err(
        `--all: no papers found under ${roots.join(", ") || "(nothing declared)"}`,
      );
      return 1;
    }
  } else if (a.paths.length > 0) {
    targets = a.paths.map((p) => resolve(cwd, p));
  } else {
    err(
      `\`build\` needs a target: \`rpp build papers/my-paper\` or \`rpp build --all\`.\n` +
        `There is deliberately no "build everything" default: a build is expensive and has side\n` +
        `effects, so the target is named — as with make, docker and latexmk.`,
    );
    return 2;
  }

  const results = targets.map((t) =>
    buildPaper(t, { candidates, cwd, dryRun: a.dryRun }),
  );
  log(formatResults(results));
  const remedy = remedyFor(results, candidates);
  if (remedy) err(remedy);
  return anyFailed(results) ? 1 : 0;
}

export async function run(
  argv: readonly string[],
  {
    log = console.log,
    err = console.error,
    cwd = process.cwd(),
  }: {
    log?: typeof console.log;
    err?: typeof console.error;
    cwd?: string;
  } = {},
): Promise<number> {
  const a = parseArgs(argv);
  // The refusal must come FIRST: behind a flag without a value there is usually a typo, or a
  // substitution in CI that collapsed into nothing, and any continuation works on something other
  // than what was asked for.
  if (a.missingValue) {
    err(
      `${a.missingValue} needs a value — it was given none.\n` +
        `Without it the run would silently fall back to whatever config it discovers, which is ` +
        `not what the command line said.`,
    );
    return 2;
  }
  if (a.help || !a.cmd) {
    log(USAGE);
    return a.help ? 0 : 2;
  }
  // `init` asks the CLI's OWN reader what it would lint, so the two sides `doctor` compares are
  // not two implementations of the same question. A second resolver here is the defect the
  // comparison exists to catch.
  if (a.cmd === "init")
    return await init(a.paths[0] ?? ".", {
      log,
      err,
      cwd,
      resolveCliPapers: (root: string): string | null => {
        const read = readConfig(
          { ...a, config: null },
          { log: () => {}, err: () => {}, cwd: root },
        );
        return read.code === undefined
          ? (toPaths(read.opts.papers)[0] ?? null)
          : null;
      },
    });
  // `doctor` reads the config but must NOT die on a broken one — reporting that the config is
  // broken is precisely its job. So a failed read becomes "the CLI would lint nothing", which is
  // what it prints, rather than an early exit that tells the reader nothing about the hooks.
  if (a.cmd === "doctor") {
    const read = readConfig(a, { log: () => {}, err: () => {}, cwd });
    const papers =
      read.code === undefined ? (toPaths(read.opts.papers)[0] ?? null) : null;
    return doctor({
      log,
      cwd,
      projectDir: process.env["CLAUDE_PROJECT_DIR"] ?? cwd,
      cliPapers: papers,
    });
  }
  if (a.cmd === "hook") return runHook(a.paths[0], { err });
  if (a.cmd === "build") return runBuild(a, { log, err, cwd });
  if (a.cmd === "check")
    err(
      `\`check\` is now \`lint\` — running it anyway. Update the call to \`rpp lint\`.`,
    );
  if (a.cmd !== "lint" && a.cmd !== "check") {
    err(`unknown command \`${a.cmd}\`\n\n${USAGE}`);
    return 2;
  }

  const cfg = readConfig(a, { log, err, cwd });
  if (cfg.code !== undefined) return cfg.code;
  const { opts, configPath } = cfg;

  // A command-line argument OVERRIDES the config: one paper out of the corpus gets linted without
  // editing a file.
  //
  // 🔴 A path FROM THE CONFIG is resolved relative to the CONFIG'S DIRECTORY, not the current one.
  // Otherwise walking up is pointless: from `papers/aisec-2026` the file would be found, but
  // `"papers": "papers"` would point at `papers/aisec-2026/papers`, which does not exist — and the
  // run would fail with "nothing found" where everything is in place. A command-line argument stays
  // relative to the current directory: it was typed here and now.
  //
  // Both kinds end up ABSOLUTE: ESLint below runs from `lintRoot`, not from here, and would resolve a
  // relative argument against the wrong directory.
  const paths =
    a.paths.length > 0
      ? a.paths.map((p) => resolve(cwd, p))
      : toPaths(opts.papers).map((rel) =>
          resolve(dirname(configPath ?? cwd), rel),
        );
  if (paths.length === 0) {
    err(
      `nothing to lint: no path was given and no ${CONFIG_NAME} was found.\n` +
        `Run \`npx rpp init\` here, or pass the directory: \`rpp lint papers\`.`,
    );
    return 2;
  }

  // 🔴 STRUCTURE IS CHECKED BEFORE ESLint AND SEPARATELY FROM IT. A rule is invoked for the file
  // handed to it; a missing file is never handed over, so no rule at all can report the absence —
  // a directory without `PIPELINE-STATUS.md` simply gets not a single rule and reports clean. The
  // analysis of why a structure plugin for ESLint does not cure this is in `structure.mjs`.
  const structure = checkStructure(paths, opts.structure, { cwd });

  let texLanguage: unknown = null;
  try {
    // @ts-expect-error — the module is .mjs and has no types; a missing LaTeX parser is a normal
    // case here, it is caught by the catch below.
    ({ texLanguage } = await import("../eslint-rules/latex-language.mjs"));
  } catch {
    /* without a LaTeX parser we work over markdown */
  }

  const eslint = new ESLint({
    cwd: lintRoot(configPath ? dirname(resolve(cwd, configPath)) : cwd, paths),
    overrideConfigFile: true,
    overrideConfig: buildConfig(opts, texLanguage) as Linter.Config[],
  });

  // 🔴 ESLint THROWS on an empty set (`NoFilesFoundError`) — the guard below simply never got
  // reached, which is what the very first run over an empty directory showed: instead of a clear
  // message a stack from the depths of eslint-helpers.js flew out. A failure stays a failure, but
  // an explicable one.
  let results: any[];
  try {
    results = await eslint.lintFiles(paths);
  } catch (e) {
    const fail = e as { messageTemplate?: string; message?: string } | null;
    if (
      fail?.messageTemplate === "file-not-found" ||
      /No files matching/i.test(fail?.message ?? "")
    )
      results = [];
    else throw e;
  }

  // 🔴 THE GUARD AGAINST A GREEN ZERO, the same one as in action.yml and for the same reason:
  // ESLint exits zero when there are no findings, and "no findings" is byte-for-byte
  // indistinguishable from "not a single rule got a single file". A rule whose glob did not match
  // is not invoked — and, not being invoked, it physically cannot report that.
  if (results.length === 0) {
    err(
      `nothing was linted under ${paths.map((x) => relative(cwd, x) || x).join(", ")} — no PIPELINE-STATUS.md, paper.md/tex or reviews/ found there. A clean report over zero files is not a clean report.`,
    );
    return 1;
  }

  if (a.json)
    log(JSON.stringify([...asEslintResults(structure), ...results], null, 1));
  else {
    // Missing things are printed FIRST: they explain why the report below may be suspiciously
    // short. The reverse order would read as "all clean — oh, and also this".
    if (structure.length > 0) log(formatStructure(structure));
    const out = await (await eslint.loadFormatter("stylish")).format(results);
    log(
      out.trim() ||
        (structure.length > 0
          ? ""
          : `✓ ${results.length} file(s) checked, no findings`),
    );
  }
  if (structure.length > 0 || results.some((r) => r.errorCount > 0)) return 1;
  // Warnings fail the run only when the threshold is named EXPLICITLY. A negative threshold means
  // "do not count them at all", and that is the default.
  if (a.maxWarnings >= 0) {
    const warnings = results.reduce((n, r) => n + r.warningCount, 0);
    if (warnings > a.maxWarnings) {
      err(
        `${warnings} warning(s) exceed the --max-warnings limit of ${a.maxWarnings}`,
      );
      return 1;
    }
  }
  return 0;
}

// 🔴 `isMain`, NOT A STRING COMPARISON. The first version wrote
//     if (import.meta.url === `file://${process.argv[1]}`)
// and the utility, launched via `node_modules/.bin/rpp`, SILENTLY EXITED WITH ZERO: npm puts a
// SYMLINK there, `process.argv[1]` stays the symlink's path while `import.meta.url` is the real
// path, and the condition is false. That is, the only way a real consumer launches the utility did
// not work at all — and it looked like a clean run.
// The helper WAS ALREADY in the package, and its docstring describes exactly this failure
// verbatim: "turns a CLI into a no-op that exits 0". I wrote by hand what was lying there ready.
if (isMain(import.meta.url)) process.exit(await run(process.argv.slice(2)));
