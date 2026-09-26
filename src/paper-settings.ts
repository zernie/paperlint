/**
 * `<paper>/paperlint.json` — ONE PAPER'S SETTINGS, parsed at the boundary, merged over the root's.
 *
 * One file name at two levels, one schema (lib/paper-config.mjs → SETTINGS_KEYS):
 *
 *   paperlint.json                 the project (optional): papersDir, rules, defaults
 *   <paper>/paperlint.json         this paper: { extends, kind, pdf, rules }
 *   a venue preset                 `paperlint:<name>` (shipped) or `./x.jsonc` (src/presets.ts)
 *
 * The paper's `extends`, `kind` and `pdf` win over the root's; with no own value, the root's is
 * the default. Every reader — the build, the facts writer, the venue rules, `paperlint lint` —
 * goes through `readPaperSettings`, so there is one answer to "what does this paper declare".
 *
 * 🔴 STRICT. An unknown key is an error naming the known ones: `"venu": "aisec"` would otherwise
 * read as "no preset", and every venue check would be silently off. A project-only key
 * (`papersDir`, …) in a paper's file is refused too: it would be read nowhere.
 */
import { dirname, join } from "node:path";
import {
  CONFIG_FILE,
  ROOT_ONLY_KEYS,
  SETTINGS_KEYS,
  findProjectRoot,
} from "../lib/paper-config.mjs";
import type { AbsolutePath } from "./domain/paths.ts";
import { err, ok, type Result } from "./domain/result.ts";
import type { Files } from "./ports/files.ts";
import {
  parseRuleEntries,
  type Parsed,
  type RuleEntry,
} from "./rules-config.ts";

/** What one paper declares. Every absent field is null. */
export interface PaperSettings {
  /** The venue preset the paper is judged against: `paperlint:<name>` or a relative path. */
  readonly extends: string | null;
  /** The kind of paper (`short`, `research`, …), whose page limit applies. */
  readonly kind: string | null;
  /** The built PDF relative to the paper, when it is not `paper.pdf`. */
  readonly pdf: string | null;
  /**
   * Rule overrides for this paper alone — `{ id: severity }` or ESLint blocks — NOT yet checked
   * against the shipped rules.
   */
  readonly rules: Readonly<Record<string, unknown>> | readonly unknown[] | null;
}

/** Why a paper's settings cannot be read. */
export type SettingsProblem = { readonly kind: "broken"; readonly why: string };

const KNOWN = Object.keys(SETTINGS_KEYS);
const STRING_FIELDS = ["extends", "kind", "pdf"] as const;

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A string field: absent is null, anything but a non-empty string is the error. */
function stringField(
  d: Readonly<Record<string, unknown>>,
  k: (typeof STRING_FIELDS)[number],
): Result<string | null, string> {
  const v = d[k];
  // `"extends": null` is what `paperlint new` writes: no venue chosen yet.
  if (v === undefined || (k === "extends" && v === null)) return ok(null);
  return typeof v === "string" && v !== ""
    ? ok(v)
    : err(`"${k}" must be a non-empty string, got ${JSON.stringify(v)}`);
}

/** `extends`, `kind` and `pdf`, each null when absent. The root file's defaults parse the same way. */
export function stringFields(
  d: Readonly<Record<string, unknown>>,
): Result<Pick<PaperSettings, (typeof STRING_FIELDS)[number]>, string> {
  const out: Record<string, string | null> = {};
  for (const k of STRING_FIELDS) {
    const f = stringField(d, k);
    if (!f.ok) return f;
    out[k] = f.value;
  }
  return ok({
    extends: out["extends"] ?? null,
    kind: out["kind"] ?? null,
    pdf: out["pdf"] ?? null,
  });
}

/** The parsed JSON of `paperlint.json` → the settings, or one line saying what is wrong. Pure. */
export function parsePaperSettings(
  json: unknown,
): Result<PaperSettings, string> {
  if (!isObject(json)) return err("must be a JSON object");
  const unknown = Object.keys(json).filter((k) => !KNOWN.includes(k));
  if (unknown.length > 0)
    return err(`unknown key "${unknown[0]}" — known keys: ${KNOWN.join(", ")}`);
  const project = Object.keys(json).filter((k) => ROOT_ONLY_KEYS.includes(k));
  if (project.length > 0)
    return err(
      `"${project[0]}" is a project setting — set it in the root ${CONFIG_FILE}, not in a paper's`,
    );
  const fields = stringFields(json);
  if (!fields.ok) return fields;
  const rules = json["rules"];
  if (rules !== undefined && !isObject(rules) && !Array.isArray(rules))
    return err(
      `"rules" must be an object of rule id → severity, or a list of ESLint blocks`,
    );
  return ok({
    ...fields.value,
    rules: rules ?? null,
  });
}

const at = (p: string): AbsolutePath => p as AbsolutePath;

/** A JSON file through `files`: undefined when absent, the problem when it does not parse. */
function readJson(
  files: Files,
  path: string,
): Result<unknown, SettingsProblem> {
  const bytes = files.readBytes(at(path));
  if (bytes === null) return ok(undefined);
  try {
    return ok(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (e) {
    return err({ kind: "broken", why: `not JSON (${(e as Error).message})` });
  }
}

/**
 * The root file's defaults for every paper — `extends`, `kind`, `pdf` — found by walking up from
 * the paper's parent. None when there is no root file, or it is not an object; a root file that
 * is wrong in another way is reported by `paperlint lint`, which parses it strictly.
 */
function rootDefaults(
  files: Files,
  paperDir: string,
): Result<Defaults | null, SettingsProblem> {
  const root = findProjectRoot(dirname(paperDir), (p) => files.isFile(at(p)));
  const json = readJson(files, join(root, CONFIG_FILE));
  if (!json.ok) return json;
  if (!isObject(json.value)) return ok(null);
  const fields = stringFields(json.value);
  return fields.ok
    ? fields
    : err({ kind: "broken", why: `the root ${CONFIG_FILE}: ${fields.error}` });
}

/**
 * A paper's settings, its own `paperlint.json` merged over the root's defaults: null when neither
 * says anything; the problem when a file does not parse. Reads through `files` only; never throws.
 */
export function readPaperSettings(
  files: Files,
  paperDir: string,
): Result<PaperSettings | null, SettingsProblem> {
  const own = readJson(files, join(paperDir, CONFIG_FILE));
  if (!own.ok) return own;
  const parsed =
    own.value === undefined ? ok(null) : parsePaperSettings(own.value);
  if (!parsed.ok) return err({ kind: "broken", why: parsed.error });
  const defaults = rootDefaults(files, paperDir);
  if (!defaults.ok) return defaults;
  return ok(merge(defaults.value, parsed.value));
}

type Defaults = Pick<PaperSettings, "extends" | "kind" | "pdf">;
const NO_DEFAULTS: Defaults = { extends: null, kind: null, pdf: null };

/** The paper's own values win; each absent one falls back to the root's. */
function merge(
  root: Defaults | null,
  paper: PaperSettings | null,
): PaperSettings | null {
  const r = root ?? NO_DEFAULTS;
  const p = paper ?? { ...NO_DEFAULTS, rules: null };
  const merged: PaperSettings = {
    extends: p.extends ?? r.extends,
    kind: p.kind ?? r.kind,
    pdf: p.pdf ?? r.pdf,
    rules: p.rules,
  };
  return paper === null && Object.values(merged).every((v) => v === null)
    ? null
    : merged;
}

// ── the paper's rule overrides ──────────────────────────────────────────────────────────

/**
 * `rules` → the parsed entries (rule id → severity or `[severity, options]`), or the error naming
 * the file. Null when the paper sets none. Blocks (the list form) are parsed by the caller, which
 * knows the file globs they are relative to (`paperRuleBlocks` in cli.ts).
 */
export function paperRules(
  paperDir: string,
  settings: PaperSettings,
  shipped: ReadonlySet<string>,
): Parsed<Record<string, RuleEntry> | null> {
  if (settings.rules === null || Array.isArray(settings.rules))
    return { ok: true, value: null };
  const where = `${join(paperDir, CONFIG_FILE)} → "rules"`;
  return parseRuleEntries(
    settings.rules as Readonly<Record<string, unknown>>,
    where,
    shipped,
  );
}
