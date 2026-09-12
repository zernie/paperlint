/**
 * consumer.mjs — WHERE THE CONSUMER IS, AND WHETHER I AM THE ENTRY POINT.
 *
 * Sibling of `eslint-rules/papers.mjs`. That module answers "where does the consumer keep its
 * papers"; this one answers the two questions a script inside `node_modules` cannot answer for
 * itself once it stops living in the repository it serves:
 *
 *   1. where is the consumer's repository root, now that walking `..` from here lands in
 *      `node_modules/` instead;
 *   2. where does the run ledger live, now that the directory next to this file is wiped by
 *      `npm ci`;
 *   3. was this file executed, or merely imported — a question whose usual answer stops
 *      working the moment the file is reached through a symlink;
 *   4. by what path a SKILL'S PROSE names these scripts, so that a checker can tell an
 *      instruction that runs them from one that runs something else. See the fourth-carrier
 *      section at the bottom of this file.
 *
 * ── HOW THIS PACKAGE IS REACHED ─────────────────────────────────────────────
 * A consumer keeps a symlink where the directory used to be:
 *
 *     .claude/skills/paper-pipeline/scripts  ->  ../../../../node_modules/
 *                                                research-paper-pipeline/skills/
 *                                                paper-pipeline/scripts
 *
 * so every command a skill's prose already names — `node .claude/skills/paper-pipeline/scripts/
 * ledger.mjs …` — keeps working unchanged. That is the whole reason the symlink exists: the
 * first consumer names those paths 306 times across 129 files, almost all of it in the PROSE of
 * skills, which no refactor can rewrite.
 *
 * ── MEASURED 2026-09-12, and it decides every function below ────────────────
 * Running `node .claude/skills/…/probe.mjs` through such a symlink:
 *
 *     import.meta.url   file:///…/node_modules/<pkg>/skills/…/probe.mjs   ← REALPATH
 *     process.argv[1]   /…/.claude/skills/…/probe.mjs                      ← SYMLINK PATH
 *     process.cwd()     /…/<the consumer repository root>
 *
 * Node resolves the entry point to its realpath (`--preserve-symlinks-main` is off by default)
 * but leaves `argv[1]` as typed. Three consequences, each one a function here:
 *
 *   🔴 `import.meta.url === \`file://${process.argv[1]}\`` — the main guard nine scripts in this
 *      directory used — is `false` through the symlink. NOT an error: the process exits 0 having
 *      done nothing. `ledger.mjs record …` would silently record nothing, `announce.mjs` would
 *      silently announce nothing, and every caller would read success. `isMain()` compares
 *      against the REALPATH of `argv[1]` instead, which is true through both routes.
 *
 *   🔴 `resolve(import.meta.dirname, "..", "..", "..", "..")` — the repository root, correct
 *      while these files lived in the consumer — now lands inside `node_modules`. It is replaced
 *      by `process.cwd()`, which is the consumer root because every one of those 306 invocations
 *      is `node .claude/skills/…` typed from the repository root. `consumerRoot()`.
 *
 *   🔴 `join(import.meta.dirname, "runs.jsonl")` — the ledger's default home — now points inside
 *      `node_modules`, which `npm ci` deletes. Appending there is SILENT DATA LOSS: the write
 *      succeeds, the rows are real, and they vanish at the next install with no error anywhere.
 *      `ledgerPath()` refuses to return that path at all.
 *
 * ── THE LEDGER, THREE RUNGS ─────────────────────────────────────────────────
 *   1. `PIPELINE_LEDGER` in the environment — always wins. This is what test harnesses set to
 *      keep fixture rows out of real history, so it must outrank a declaration on disk.
 *   2. `"research-paper-pipeline": { "ledger": "…" }` in the CONSUMER's `package.json`, read
 *      from `process.cwd()`, resolved relative to it.
 *   3. `runs.jsonl` beside this file — ONLY when this file is not inside `node_modules`, i.e.
 *      when the package is being developed in its own checkout. Inside `node_modules` with
 *      nothing declared, this THROWS.
 *
 * 🔴 WHY RUNG 3 THROWS RATHER THAN GUESSING. Every other candidate default is worse in the same
 * direction. Writing beside the file loses data at the next `npm ci`. Writing to
 * `<cwd>/runs.jsonl` puts an append-only journal at the top of someone's repository without
 * asking. Writing nowhere makes `record()` a no-op, which is the stored "nothing was wrong" this
 * ledger exists to abolish. A throw is the only one of the four that cannot be mistaken for
 * having worked — and it carries the cure, naming the key and the file to put it in.
 *
 * ⚠️ THE EXAMPLES HERE ARE DELIBERATELY GENERIC (`docs/pipeline-runs.jsonl`). The first
 * consumer's own directory names are absent by the same rule `papers.harness.mjs` part IV
 * enforces for `papers.mjs`: a package that spells out one user's private tree has one user.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

/** The key every carrier of this package reads its consumer-specific settings from. */
export const CONFIG_KEY = "research-paper-pipeline";

/**
 * True when `metaUrl` belongs to the module Node was told to execute.
 *
 * Replaces `import.meta.url === \`file://${process.argv[1]}\``, which is false through a symlink
 * and therefore turns a CLI into a no-op that exits 0. See the measurement above.
 *
 * @param metaUrl  pass `import.meta.url` from the calling module.
 */
export function isMain(metaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  let real;
  try {
    real = realpathSync(entry);
  } catch {
    // The entry point does not exist on disk — `node --eval`, a deleted file, a virtual loader.
    // Nothing to be the main module OF, so fall back to the plain comparison rather than throw:
    // being wrong here must never be louder than the program the caller actually asked for.
    real = entry;
  }
  return metaUrl === pathToFileURL(real).href;
}

/**
 * The root of the repository USING this package.
 *
 * `process.cwd()` rather than a walk up from `import.meta.dirname`, because the walk now ends in
 * `node_modules`. `CLAUDE_PROJECT_DIR` wins when set: the agent harness exports it, and it is
 * correct even when a hook or an editor starts the process somewhere other than the root.
 */
export function consumerRoot({ env = process.env, cwd = process.cwd() } = {}) {
  return env.CLAUDE_PROJECT_DIR || cwd;
}

/** The consumer's skills directory — the fixed Claude Code layout, under its root. */
export function consumerSkillsDir(opts) {
  return join(consumerRoot(opts), ".claude", "skills");
}

/** The consumer's parsed `package.json`, or `null` when there is none or it does not parse. */
export function consumerPkg(opts) {
  const file = join(consumerRoot(opts), "package.json");
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * True when `dir` lies inside a `node_modules` directory.
 *
 * Segment-wise, not `includes("node_modules")`: a repository legitimately named
 * `my-node_modules-inspector` is not an installed package, and a substring test would refuse to
 * write its ledger. Cheap to get right, and the failure it prevents is a throw in someone's face.
 */
export function insideNodeModules(dir) {
  return dir.split(sep).includes("node_modules");
}

/**
 * Where the run ledger lives. Three rungs; see the docblock.
 *
 * @param hereDir  the directory of the module that owns the ledger — pass `import.meta.dirname`.
 * @returns an absolute path. Never a path inside `node_modules`.
 */
export function ledgerPath(hereDir, { env = process.env, cwd = process.cwd() } = {}) {
  // Rung 1 — the environment. Deliberately first: harnesses redirect the ledger BEFORE importing
  // it, and a declaration on disk that could override that would put fixture rows in real history.
  if (env.PIPELINE_LEDGER) return resolve(env.PIPELINE_LEDGER);

  // Rung 2 — the consumer's declaration.
  const root = consumerRoot({ env, cwd });
  const declared = consumerPkg({ env, cwd })?.[CONFIG_KEY]?.ledger;
  // 🔴 `declared === undefined`, NOT `declared ?? default` — the same distinction `papersRoot()`
  // makes and for the same reason: `"ledger": null` is a keystroke, not an absence, and reading
  // it as "nothing was declared" would silently pick a different file than the one asked for.
  if (declared !== undefined) {
    if (typeof declared !== "string" || declared.length === 0)
      throw new TypeError(
        `${CONFIG_KEY}: "ledger" must be a non-empty string, got ${JSON.stringify(declared)}`,
      );
    return resolve(root, declared);
  }

  // Rung 3 — beside this file, but only in the package's own checkout.
  if (insideNodeModules(hereDir))
    throw new Error(
      `${CONFIG_KEY}: no ledger location is declared, and the default (a file beside this ` +
        `module) is inside node_modules, which \`npm ci\` deletes.\n` +
        `Declare where the ledger lives, in ${join(root, "package.json")}:\n` +
        `  "${CONFIG_KEY}": { "ledger": "docs/pipeline-runs.jsonl" }\n` +
        `or set PIPELINE_LEDGER for a single run.\n` +
        `This is thrown rather than defaulted on purpose: appending to a path under ` +
        `node_modules succeeds, so the rows would look recorded right up until the next ` +
        `install removed them, with no error at any point.`,
    );
  return join(hereDir, "runs.jsonl");
}

/**
 * `ledgerPath()` plus the assurance that the directory holding it exists.
 *
 * Split out rather than folded in, because the two failures are different: an undeclared ledger
 * is a setup mistake the message above can fix, while a declared-but-missing directory may be
 * the very thing the caller is about to create.
 */
export function ledgerPathExisting(hereDir, opts) {
  const p = ledgerPath(hereDir, opts);
  if (!existsSync(p))
    throw new Error(
      `${CONFIG_KEY}: the ledger "${p}" does not exist. Create it (an empty file is a valid ` +
        `empty ledger) or fix the "ledger" declaration in package.json.`,
    );
  return p;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE FOURTH CARRIER — WHERE A SKILL'S PROSE NAMES THESE SCRIPTS
//
// `papersRoot()` answers "where does the consumer keep its papers"; `ledgerPath()` answers
// "where does the run journal live"; `citeChecks` (read in `run-mechanical.mjs`) answers "where
// are the consumer's own citation checkers". This answers the fourth: BY WHAT PATH does a skill
// instruct the model to run `announce.mjs` and `ledger.mjs`.
//
// 🔴 IT IS A DIFFERENT KIND OF PATH FROM THE OTHER THREE, and the difference decides the API.
// The other three are read by CODE and may be absolute. This one is compared against text a
// human wrote inside a SKILL.md — `node .claude/skills/paper-pipeline/scripts/ledger.mjs record
// …` — so it must stay relative to the consumer root and spelled with `/`, exactly as the prose
// spells it. Returning an absolute path here would make every `startsWith` test false and every
// check that depends on it pass over an empty set.
//
// ── WHY IT NEEDS A DECLARATION AT ALL ───────────────────────────────────────
// `.claude/skills` is fixed by the agent harness and `paper-pipeline/scripts` is this package's
// own convention, so the default is right for a consumer that keeps the customary symlink. It
// is NOT right for a consumer that mounts the scripts elsewhere, renames the skill, or has not
// made the symlink yet — and the failure in all three cases is the silent one: a prefix that
// matches nothing turns `for (… of commands) if (!c.script.startsWith(prefix)) continue;` into a
// loop with an empty body. Zero findings, exit 0, indistinguishable from a corpus that passed.
//
// ── THE TWO REFUSALS ────────────────────────────────────────────────────────
//   1. the resolved directory is inside `node_modules` — refused even though it exists. This is
//      the tempting wrong fix after the move ("just point at the installed copy"), and it is
//      wrong twice over: `npm ci` deletes that tree, and a skill's prose would then name a path
//      no one can read in the repository. It is also how the DEFAULT fails: with the process
//      started inside the installed package and `CLAUDE_PROJECT_DIR` unset, `consumerRoot()` is
//      itself under `node_modules`, and the default resolves under it.
//   2. the resolved directory is not on disk — refused for the reason in the paragraph above:
//      the wrong prefix produces no findings rather than wrong ones.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The default. A consumer that declares nothing is assumed to keep the customary symlink at the
 * customary place, so that the path a skill's prose already names keeps resolving.
 */
export const DEFAULT_SCRIPTS_ROOT = ".claude/skills/paper-pipeline/scripts";

/**
 * The root-relative path by which the consumer's skills name this package's pipeline scripts.
 *
 * @returns the path as DECLARED (relative, `/`-separated) — it is compared against prose, not
 *          opened. Use `join(consumerRoot(), …)` when you need to touch the file.
 */
export function scriptsRoot({ env = process.env, cwd = process.cwd() } = {}) {
  const root = consumerRoot({ env, cwd });
  const declared = consumerPkg({ env, cwd })?.[CONFIG_KEY]?.scripts;
  // 🔴 `declared === undefined`, NOT `declared ?? DEFAULT` — the same distinction `papersRoot()`
  // and `ledgerPath()` make, for the same reason: `"scripts": null` is a keystroke, not an
  // absence, and silently substituting the default for it hides a typo behind a working run.
  const rel = declared === undefined ? DEFAULT_SCRIPTS_ROOT : declared;
  if (typeof rel !== "string" || rel.length === 0)
    throw new TypeError(
      `${CONFIG_KEY}: "scripts" must be a non-empty string, got ${JSON.stringify(rel)}`,
    );

  const abs = resolve(root, rel);
  if (insideNodeModules(abs))
    throw new Error(
      `${CONFIG_KEY}: the pipeline scripts path "${rel}" resolves to ${abs}, which is inside ` +
        `node_modules.\n` +
        `That path cannot be the one a skill names: \`npm ci\` deletes the tree, and the ` +
        `instruction would point at a directory the repository does not track.\n` +
        `Keep a symlink where the prose already looks —\n` +
        `  ${join(root, DEFAULT_SCRIPTS_ROOT)} -> node_modules/${CONFIG_KEY}/skills/paper-pipeline/scripts\n` +
        `— or declare the real, repository-relative location in ${join(root, "package.json")}:\n` +
        `  "${CONFIG_KEY}": { "scripts": "path/to/pipeline/scripts" }\n` +
        `(If nothing was declared, the root itself is under node_modules: run the command from ` +
        `the consumer repository, or export CLAUDE_PROJECT_DIR.)`,
    );
  if (!existsSync(abs))
    throw new Error(
      `${CONFIG_KEY}: the pipeline scripts path "${rel}" does not exist under ${root}.\n` +
        (declared === undefined
          ? `Nothing was declared, so the default "${DEFAULT_SCRIPTS_ROOT}" was used. Create the ` +
            `symlink there, or declare the real location in package.json:\n` +
            `  "${CONFIG_KEY}": { "scripts": "path/to/pipeline/scripts" }`
          : `It is declared in package.json under "${CONFIG_KEY}" as ` +
            `"scripts": ${JSON.stringify(declared)}. Fix it there, or create the directory.`) +
        `\nThis is thrown rather than ignored on purpose: this value is a PREFIX that callers ` +
        `filter prose with, so a wrong one matches no instruction at all and every check built ` +
        `on it reports zero findings — byte-identical to a corpus that was checked and passed.`,
    );
  return rel;
}

/**
 * The individual script paths, derived from one root.
 *
 * 🔴 THE NAMES LIVE HERE, NOT IN THE CONSUMER — the same half that keeps `paperFiles()` honest.
 * `announce.mjs` and `ledger.mjs` are this package's contract; a consumer that spelled them out
 * itself would keep its copy of the list in step by hand, and a hand-kept list rots silently.
 */
export function pipelineScripts(root) {
  return {
    /** What every prose path under this root starts with. Trailing slash, for `startsWith`. */
    prefix: `${root}/`,
    /** Announces that a gate has started. */
    announce: `${root}/announce.mjs`,
    /** Appends the verdict row. */
    ledger: `${root}/ledger.mjs`,
  };
}
