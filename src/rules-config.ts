/**
 * THE CONSUMER'S SETTINGS, PARSED AT THE BOUNDARY — unknown keys refused, and the `rules` key
 * turned into ESLint config blocks.
 *
 * ── THE `rules` KEY: ESLint'S OWN SHAPE, NOT A NEW ONE ──────────────────────────
 * A consumer turns an optional rule on, or changes a built-in rule's severity, by writing what they
 * would write in an ESLint flat config — a list of `{ files, ignores, rules }` blocks:
 *
 *   "rules": [ { "files": ["papers/rule-drift/**"],
 *                "rules": { "pdf/last-page-balance": ["error", { "tolerancePt": 120 }] } } ]
 *
 * The blocks are appended AFTER paperlint's built-in config, so a later block wins, exactly as in ESLint.
 * `files` and `ignores` are resolved relative to the directory of the file that holds the settings,
 * as ESLint resolves them relative to its config file: each block gets that directory as ESLint's
 * own `basePath`, so paperlint matches nothing itself.
 *
 * ── WHY PARSED HERE, AND WHY STRICT ─────────────────────────────────────────────
 * ESLint would reject a bad severity or an unknown rule too — but as a stack trace from inside
 * `lintFiles`, naming neither the settings file nor the block. And a key paperlint does not read, at the
 * top level or in a block, ESLint never sees at all: a typo would silently read as "not set". So
 * every problem is one line naming the key path, before ESLint starts, and nothing downstream sees
 * the raw object again.
 *
 * Only rules paperlint ships may be named: the settings configure paperlint, and a rule from another plugin
 * would need that plugin, which JSON cannot carry. Which rules paperlint ships is read off its own
 * config (`buildConfig`), not listed a second time.
 */
import { SETTINGS_KEYS } from "#lib/paper-config";

/** ESLint's severities, in both of its spellings. */
export type Severity = "off" | "warn" | "error" | 0 | 1 | 2;
export type RuleEntry = Severity | readonly [Severity, ...unknown[]];

/** One block of the `rules` key, parsed. `basePath` is the settings file's directory. */
export interface RuleBlock {
  readonly basePath: string;
  readonly files?: readonly string[];
  readonly ignores?: readonly string[];
  readonly rules: Readonly<Record<string, RuleEntry>>;
}

/**
 * A plugin as a config block registers it, typed to what paperlint reads of it: its rules, and the
 * languages it brings (`tex` brings LaTeX).
 */
export interface ConfigPlugin {
  readonly rules?: Readonly<Record<string, unknown>>;
  readonly languages?: Readonly<Record<string, unknown>>;
}

/**
 * An ESLint config block as paperlint builds and reads one. Not `Linter.Config`: ESLint types a
 * plugin's rule as one that runs on ANY language, and paperlint's rules are written for the language
 * they read (LaTeX, markdown), so none of them is assignable to it. ESLint checks a block when it
 * loads it; `eslintConfig` in cli.ts is the one place these blocks become `Linter.Config`.
 */
export interface ConfigBlock {
  readonly name?: string;
  readonly basePath?: string;
  readonly files?: readonly (string | readonly string[])[];
  readonly ignores?: readonly string[];
  readonly plugins?: Readonly<Record<string, ConfigPlugin>>;
  readonly language?: string;
  readonly languageOptions?: Readonly<Record<string, unknown>>;
  readonly linterOptions?: Readonly<Record<string, unknown>>;
  readonly rules?: Readonly<Record<string, unknown>>;
  readonly settings?: Readonly<Record<string, unknown>>;
}

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

const SEVERITIES: readonly Severity[] = ["off", "warn", "error", 0, 1, 2];
const isSeverity = (v: unknown): v is Severity =>
  SEVERITIES.some((s) => s === v);

const BLOCK_KEYS = new Set(["files", "ignores", "rules"]);

const bad = <T>(error: string): Parsed<T> => ({ ok: false, error });

/** Every top-level key must be one paperlint or its skills read. */
export function unknownKeys(settings: Record<string, unknown>): string[] {
  return Object.keys(settings).filter((k) => !Object.hasOwn(SETTINGS_KEYS, k));
}

const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((x) => typeof x === "string" && x !== "");

/** A severity, or `[severity, ...options]`. */
function parseEntry(v: unknown): RuleEntry | null {
  const entry: readonly unknown[] = Array.isArray(v) ? v : [v];
  const [sev, ...options] = entry;
  if (!isSeverity(sev)) return null;
  return Array.isArray(v) ? [sev, ...options] : sev;
}

/**
 * A `rules` object — rule id → severity or `[severity, ...options]` — with only the rules paperlint
 * ships. Read from every `paperlint.json`, the root's and each paper's.
 *
 * @param where  the key path to name in messages, e.g. `package.json → "paperlint".rules[0].rules`
 */
export function parseRuleEntries(
  v: unknown,
  where: string,
  shipped: ReadonlySet<string>,
): Parsed<Record<string, RuleEntry>> {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    return bad(`${where} must be an object of rule id → severity`);
  const out: Record<string, RuleEntry> = {};
  for (const [id, raw] of Object.entries(v)) {
    if (!shipped.has(id))
      return bad(
        `${where}: "${id}" is not a rule paperlint ships — known: ${[...shipped].sort().join(", ")}`,
      );
    const entry = parseEntry(raw);
    if (entry === null)
      return bad(
        `${where}["${id}"]: ${JSON.stringify(raw)} is not a severity — use "off", "warn" or "error", or ["error", { options }]`,
      );
    out[id] = entry;
  }
  return { ok: true, value: out };
}

/** `files` and `ignores`, each absent or a non-empty list of globs; the first bad one, or null. */
function badGlobs(o: Record<string, unknown>, at: string): string | null {
  for (const k of ["files", "ignores"] as const)
    if (o[k] !== undefined && !isStringList(o[k]))
      return `${at}.${k} must be a non-empty list of glob strings`;
  return null;
}

/** The block's `files`/`ignores`, present only when given. */
const globsOf = (o: Record<string, unknown>) => ({
  ...(isStringList(o["files"]) ? { files: o["files"] } : {}),
  ...(isStringList(o["ignores"]) ? { ignores: o["ignores"] } : {}),
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** One element of the `rules` list. */
function parseBlock(
  v: unknown,
  at: string,
  ctx: { shipped: ReadonlySet<string>; baseDir: string },
): Parsed<RuleBlock> {
  if (!isRecord(v))
    return bad(
      `${at} must be an object like { "files": [...], "rules": {...} }`,
    );
  const o = v;
  const extra = Object.keys(o).filter((k) => !BLOCK_KEYS.has(k));
  if (extra.length)
    return bad(
      `${at}: unknown key "${String(extra[0])}" — a block takes "files", "ignores" and "rules"`,
    );
  const globs = badGlobs(o, at);
  if (globs) return bad(globs);
  const rules = parseRuleEntries(o["rules"], `${at}.rules`, ctx.shipped);
  if (!rules.ok) return rules;
  return {
    ok: true,
    value: { basePath: ctx.baseDir, ...globsOf(o), rules: rules.value },
  };
}

/**
 * The `rules` key → config blocks, or one error naming the key path. Two shapes, at every level:
 * `{ id: severity }` is one block over every paper file under `baseDir`; a list is ESLint blocks
 * (`files`, `ignores`, `rules`), their globs relative to `baseDir`.
 *
 * @param raw      the value under `rules` (undefined when absent)
 * @param where    how the settings are named in messages, e.g. `paperlint.json`
 * @param shipped  the rule ids paperlint ships (`shippedRuleIds`)
 * @param baseDir  the directory of the file holding the settings
 */
export function parseRuleBlocks(
  raw: unknown,
  where: string,
  shipped: ReadonlySet<string>,
  baseDir: string,
): Parsed<readonly RuleBlock[]> {
  if (raw === undefined) return { ok: true, value: [] };
  if (isRecord(raw)) {
    const rules = parseRuleEntries(raw, `${where} → "rules"`, shipped);
    return rules.ok
      ? { ok: true, value: [{ basePath: baseDir, rules: rules.value }] }
      : rules;
  }
  if (!Array.isArray(raw))
    return bad(
      `${where} → "rules" must be { "<rule>": "<severity>" }, or a list of blocks like ESLint's flat config: [{ "files": [...], "rules": {...} }]`,
    );
  const out: RuleBlock[] = [];
  for (const [i, v] of raw.entries()) {
    const b = parseBlock(v, `${where} → rules[${String(i)}]`, {
      shipped,
      baseDir,
    });
    if (!b.ok) return b;
    out.push(b.value);
  }
  return { ok: true, value: out };
}

/**
 * The rule ids a config defines through its own plugins, as `<plugin>/<rule>`. Plugins passed in
 * `foreign` (a dependency's plugin, such as `@eslint/markdown`) are not paperlint's and are skipped.
 */
export function shippedRuleIds(
  config: readonly ConfigBlock[],
  foreign: readonly unknown[],
): Set<string> {
  const ids = new Set<string>();
  for (const block of config) {
    for (const [name, plugin] of Object.entries(block.plugins ?? {})) {
      if (foreign.includes(plugin)) continue;
      for (const rule of Object.keys(plugin.rules ?? {}))
        ids.add(`${name}/${rule}`);
    }
  }
  return ids;
}
