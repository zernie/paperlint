/**
 * WHICH TeX LIVE PACKAGES A PAPER NEEDS — read from the venue profiles, not written in an installer.
 *
 * 🔴 WHY THE LIST MOVED OUT OF THE INSTALLER (issue #26). Which packages a paper needs is a property
 * of its venue's TEMPLATE, not of the machine. While the list lived in `ensure-toolchain.sh` it was
 * one flat set for every paper, edited whenever a build broke, and kept in THREE dictionaries (apt
 * names, CTAN names, the file contract) that drifted apart twice. Now each venue profile carries a
 * `tex` block — CTAN package → the files that prove it is present — and `tex-base.jsonc` carries
 * what every paper gets. `paperlint toolchain` installs the union; `paperlint build` checks the paper's share.
 *
 * ── THE DATA IS PARSED AT THE BOUNDARY ───────────────────────────────────────────
 * A profile is JSONC (every number in it carries a quote from the venue's instructions), parsed
 * by TypeScript's own JSONC reader — the parser the harnesses already read these files with — and
 * validated against `venue-profile.schema.json` by ajv, the JSON Schema validator ESLint itself
 * validates rule options with. After `parseProfile` returns, the rest of paperlint holds a typed
 * `TexRequirements` and never looks at the text again; a malformed profile throws with the path
 * of every violation, it is never read as "no packages".
 *
 * Where the profiles live is answered by `packageVenuesDir()` in consumer.mjs — the one module
 * allowed to know where this package is installed (rule 10).
 */
// eslint-disable-next-line boundaries/dependencies -- legacy I/O, moves behind a port in #76
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
// eslint-disable-next-line boundaries/dependencies -- legacy layer, moves behind a port in #76
import Ajv from "ajv";
import { packageVenuesDir } from "../skills/paper-pipeline/scripts/consumer.mjs";
import { CONFIG_FILE } from "../lib/paper-config.mjs";

/** CTAN package name → the names that prove it is installed. */
export type PackageProofs = Readonly<Record<string, readonly string[]>>;

export interface TexRequirements {
  /** Proved by `kpsewhich <file>` — files LaTeX loads. */
  readonly packages: PackageProofs;
  /** Proved by an executable in TeX Live's bin directory — programs, not files. */
  readonly tools: PackageProofs;
}

/** The requirements for one paper, and where they came from — printed, never guessed silently. */
export interface PaperRequirements {
  readonly source: string;
  readonly tex: TexRequirements;
}

/** The profile every paper gets, and the only one a paper with an unknown venue gets. */
export const BASE_PROFILE = "tex-base.jsonc";
export const SCHEMA_FILE = "venue-profile.schema.json";
const PROFILE_EXT = ".jsonc";

export const NO_REQUIREMENTS: TexRequirements = { packages: {}, tools: {} };

type Ts = typeof import("typescript");
let ts: Ts | null = null;
/** TypeScript is loaded only when a profile is read: `paperlint lint` never pays for it. */
function typescript(): Ts {
  ts ??= createRequire(import.meta.url)("typescript") as Ts;
  return ts;
}

type Validate = ReturnType<Ajv.Ajv["compile"]>;
const validators = new Map<string, Validate>();
function validatorFor(dir: string): Validate {
  const known = validators.get(dir);
  if (known) return known;
  const schema: object = JSON.parse(
    readFileSync(join(dir, SCHEMA_FILE), "utf8"),
  );
  const v = new Ajv({ allErrors: true }).compile(schema);
  validators.set(dir, v);
  return v;
}

/** Every violation as `<file>: <path> <message>` — one line each, so all of them are fixed at once. */
function violations(file: string, v: Validate): string[] {
  return (v.errors ?? []).map(
    (e) => `${file}: ${e.dataPath || "(top level)"} ${e.message ?? ""}`,
  );
}

/** One kind of paper a venue takes (`short`, `research`, …) and its page limits; null = not limited. */
export interface KindLimits {
  readonly bodyPagesMax: number | null;
  readonly refPagesMax: number | null;
}

/**
 * The format a venue's call for papers sets — what the `pdf/*` venue rules judge a built PDF
 * against. Every field the profile leaves out is null, and a rule that finds null checks nothing:
 * a profile that does not name a number never makes one up.
 */
export interface VenueFormat {
  readonly pageWidthIn: number | null;
  readonly pageHeightIn: number | null;
  readonly columns: number | null;
  readonly bodyPt: number | null;
  readonly bodyPtTol: number | null;
  readonly refPtMin: number | null;
  readonly refPtMax: number | null;
  /** The prefix a font name of the body text starts with (`LinLibertine`). */
  readonly fontsText: string | null;
  readonly fontsTitle: string | null;
  readonly kinds: ReadonlyMap<string, KindLimits>;
}

/** Every format field a preset left out is null; a merge fills it from the parent. */
export const NO_FORMAT: VenueFormat = {
  pageWidthIn: null,
  pageHeightIn: null,
  columns: null,
  bodyPt: null,
  bodyPtTol: null,
  refPtMin: null,
  refPtMax: null,
  fontsText: null,
  fontsTitle: null,
  kinds: new Map(),
};

/**
 * One preset FILE, parsed — before its `extends` chain is resolved (`src/presets.ts` does that).
 * A preset is a venue or a template family: `{ extends?, name?, template?, format?, tex?, rules? }`.
 */
export interface PresetFile {
  /** The preset this one builds on: `paperlint:<name>` or a relative path. */
  readonly extends: string | null;
  /** A display name for messages; the file name otherwise. */
  readonly name: string | null;
  readonly template: string | null;
  /** Null when the file declares no `tex` block (allowed only with `extends`). */
  readonly tex: TexRequirements | null;
  readonly format: VenueFormat;
  /** rule id → ESLint entry, checked against the shipped rules where a config is built. */
  readonly rules: Readonly<Record<string, unknown>>;
}

type KindsJson = Readonly<
  Record<string, { body_pages_max?: number; ref_pages_max?: number }>
>;

/** A preset's `format` block after the schema accepted it. */
interface FormatJson {
  readonly page_w_in?: number;
  readonly page_h_in?: number;
  readonly columns?: number;
  readonly body_pt?: number;
  readonly body_pt_tol?: number;
  readonly ref_pt_min?: number;
  readonly ref_pt_max?: number;
  readonly fonts_text?: string;
  readonly fonts_title?: string;
  readonly kinds?: KindsJson;
}

/** The preset's JSON after the schema accepted it — the shape `venue-profile.schema.json` allows. */
interface PresetJson {
  readonly extends?: string;
  readonly name?: string;
  readonly template?: string;
  readonly tex?: Partial<TexRequirements>;
  readonly format?: FormatJson;
  readonly rules?: Readonly<Record<string, unknown>>;
}

/** An optional field as the typed preset holds it: absent is null. */
const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

function kindsOf(k: KindsJson | undefined): ReadonlyMap<string, KindLimits> {
  return new Map(
    Object.entries(k ?? {}).map(([name, v]) => [
      name,
      {
        bodyPagesMax: orNull(v.body_pages_max),
        refPagesMax: orNull(v.ref_pages_max),
      },
    ]),
  );
}

function formatOf(j: FormatJson = {}): VenueFormat {
  return {
    pageWidthIn: orNull(j.page_w_in),
    pageHeightIn: orNull(j.page_h_in),
    columns: orNull(j.columns),
    bodyPt: orNull(j.body_pt),
    bodyPtTol: orNull(j.body_pt_tol),
    refPtMin: orNull(j.ref_pt_min),
    refPtMax: orNull(j.ref_pt_max),
    fontsText: orNull(j.fonts_text),
    fontsTitle: orNull(j.fonts_title),
    kinds: kindsOf(j.kinds),
  };
}

/**
 * The text of one preset file → the typed file, or an Error naming every problem. The ONE parser
 * of a preset: the toolchain reads its `tex`, the venue rules its `format`, the config its `rules`.
 *
 * @param text  the file's contents
 * @param file  the name to put in messages
 * @param dir   the directory holding the schema (the shipped venues directory by default)
 */
export function parsePreset(
  text: string,
  file: string,
  dir: string = packageVenuesDir(),
): PresetFile {
  const { config, error } = typescript().parseConfigFileTextToJson(file, text);
  if (error)
    throw new Error(
      `${file}: not valid JSONC — ${typescript().flattenDiagnosticMessageText(error.messageText, " ")}`,
    );
  const validate = validatorFor(dir);
  if (!validate(config))
    throw new Error(
      `${file} does not match ${SCHEMA_FILE}:\n  ${violations(file, validate).join("\n  ")}`,
    );
  const j = config as PresetJson;
  return {
    extends: orNull(j.extends),
    name: orNull(j.name),
    template: orNull(j.template),
    tex: j.tex
      ? { packages: j.tex.packages ?? {}, tools: j.tex.tools ?? {} }
      : null,
    format: formatOf(j.format),
    rules: j.rules ?? {},
  };
}

/** The text of one preset → the TeX requirements it declares itself (none without a `tex` block). */
export function parseProfile(
  text: string,
  file: string,
  dir: string = packageVenuesDir(),
): TexRequirements {
  return parsePreset(text, file, dir).tex ?? NO_REQUIREMENTS;
}

/**
 * The file a venue's profile lives in, or null when the name cannot be a venue (the base set is a
 * profile file but not a venue). Whether the file exists is the caller's question.
 */
export function profileFileOf(venue: string): string | null {
  return venue === BASE_PROFILE.slice(0, -PROFILE_EXT.length) ||
    venue.includes("/") ||
    venue.includes("\\")
    ? null
    : `${venue}${PROFILE_EXT}`;
}

function readProfile(dir: string, file: string): TexRequirements {
  return parseProfile(readFileSync(join(dir, file), "utf8"), file, dir);
}

/** The venues that have a profile — every `.jsonc` in the directory except the base set. */
export function venueNames(dir: string = packageVenuesDir()): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(PROFILE_EXT) && f !== BASE_PROFILE)
    .map((f) => f.slice(0, -PROFILE_EXT.length))
    .sort();
}

/** The union of two sets of requirements; a package declared by both keeps every proof of both. */
export function mergeRequirements(
  a: TexRequirements,
  b: TexRequirements,
): TexRequirements {
  const union = (x: PackageProofs, y: PackageProofs): PackageProofs => {
    const out: Record<string, readonly string[]> = { ...x };
    for (const [name, proofs] of Object.entries(y))
      out[name] = [...new Set([...(out[name] ?? []), ...proofs])];
    return out;
  };
  return {
    packages: union(a.packages, b.packages),
    tools: union(a.tools, b.tools),
  };
}

/** Every package name, packages and tools together, sorted — what tlmgr is asked for. */
export function packageNames(tex: TexRequirements): string[] {
  return [
    ...new Set([...Object.keys(tex.packages), ...Object.keys(tex.tools)]),
  ].sort();
}

/**
 * What ONE paper needs: the base set plus its venue preset's `tex` (the union over the preset's
 * `extends` chain, resolved by `src/presets.ts`). A paper with no preset gets the base set, and the
 * source says so, so an ACM paper built without a preset is visibly running on the base set.
 */
export function requirementsFor(
  preset: { readonly label: string; readonly tex: TexRequirements } | null,
  dir: string = packageVenuesDir(),
): PaperRequirements {
  const base = readProfile(dir, BASE_PROFILE);
  return preset === null
    ? {
        source: `the base set (no venue preset in ${CONFIG_FILE})`,
        tex: base,
      }
    : {
        source: `venue ${preset.label}`,
        tex: mergeRequirements(base, preset.tex),
      };
}

/**
 * Everything any shipped preset declares, plus `extra` — the resolved presets of the project's own
 * papers, which may live outside the package. The set `paperlint toolchain` installs, so one tree
 * builds any paper.
 */
export function declaredUnion(
  dir: string = packageVenuesDir(),
  extra: readonly TexRequirements[] = [],
): {
  readonly tex: TexRequirements;
  readonly profiles: number;
} {
  const venues = venueNames(dir);
  const shipped = venues.reduce(
    (acc, v) => mergeRequirements(acc, readProfile(dir, `${v}${PROFILE_EXT}`)),
    readProfile(dir, BASE_PROFILE),
  );
  return {
    tex: extra.reduce(mergeRequirements, shipped),
    profiles: venues.length + 1,
  };
}
