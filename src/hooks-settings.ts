/**
 * The three editor hooks, wired into `<project>/.claude/settings.json` — the file Claude Code
 * documents as the way to share hooks with a team ("Commit `.claude/settings.json` so everyone
 * who clones the repository gets the same … hooks"). `paperlint init` writes it; `paperlint doctor` reads it.
 *
 * 🔴 WHY THIS REPLACED THE PLUGIN AS THE CARRIER (docs/prior-art/paper-folder-scaffolding.md § 5).
 * The plugin needed two `/plugin` lines typed by a human inside Claude Code: an agent installing
 * this package cannot type them, `paperlint doctor` cannot see their effect, and a plugin that the
 * REPOSITORY declares (`enabledPlugins`) is not installed in a cloud session. A settings file is
 * an ordinary file edit, it is committed, and a single-repository cloud session reads its hooks.
 * (A plugin the USER installed at account level does load in the cloud — but that is per person,
 * so a collaborator or a fresh account gets nothing, and doctor still cannot see it.)
 *
 * ── THE ONE SOURCE ─────────────────────────────────────────────────────────────────────────
 * The wiring is read from `plugin/hooks/hooks.json`, never copied. The hook NAMES are derived
 * from its commands, so a hook added there is wired and checked here without a second list.
 *
 * ── THE MERGE IS vigiles'S, NOT OURS ───────────────────────────────────────────────────────
 * `claudeCodeHookProtocol.mergeRegistrations(existing, compiled, managedBy)` from the public
 * `vigiles/claude-code` entry. Ownership is decided per COMMAND by the path token, so a user's
 * own hook sharing a matcher block with ours survives, and a second run changes nothing. It is
 * passed in rather than imported here: loading `vigiles/claude-code` costs ~140 ms and pulls
 * `@ast-grep/napi`, which `paperlint lint` must not pay for. Only `init` loads it.
 */
// eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BIN_FILE,
  PACKAGE_NAME,
} from "../skills/paper-pipeline/scripts/consumer.mjs";

/** The committed, shared settings file — husky's `.husky/` analogue, except git carries it. */
export const SETTINGS_PATH = join(".claude", "settings.json");

/** Where the wiring lives in this package. The same file the plugin serves, read, not copied. */
export const WIRING_FILE = fileURLToPath(
  new URL("../plugin/hooks/hooks.json", import.meta.url),
);

/**
 * The path token vigiles' merge keys ownership on. Relative on purpose: the merge strips quotes
 * and `${CLAUDE_PROJECT_DIR}/` before comparing, so this is the same file as the spelling in
 * `hooks.json`, and nothing machine-specific lands in a committed file.
 */
export const MANAGED_BY = `node_modules/${PACKAGE_NAME}/${BIN_FILE}`;

export interface HookCommand {
  readonly type: string;
  readonly command: string;
}
export interface HookEntry {
  readonly matcher?: string;
  readonly hooks: readonly HookCommand[];
}
export type HooksMap = Readonly<Record<string, readonly HookEntry[]>>;

/** A settings object as far as this module cares: anything, plus maybe `hooks` and plugins. */
export type Settings = Record<string, unknown>;

/** vigiles' merge, as the one function this module needs from it. */
export type Merge = (
  existing: Settings,
  compiled: HooksMap,
  managedBy: string,
) => Settings;

/** One shell token reduced to the path it names — the same two strips vigiles' merge applies. */
function bare(token: string): string {
  const unquoted = token.replace(/^["']/, "").replace(/["']$/, "");
  return unquoted.replace(/^\$\{?CLAUDE_PROJECT_DIR\}?[/\\]/, "");
}

/** A hook command reduced to what it runs: the hook, and the path token that runs it. */
interface Run {
  readonly name: string;
  readonly ours: boolean;
  readonly path: string;
}

/**
 * Which paperlint hook a command runs, if any, and whether it is spelled the way `init` writes it.
 *
 * Recognised spellings — each is ONE lexeme of a shell command, which is what a command is:
 *   `node <…>/node_modules/paperlint/bin/paperlint.mjs hook <name>`
 *                          ours when the path is exactly MANAGED_BY
 *   `npx paperlint hook <name>`, `node_modules/.bin/paperlint hook <name>`, an absolute path into
 *   the package's `bin/`
 *                          another spelling
 *   `vigiles … run-program <…>/node_modules/paperlint/hooks/<name>.hook.mjs`
 *                          another spelling
 */
function parseRun(command: string): Run | null {
  const tokens = command.trim().split(/\s+/).map(bare);
  for (let i = 0; i < tokens.length; i++) {
    const run = runAt(tokens, i);
    if (run) return run;
  }
  return null;
}

/** The path segments after `node_modules/paperlint/`. */
function insidePackage(parts: readonly string[]): readonly string[] {
  const at = parts.findIndex(
    (p, j) => p === "node_modules" && parts[j + 1] === PACKAGE_NAME,
  );
  return at === -1 ? [] : parts.slice(at + 2);
}

/** The run token `i` starts, if it names a paperlint hook. */
function runAt(tokens: readonly string[], i: number): Run | null {
  const t = posix.normalize(tokens[i] ?? "");
  const inside = insidePackage(t.split("/"));
  const inBin = inside[0] === "bin" && inside.length === 2;
  const name = tokens[i + 2];
  if (
    (inBin || basename(t) === PACKAGE_NAME) &&
    tokens[i + 1] === "hook" &&
    name
  )
    return { name, ours: t === MANAGED_BY, path: t };
  if (inside[0] === "hooks" && inside[1]?.endsWith(".hook.mjs"))
    return { name: basename(inside[1], ".hook.mjs"), ours: false, path: t };
  return null;
}

export function hookRun(command: string): {
  readonly name: string;
  readonly ours: boolean;
} | null {
  const run = parseRun(command);
  return run && { name: run.name, ours: run.ours };
}

/** Every command in a settings object, with the event it hangs off. */
export function commandsIn(
  settings: Settings,
): { readonly event: string; readonly command: string }[] {
  const hooks = settings["hooks"];
  if (!hooks || typeof hooks !== "object") return [];
  const out: { event: string; command: string }[] = [];
  for (const [event, entries] of Object.entries(hooks as HooksMap))
    for (const entry of Array.isArray(entries) ? entries : [])
      for (const h of Array.isArray(entry?.hooks) ? entry.hooks : [])
        if (typeof h?.command === "string")
          out.push({ event, command: h.command });
  return out;
}

export interface Wiring {
  readonly compiled: HooksMap;
  /** Derived from the commands, in order. Never empty — an empty set throws. */
  readonly names: readonly string[];
}

/**
 * The shipped wiring, and the hook names it runs. An unreadable file or zero names THROWS: a
 * check that silently wired nothing would report "✓ wired" over an empty set.
 */
export function shippedWiring(file: string = WIRING_FILE): Wiring {
  const json = JSON.parse(readFileSync(file, "utf8")) as { hooks?: HooksMap };
  const compiled = json.hooks ?? {};
  const names = commandsIn({ hooks: compiled })
    .map((c) => hookRun(c.command)?.name)
    .filter((n): n is string => typeof n === "string");
  if (names.length === 0)
    throw new Error(
      `${file} names no paperlint hook — there is nothing to wire`,
    );
  return { compiled, names: [...new Set(names)] };
}

/** How many commands run each shipped hook, split by spelling. */
export function wiredCounts(
  settings: Settings,
  names: readonly string[],
): Map<string, { ours: number; other: number }> {
  const counts = new Map(names.map((n) => [n, { ours: 0, other: 0 }]));
  for (const { command } of commandsIn(settings)) {
    const run = hookRun(command);
    const slot = run ? counts.get(run.name) : undefined;
    if (run && slot)
      if (run.ours) slot.ours++;
      else slot.other++;
  }
  return counts;
}

export type SettingsRead =
  | { readonly status: "absent"; readonly path: string; readonly settings: {} }
  | {
      readonly status: "read";
      readonly path: string;
      readonly settings: Settings;
      readonly raw: string;
    }
  | {
      readonly status: "unparsable";
      readonly path: string;
      readonly reason: string;
    };

export function readSettings(root: string): SettingsRead {
  const path = join(root, SETTINGS_PATH);
  if (!existsSync(path)) return { status: "absent", path, settings: {} };
  const raw = readFileSync(path, "utf8");
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { status: "unparsable", path, reason: "not a JSON object" };
    return { status: "read", path, settings: parsed as Settings, raw };
  } catch (e) {
    return { status: "unparsable", path, reason: (e as Error).message };
  }
}

export type WireResult =
  | {
      readonly status: "written" | "present";
      readonly path: string;
      readonly names: readonly string[];
    }
  | {
      readonly status: "foreign";
      readonly path: string;
      readonly names: readonly string[];
      /** The commands that already run a shipped hook under another spelling. */
      readonly found: readonly {
        readonly name: string;
        readonly command: string;
      }[];
      /** Shipped hooks that no command runs in ANY spelling — left unwired as well. */
      readonly missing: readonly string[];
    }
  | {
      readonly status: "unparsable";
      readonly path: string;
      readonly reason: string;
    };

/**
 * Merge the shipped hooks into `.claude/settings.json`. Idempotent: when the merge changes
 * nothing, the file is NOT rewritten, so a second run is byte-identical even when the user's own
 * formatting differs from ours.
 *
 * 🔴 ANOTHER SPELLING OF THE SAME HOOK STOPS THE WRITE. vigiles' merge owns only commands whose
 * path token is MANAGED_BY; a hook wired by hand through `vigiles … run-program …/hooks/x.hook.mjs`
 * is not recognised as ours, so a merge would ADD a second copy — and Claude Code dedupes only
 * identical handlers, so the guard would run twice. Writing nothing and saying so is the only
 * answer that cannot make it worse.
 */
export function wireHooks(
  root: string,
  merge: Merge,
  wiring: Wiring = shippedWiring(),
): WireResult {
  const read = readSettings(root);
  if (read.status === "unparsable") return read;
  const { path, settings } = read;
  const found = commandsIn(settings)
    .map(({ command }) => ({ command, run: hookRun(command) }))
    .filter(({ run }) => run && !run.ours && wiring.names.includes(run.name))
    .map(({ command, run }) => ({ name: run?.name ?? "", command }));
  if (found.length > 0) {
    const counts = wiredCounts(settings, wiring.names);
    const missing = wiring.names.filter(
      (n) => (counts.get(n)?.ours ?? 0) + (counts.get(n)?.other ?? 0) === 0,
    );
    return { status: "foreign", path, names: wiring.names, found, missing };
  }

  const next = merge(settings, wiring.compiled, MANAGED_BY);
  if (JSON.stringify(next) === JSON.stringify(read.settings))
    return { status: "present", path, names: wiring.names };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", "utf8");
  return { status: "written", path, names: wiring.names };
}

/** The consequence every report of a written hook must carry, in one place. */
export const FRESH_CLONE_NOTE = `the commands point into node_modules/${PACKAGE_NAME}/ — in a fresh clone they cannot run until \`npm install\` has run there`;

/**
 * `paperlint doctor`'s section. ADVISORY — it never fails the run: the hooks are an in-editor guard,
 * `--no-hooks` is a legitimate choice, and a doctor that exits non-zero on a choice gets muted.
 */
export function doctorHooks(
  root: string,
  wiring: Wiring = shippedWiring(),
): string[] {
  const out = [`hooks (Claude Code reads them from ${SETTINGS_PATH})`];
  const read = readSettings(root);
  if (read.status === "unparsable") {
    out.push(`  ⚠ ${SETTINGS_PATH} does not parse — ${read.reason}`);
    out.push(`      Claude Code cannot read it either; fix the JSON`);
    return out;
  }
  const counts = wiredCounts(read.settings, wiring.names);
  const total = (n: string): number =>
    (counts.get(n)?.ours ?? 0) + (counts.get(n)?.other ?? 0);
  const missing = wiring.names.filter((n) => total(n) === 0);
  const twice = wiring.names.filter((n) => total(n) > 1);
  // `init` refuses to write while any hook is wired under another spelling, so its remedy must
  // not be offered then — the remedy is to pick ONE form.
  const handWired = wiring.names.some((n) => (counts.get(n)?.other ?? 0) > 0);
  const remedy = handWired
    ? `some paperlint hooks are wired by hand under another spelling, and \`npx paperlint init\` writes nothing then — add the missing ones in that same form, or delete the hand-written ones and run \`npx paperlint init\``
    : `\`npx paperlint init\` adds them`;
  if (twice.length > 0) {
    out.push(`  ⚠ wired TWICE — each of these runs more than once per event:`);
    for (const n of twice) out.push(`      ${n} ×${String(total(n))}`);
    out.push(
      `      keep one command per hook; \`npx paperlint init\` writes the ${MANAGED_BY} form`,
    );
  }
  if (missing.length === wiring.names.length)
    out.push(
      `  ⚠ not wired — none of the ${String(wiring.names.length)} hooks is in ${SETTINGS_PATH}. ` +
        `\`npx paperlint init\` wires them`,
    );
  else if (missing.length > 0)
    out.push(
      `  ⚠ partly wired — missing: ${missing.join(", ")}`,
      `      ${remedy}`,
    );
  else if (twice.length === 0)
    out.push(
      `  ✓ wired — ${wiring.names.join(", ")}, once each`,
      `      ${FRESH_CLONE_NOTE}`,
    );
  return out;
}
