/**
 * `<paper>/paperlint.json` — ONE PAPER'S SETTINGS, parsed at the boundary.
 *
 * The middle of three levels, each named after the tool (lib/paper-config.mjs):
 *
 *   package.json → "paperlint"     the project
 *   <paper>/paperlint.json         this paper: { extends, kind, pdf, rules }
 *   a venue preset                 `paperlint:<name>` (shipped) or `./x.jsonc` (src/presets.ts)
 *
 * Every reader — the build, the facts writer, the venue rules, `paperlint lint` — goes through
 * `readPaperSettings`, so there is one answer to "what does this paper declare".
 *
 * 🔴 STRICT. An unknown key is an error naming the known ones: `"venu": "aisec"` would otherwise
 * read as "no preset", and every venue check would be silently off.
 *
 * 🔴 THE OLD NAME IS NOT READ. Before 2.1.0 the file was `venue.json`. A fallback would keep it
 * working forever and leave two names for one file; instead a `venue.json` with no `paperlint.json`
 * is an error that names `npx paperlint init`, which moves it (`migrationOf` plans that move).
 */
import { join } from "node:path";
import {
  LEGACY_PAPER_SETTINGS_FILE,
  PAPER_SETTINGS_FILE,
  PAPER_SETTINGS_KEYS,
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
  /** Rule overrides for this paper alone, NOT yet checked against the shipped rules. */
  readonly rules: Readonly<Record<string, unknown>> | null;
}

/** Why a paper's settings cannot be read. */
export type SettingsProblem =
  | { readonly kind: "broken"; readonly why: string }
  | { readonly kind: "legacy" };

const KNOWN = Object.keys(PAPER_SETTINGS_KEYS);
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

/** `extends`, `kind` and `pdf`, each null when absent. */
function stringFields(
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
  const fields = stringFields(json);
  if (!fields.ok) return fields;
  const rules = json["rules"];
  if (rules !== undefined && !isObject(rules))
    return err(`"rules" must be an object of rule id → severity`);
  return ok({
    ...fields.value,
    rules: rules ?? null,
  });
}

const at = (p: string): AbsolutePath => p as AbsolutePath;

/**
 * A paper's settings: null when it has no `paperlint.json`; the problem when the file does not parse
 * or only the pre-2.1.0 `venue.json` is there. Reads through `files` only; never throws.
 */
export function readPaperSettings(
  files: Files,
  paperDir: string,
): Result<PaperSettings | null, SettingsProblem> {
  const bytes = files.readBytes(at(join(paperDir, PAPER_SETTINGS_FILE)));
  if (bytes === null)
    return files.readBytes(at(join(paperDir, LEGACY_PAPER_SETTINGS_FILE))) ===
      null
      ? ok(null)
      : err({ kind: "legacy" });
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    return err({ kind: "broken", why: `not JSON (${(e as Error).message})` });
  }
  const parsed = parsePaperSettings(json);
  return parsed.ok ? parsed : err({ kind: "broken", why: parsed.error });
}

// ── the move from venue.json ────────────────────────────────────────────────────────────

/** What `paperlint init` does with one paper's files. */
export type Migration =
  /** No `venue.json`: nothing to do. */
  | { readonly kind: "none" }
  /** Only `venue.json`: write `text` as `paperlint.json`, delete `venue.json`. */
  | { readonly kind: "move"; readonly text: string }
  /** Both, and `paperlint.json` already says the same: the old one is a leftover, delete it. */
  | { readonly kind: "drop-legacy" }
  /** Both, and they differ: refuse — there is no way to know which one the author means. */
  | { readonly kind: "conflict" }
  /** `venue.json` is not a JSON object: refuse, naming why. */
  | { readonly kind: "broken"; readonly why: string };

/**
 * A `venue.json` object → the `paperlint.json` object that says the same, in one move:
 * `"venue": "aisec"` becomes `"extends": "paperlint:aisec"` (the only presets that existed were the
 * shipped ones), and the `"_"` some files used as a comment becomes `"$comment"`. Every other key
 * is carried as it is — an unknown one is then refused by name, as in any `paperlint.json`. Pure.
 */
export function fromLegacy(
  legacy: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(legacy)) {
    if (k === "venue" && typeof v === "string")
      out["extends"] = `paperlint:${v}`;
    else if (k === "_") out["$comment"] = v;
    else out[k] = v;
  }
  return out;
}

const jsonOf = (b: Uint8Array): unknown => {
  try {
    return JSON.parse(new TextDecoder().decode(b));
  } catch {
    return undefined;
  }
};

/** The move, planned from the two files' bytes (null = absent). Pure. */
export function migrationOf(
  legacy: Uint8Array | null,
  current: Uint8Array | null,
): Migration {
  if (legacy === null) return { kind: "none" };
  const old = jsonOf(legacy);
  if (!isObject(old)) return { kind: "broken", why: "it is not a JSON object" };
  const next = fromLegacy(old);
  if (current === null)
    return { kind: "move", text: `${JSON.stringify(next, null, 2)}\n` };
  return JSON.stringify(jsonOf(current)) === JSON.stringify(next)
    ? { kind: "drop-legacy" }
    : { kind: "conflict" };
}

// ── the paper's rule overrides ──────────────────────────────────────────────────────────

/**
 * `rules` → the parsed entries (rule id → severity or `[severity, options]`), or the error naming
 * the file. Null when the paper sets none. The block they go into is built where the config is
 * (`paperRuleBlocks` in cli.ts), which also knows which files a paper's rules may reach.
 */
export function paperRules(
  paperDir: string,
  settings: PaperSettings,
  shipped: ReadonlySet<string>,
): Parsed<Record<string, RuleEntry> | null> {
  if (settings.rules === null) return { ok: true, value: null };
  const where = `${join(paperDir, PAPER_SETTINGS_FILE)} → "rules"`;
  return parseRuleEntries(settings.rules, where, shipped);
}
