/**
 * `<paper>/paperlint.json` — ONE PAPER'S SETTINGS, parsed at the boundary, merged over the root's.
 *
 * One file name at two levels, one schema (lib/paper-config.mjs → SETTINGS_KEYS):
 *
 *   paperlint.json                 the project (optional): papersDir, rules, defaults
 *   <paper>/paperlint.json         this paper: { extends, kind, pdf, rules, identity, talk, submission } —
 *                                  or `cycles`, from whose current attempt extends, kind and submission
 *                                  are DERIVED (src/domain/cycle.ts); the two forms do not mix
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
} from "#lib/paper-config";
import { callerPath } from "./caller-path.ts";
import { err, ok, type Result } from "./domain/result.ts";
import type { Files } from "./ports/files.ts";
import {
  parseRuleEntries,
  type Parsed,
  type RuleEntry,
} from "./rules-config.ts";
import { messageOf } from "./domain/text.ts";
import { parsePaperTalk, type PaperTalk } from "./domain/talk.ts";
import {
  parsePaperSubmission,
  type PaperSubmission,
} from "./domain/submission.ts";
import {
  cycleProblemText,
  cyclesOf,
  parseCycles,
  venueCycleOf,
  type Cycles,
} from "./domain/cycle.ts";

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
  /**
   * What identifies the authors — `anonymity/identity` requires a blind venue's PDF to say none of it.
   * The root's list and the paper's own, joined: a paper adds its co-authors to the project's author
   * and cannot drop them by accident. Null when neither declares one.
   */
  readonly identity: readonly string[] | null;
  /** How this paper is presented (`talk/*`); null when it declares no talk. Never the root's. */
  readonly talk: PaperTalk | null;
  /** Which submission on the venue's portal is this paper's; null when it says none. Never the root's. */
  readonly submission: PaperSubmission | null;
  /**
   * The paper's attempts at venues and the current one, when the file declares `cycles`; null for a
   * file in the flat form. With cycles, `extends`, `kind` and `submission` above are the current
   * attempt's — derived, never written beside it. Never the root's.
   */
  readonly cycles: Cycles | null;
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

/**
 * `identity`: absent is null; otherwise a list of strings, each with a letter or digit in it — a
 * blank entry would match nothing and read as a declared, clean identity.
 */
export function identityField(
  d: Readonly<Record<string, unknown>>,
): Result<readonly string[] | null, string> {
  const v = d["identity"];
  if (v === undefined) return ok(null);
  return Array.isArray(v) &&
    v.every((x) => typeof x === "string" && /[\p{L}\p{N}]/u.test(x))
    ? ok(v.filter((x): x is string => typeof x === "string"))
    : err(
        `"identity" must be a list of strings, each with a letter or digit, got ${JSON.stringify(v)}`,
      );
}

/** `rules` (checked for shape only), `talk` and `submission`, each null when absent. */
function rulesAndTalk(
  json: Readonly<Record<string, unknown>>,
): Result<Pick<PaperSettings, "rules" | "talk" | "submission">, string> {
  const rules = json["rules"];
  if (rules !== undefined && !isObject(rules) && !Array.isArray(rules))
    return err(
      `"rules" must be an object of rule id → severity, or a list of ESLint blocks`,
    );
  const talk = parsePaperTalk(json["talk"]);
  if (!talk.ok) return talk;
  const submission = parsePaperSubmission(json["submission"]);
  return submission.ok
    ? ok({
        rules: rules ?? null,
        talk: talk.value,
        submission: submission.value,
      })
    : submission;
}

/** The keys the current cycle supplies: writing one beside `cycles` is a second source for it. */
const DERIVED_FROM_CYCLE = ["extends", "kind", "submission"] as const;

/**
 * `cycles`, parsed with its current attempt, or null when the file is in the flat form. A file that
 * has both `cycles` and a derived key is refused: two sources for one fact drift apart.
 */
function cyclesField(
  json: Readonly<Record<string, unknown>>,
): Result<Cycles | null, string> {
  const list = parseCycles(json["cycles"]);
  if (!list.ok) return list;
  if (list.value === null) return ok(null);
  const beside = DERIVED_FROM_CYCLE.filter((k) => k in json);
  if (beside.length > 0)
    return err(
      `"${beside.join('", "')}" beside "cycles": with cycles, ${beside.length === 1 ? "it is" : "they are"} the current attempt's and cannot be set here — move the value into the open cycle`,
    );
  const cycles = cyclesOf(list.value);
  return cycles.ok ? cycles : err(cycleProblemText(cycles.error));
}

/**
 * The current attempt's venue, kind and submission, as the flat keys every reader takes. An accepted
 * attempt keeps them: the camera-ready and the talk are judged against the venue that accepted.
 */
function derived(
  cycles: Cycles,
): Pick<PaperSettings, (typeof DERIVED_FROM_CYCLE)[number]> {
  const c = venueCycleOf(cycles.current);
  if (c === null) return { extends: null, kind: null, submission: null };
  return {
    extends: c.venue.kind === "preset" ? c.venue.extends : null,
    kind: c.kind,
    submission: c.submission,
  };
}

/** The keys that may not be in a paper's file: unknown ones, and the project's. */
function refusedKeys(
  json: Readonly<Record<string, unknown>>,
): Result<Readonly<Record<string, unknown>>, string> {
  const unknown = Object.keys(json).filter((k) => !KNOWN.includes(k));
  if (unknown.length > 0)
    return err(
      `unknown key "${String(unknown[0])}" — known keys: ${KNOWN.join(", ")}`,
    );
  const project = Object.keys(json).filter((k) => ROOT_ONLY_KEYS.includes(k));
  return project.length > 0
    ? err(
        `"${String(project[0])}" is a project setting — set it in the root ${CONFIG_FILE}, not in a paper's`,
      )
    : ok(json);
}

/** The parsed JSON of `paperlint.json` → the settings, or one line saying what is wrong. Pure. */
export function parsePaperSettings(
  json: unknown,
): Result<PaperSettings, string> {
  if (!isObject(json)) return err("must be a JSON object");
  const keys = refusedKeys(json);
  if (!keys.ok) return keys;
  const fields = stringFields(json);
  if (!fields.ok) return fields;
  const identity = identityField(json);
  if (!identity.ok) return identity;
  const rest = rulesAndTalk(json);
  if (!rest.ok) return rest;
  const cycles = cyclesField(json);
  if (!cycles.ok) return cycles;
  const flat = {
    ...fields.value,
    ...rest.value,
    identity: identity.value,
    cycles: cycles.value,
  };
  return ok(
    cycles.value === null ? flat : { ...flat, ...derived(cycles.value) },
  );
}

/** A JSON file through `files`: undefined when absent, the problem when it does not parse. */
function readJson(
  files: Files,
  path: string,
): Result<unknown, SettingsProblem> {
  const bytes = files.readBytes(callerPath(path));
  if (bytes === null) return ok(undefined);
  try {
    return ok(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (e) {
    return err({ kind: "broken", why: `not JSON (${messageOf(e)})` });
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
  const root = findProjectRoot(dirname(paperDir), (p) =>
    files.isFile(callerPath(p)),
  );
  const json = readJson(files, join(root, CONFIG_FILE));
  if (!json.ok) return json;
  if (!isObject(json.value)) return ok(null);
  const fields = stringFields(json.value);
  const identity = identityField(json.value);
  if (!fields.ok)
    return err({
      kind: "broken",
      why: `the root ${CONFIG_FILE}: ${fields.error}`,
    });
  return identity.ok
    ? ok({ ...fields.value, identity: identity.value })
    : err({
        kind: "broken",
        why: `the root ${CONFIG_FILE}: ${identity.error}`,
      });
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

type Defaults = Pick<PaperSettings, "extends" | "kind" | "pdf" | "identity">;
const NO_DEFAULTS: Defaults = {
  extends: null,
  kind: null,
  pdf: null,
  identity: null,
};

/** Both lists, joined without repeats; null when neither side has one. */
const joined = (
  a: readonly string[] | null,
  b: readonly string[] | null,
): readonly string[] | null =>
  a === null && b === null ? null : [...new Set([...(a ?? []), ...(b ?? [])])];

/** The paper's own values win; each absent one falls back to the root's. */
function merge(
  root: Defaults | null,
  paper: PaperSettings | null,
): PaperSettings | null {
  const r = root ?? NO_DEFAULTS;
  const p = paper ?? {
    ...NO_DEFAULTS,
    rules: null,
    talk: null,
    submission: null,
    cycles: null,
  };
  const merged: PaperSettings = {
    extends: p.extends ?? r.extends,
    kind: p.kind ?? r.kind,
    pdf: p.pdf ?? r.pdf,
    rules: p.rules,
    identity: joined(r.identity, p.identity),
    talk: p.talk,
    submission: p.submission,
    cycles: p.cycles,
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
  return parseRuleEntries(settings.rules, where, shipped);
}
