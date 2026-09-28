/**
 * consumer.mjs — WHERE THE CONSUMER IS, AND WHETHER I AM THE ENTRY POINT.
 *
 * Sibling of `eslint-rules/papers.mjs`. That module answers "where does the consumer keep its
 * papers"; this one answers the two questions a script inside `node_modules` cannot answer for
 * itself once it stops living in the repository it serves:
 *
 *   1. where is the consumer's repository root, now that walking `..` from here lands in
 *      `node_modules/` instead;
 *   2. was this file executed, or merely imported — a question whose usual answer stops
 *      working the moment the file is reached through a symlink;
 *   3. by what path a SKILL'S PROSE names these scripts, so that a checker can tell an
 *      instruction that runs them from one that runs something else. See the fourth-carrier
 *      section at the bottom of this file.
 *
 * ── HOW THIS PACKAGE IS REACHED ─────────────────────────────────────────────
 * A consumer keeps a symlink where the directory used to be:
 *
 *     .claude/skills/paper-pipeline/scripts  ->  ../../../../node_modules/
 *                                                paperlint/skills/
 *                                                paper-pipeline/scripts
 *
 * so every command a skill's prose already names — `node .claude/skills/paper-pipeline/scripts/
 * <script>.mjs …` — keeps working unchanged. That is the whole reason the symlink exists: the
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
 * but leaves `argv[1]` as typed. Two consequences, each one a function here:
 *
 *   🔴 `import.meta.url === \`file://${process.argv[1]}\`` — the main guard nine scripts in this
 *      directory used — is `false` through the symlink. NOT an error: the process exits 0 having
 *      done nothing, and every caller reads success. `isMain()` compares
 *      against the REALPATH of `argv[1]` instead, which is true through both routes.
 *
 *   🔴 `resolve(import.meta.dirname, "..", "..", "..", "..")` — the repository root, correct
 *      while these files lived in the consumer — now lands inside `node_modules`. It is replaced
 *      by `process.cwd()`, which is the consumer root because every one of those 306 invocations
 *      is `node .claude/skills/…` typed from the repository root. `consumerRoot()`.
 *
 * ⚠️ THE EXAMPLES HERE ARE DELIBERATELY GENERIC. The first consumer's own directory names are
 * absent by the same rule `papers.harness.mjs` part IV enforces for `papers.mjs`: a package that
 * spells out one user's private tree has one user.
 */
import {
  existsSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

// Re-exported, not re-declared — see the note in `lib/paper-config.mjs`. This file is not a hook
// and never needed its own copy.
import { CONFIG_FILE, CONFIG_KEY, settingsOf } from "#lib/paper-config";
export { CONFIG_KEY, settingsOf };

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

/**
 * The package's npm name — the directory it lands in under `node_modules`, and the name Node
 * resolves it by. Every path into the installed package is built from this, never re-spelled;
 * `consumer.harness.mjs` checks it against `package.json`.
 */
export const PACKAGE_NAME = "paperlint";

/**
 * The package's one executable, relative to the package root — what `bin` in package.json names
 * and what every hook command runs. Named like the package; `consumer.harness.mjs` checks it
 * against the manifest, so the file and the hook commands cannot drift apart.
 */
export const BIN_FILE = `bin/${PACKAGE_NAME}.mjs`;

/**
 * Where the package keeps the skills it ships, relative to the package root. One constant, read by
 * the linker (`src/link-skills.ts`) and the install e2e, so the two cannot disagree; `files` in
 * package.json must include it for the skills to reach the tarball.
 */
export const SHIPPED_SKILLS_DIR = "skills";

/** The consumer's skills directory — the fixed Claude Code layout, under its root. */
export function consumerSkillsDir(opts) {
  return join(consumerRoot(opts), ".claude", "skills");
}

/**
 * The skills installed in `dir`: every entry that LEADS TO a directory holding a `SKILL.md`,
 * sorted by name. The one answer to "which skills are here" — for the consumer's
 * `.claude/skills/`, for this package's own declared skills directory, and for a copy of either.
 *
 * 🔴 IT FOLLOWS SYMLINKS, AND THAT IS THE WHOLE POINT (paperlint#62). `paperlint init` (`src/link-skills.ts`)
 * installs every skill as a link `.claude/skills/<name> -> …/skills/<name>`. A `Dirent` from
 * `readdirSync(dir, { withFileTypes: true })` describes the entry itself, so `isDirectory()` is
 * false for every link: five eval preflights asked the question that way, saw zero skills in
 * every consumer, and refused to start. The writer of those links imports this function too, so
 * the code that makes the fact and the code that reads it back cannot disagree about its shape.
 *
 * 🔴 A LINK THAT DOES NOT RESOLVE IS REFUSED — not skipped, not counted. Skipped, it reads as a
 * skill that was never installed and sends the reader after the wrong cause; counted, it hands the
 * caller a skill whose `SKILL.md` cannot be opened. Every caller is a check or a preflight, for
 * which a broken install is an answer to report, not a detail to paper over. The error carries
 * `code: "DANGLING_SKILL_LINK"` and `dangling: [{ name, target, cause }]` for a caller that
 * formats its own report.
 *
 * ⚠️ Why this lives here and not in `src/link-skills.ts` beside the writer: the readers include
 * `.mjs` scripts that run from `node_modules` in a consumer, and Node refuses to strip types
 * there (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, measured on Node 22.22). Importing the
 * built `dist/` instead would make every eval depend on a build being current. So the fact lives
 * in the port and the TypeScript writer imports it, as `src/cli.ts` already does for `isMain`.
 *
 * @param dir  the directory to list. A missing directory throws `ENOENT` from `readdirSync`.
 * @param fs   the four calls it makes; a test passes a fake to stage what a real disk only does
 *             in a race (an entry gone between the listing and the stat).
 * @returns the skill names, sorted.
 */
export function installedSkills(
  dir,
  fs = { readdirSync, statSync, existsSync, readlinkSync },
) {
  const names = [];
  const dangling = [];
  for (const name of fs.readdirSync(dir)) {
    const entry = join(dir, name);
    let st;
    try {
      st = fs.statSync(entry); // FOLLOWS the link — the question is where the entry LEADS
    } catch (e) {
      // The entry was listed a moment ago, so a failed stat is a link that leads nowhere
      // (ENOENT) or in a circle (ELOOP) — not an absence.
      dangling.push({
        name,
        target: readlinkOr(entry, fs.readlinkSync),
        cause: e.code ?? "error",
      });
      continue;
    }
    if (st.isDirectory() && fs.existsSync(join(entry, "SKILL.md")))
      names.push(name);
  }
  if (dangling.length) {
    const err = new Error(
      `${dangling.length} skill link(s) in ${dir} lead nowhere:\n` +
        dangling
          .map((d) => `  ${d.name} -> ${d.target} (${d.cause})`)
          .join("\n") +
        `\nRe-run \`npx paperlint init\` if the package moved, or remove the link if the skill was ` +
        `retired. This is refused rather than skipped: a skipped link reads as a skill that ` +
        `was never installed.`,
    );
    err.code = "DANGLING_SKILL_LINK";
    err.dangling = dangling;
    throw err;
  }
  return names.sort();
}

/** Where a link points, for the message — or a placeholder when it is not a link at all. */
function readlinkOr(entry, readlink) {
  try {
    return readlink(entry);
  } catch {
    return "(not a link)"; // a plain entry gone between the listing and the stat
  }
}

/**
 * True when `dir` lies inside a `node_modules` directory.
 *
 * Segment-wise, not `includes("node_modules")`: a repository legitimately named
 * `my-node_modules-inspector` is not an installed package, and a substring test would refuse it.
 * Cheap to get right, and the failure it prevents is a throw in someone's face.
 */
export function insideNodeModules(dir) {
  return dir.split(sep).includes("node_modules");
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHERE A SKILL'S PROSE NAMES THESE SCRIPTS
//
// `papersRoot()` answers "where does the consumer keep its papers". This answers: BY WHAT PATH
// does a skill instruct the model to run this package's scripts.
//
// 🔴 IT IS A DIFFERENT KIND OF PATH, and the difference decides the API. `papersRoot()` is read by
// CODE and may be absolute. This one is compared against text a human wrote inside a SKILL.md —
// `node .claude/skills/paper-pipeline/scripts/<script>.mjs …` — so it must stay relative to the consumer root and spelled with `/`, exactly as the prose
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
  const declared = settingsOf(consumerRoot({ env, cwd }))?.scripts;
  // 🔴 `declared === undefined`, NOT `declared ?? DEFAULT` — the same distinction `papersRoot()`
  // makes, for the same reason: `"scripts": null` is a keystroke, not an
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
        `— or declare the real, repository-relative location in ${join(root, CONFIG_FILE)}:\n` +
        `  { "scripts": "path/to/pipeline/scripts" }\n` +
        `(If nothing was declared, the root itself is under node_modules: run the command from ` +
        `the consumer repository, or export CLAUDE_PROJECT_DIR.)`,
    );
  if (!existsSync(abs))
    throw new Error(
      `${CONFIG_KEY}: the pipeline scripts path "${rel}" does not exist under ${root}.\n` +
        (declared === undefined
          ? `Nothing was declared, so the default "${DEFAULT_SCRIPTS_ROOT}" was used. Create the ` +
            `symlink there, or declare the real location in ${CONFIG_FILE}:\n` +
            `  { "scripts": "path/to/pipeline/scripts" }`
          : `It is declared in ${CONFIG_FILE} as ` +
            `"scripts": ${JSON.stringify(declared)}. Fix it there, or create the directory.`) +
        `\nThis is thrown rather than ignored on purpose: this value is a PREFIX that callers ` +
        `filter prose with, so a wrong one matches no instruction at all and every check built ` +
        `on it reports zero findings — byte-identical to a corpus that was checked and passed.`,
    );
  return rel;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHICH WALL CLOCK THE CONSUMER SCHEDULES AGAINST
//
// `papersRoot()` answers "where are the papers", `scriptsRoot()` "by what path does prose name
// these scripts", `triggerCases` "where are the consumer's own trigger cases". This answers: IN
// WHAT TIME ZONE does a deadline anchor get written.
//
// 🔴 WHY IT IS A DECLARATION AND NOT A CONSTANT. A deadline is the one quantity in this pipeline
// that is meaningless without a zone, and the zone belongs to the PERSON, not to the pipeline —
// the same CFP date is a different wall-clock hour for every author. A package that hard-codes
// one author's zone quietly schedules everyone else's submit-day at the wrong hour, and the
// failure surfaces as "I thought I had another day", which is the exact failure the AoE section
// of `plan-paper-timeline` exists to prevent.
//
// ── WHY THE DEFAULT IS `UTC` AND NOT A GUESS AT THE HOST'S ZONE ─────────────────
// `Intl.DateTimeFormat().resolvedOptions().timeZone` would return whatever zone the container
// happens to carry — which in CI is `UTC` and on a laptop is the laptop's, so the SAME repository
// would schedule differently depending on where the command ran. A fixed `UTC` is wrong in a way
// the reader can see and correct; a host-derived zone is wrong in a way that moves.
//
// ⚠️ VALIDATED, not merely typed. `Intl.DateTimeFormat` throws `RangeError` on an unknown zone, so
// a typo like `Europe/Berlinn` is caught here — before it reaches a calendar API that would either
// reject it a network round-trip later or, worse, accept a zone the author did not mean.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** The default. `UTC` is the only zone that is nobody's local time, so it cannot be mistaken for one. */
export const DEFAULT_TIMEZONE = "UTC";

/**
 * The IANA time zone the consumer's deadline anchors are written in.
 *
 * @returns the zone as DECLARED, e.g. `"Europe/Berlin"` — suitable for a calendar API's
 *          `timeZone` field and for `Intl` options.
 */
export function consumerTimezone({
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const declared = settingsOf(consumerRoot({ env, cwd }))?.timezone;
  // 🔴 `declared === undefined`, NOT `declared ?? DEFAULT` — the same distinction every carrier
  // above makes: `"timezone": null` is a keystroke, not an absence.
  const tz = declared === undefined ? DEFAULT_TIMEZONE : declared;
  if (typeof tz !== "string" || tz.length === 0)
    throw new TypeError(
      `${CONFIG_KEY}: "timezone" must be a non-empty IANA zone string, got ${JSON.stringify(tz)}`,
    );
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new RangeError(
      `${CONFIG_KEY}: "timezone" is ${JSON.stringify(tz)}, which is not an IANA time zone this ` +
        `runtime knows (e.g. "Europe/Berlin", "America/New_York", "UTC").\n` +
        `Fix it in ${CONFIG_FILE}.\n` +
        `This throws rather than falling back to ${DEFAULT_TIMEZONE} on purpose: a silent fallback ` +
        `would put every deadline anchor at the wrong hour while looking like it worked.`,
    );
  }
  return tz;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// WHOM THE SCHOLARLY APIs SHOULD CONTACT
//
// Crossref and friends run a "polite pool": send a `mailto:` in the User-Agent and you get the
// faster, more reliable tier, plus a warning by email instead of a silent block if your usage
// looks abusive.
//
// 🔴 WHY THIS CANNOT BE A CONSTANT, and it is not a privacy point but a correctness one. A
// hard-coded address makes EVERY user of this package send traffic attributed to ONE person: the
// rate-limit warnings go to someone who cannot act on them, and the person actually hammering
// the API never hears about it. (It is also how one author's personal address ends up in a
// public repository, which is the reason it was noticed.)
//
// ── WHY AN ABSENT VALUE IS A SILENT DEFAULT HERE, UNLIKE EVERY CARRIER ABOVE ────
// The others throw when undeclared because a missing path makes a FILTER match nothing, and a
// filter matching nothing reports "clean" about files it never opened. Nothing of that shape
// happens here: with no address the request simply goes to the public pool — slower and more
// rate-limited, which is visible as slowness, not as a wrong answer. Throwing would refuse to
// check citations at all over a courtesy header.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The contact address for scholarly-API User-Agents, or `null` when none is declared.
 *
 * @returns the declared address, or `null` — callers omit the `mailto:` fragment on `null`.
 */
export function consumerContactEmail({
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const declared = settingsOf(consumerRoot({ env, cwd }))?.contactEmail;
  if (declared === undefined || declared === null) return null;
  if (typeof declared !== "string" || !declared.includes("@"))
    throw new TypeError(
      `${CONFIG_KEY}: "contactEmail" must be an email address, got ${JSON.stringify(declared)}. ` +
        `Remove the key entirely to use the public pool.`,
    );
  return declared;
}

/** The prefix every prose path to this package's scripts starts with, derived from one root. */
export function pipelineScripts(root) {
  // 🔴 ONE TRAILING SLASH, NOT THE ONE THAT WAS TYPED. `scriptsRoot()` returns the declaration
  // verbatim — it must, the value is compared against prose — so `"scripts": "tools/pipeline/"`
  // is a perfectly reasonable thing for someone to write and reaches here with its own slash.
  // Concatenating another gives `tools/pipeline//`, which matches NOTHING: every filter built on
  // the prefix goes quiet and the checks report a clean corpus they never entered. The normalise
  // belongs here rather than in the resolver, because here the value is being turned into a path
  // and there it is still the consumer's own words.
  const base = root.replace(/\/+$/, "");
  return {
    /** What every prose path under this root starts with. Trailing slash, for `startsWith`. */
    prefix: `${base}/`,
  };
}
