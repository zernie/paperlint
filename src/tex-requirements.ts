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
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
// eslint-disable-next-line boundaries/dependencies -- legacy layer, moves behind a port in #76
import Ajv from "ajv";
import { packageVenuesDir } from "../skills/paper-pipeline/scripts/consumer.mjs";

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

/** A venue profile, parsed: what TeX Live must hold to build the paper, and the format it must meet. */
export interface VenueProfile {
  readonly tex: TexRequirements;
  readonly format: VenueFormat;
}

/** The profile's JSON after the schema accepted it — the shape `venue-profile.schema.json` allows. */
interface ProfileJson {
  readonly tex: Partial<TexRequirements>;
  readonly page_w_in?: number;
  readonly page_h_in?: number;
  readonly columns?: number;
  readonly body_pt?: number;
  readonly body_pt_tol?: number;
  readonly ref_pt_min?: number;
  readonly ref_pt_max?: number;
  readonly fonts_text?: string;
  readonly fonts_title?: string;
  readonly kinds?: Readonly<
    Record<string, { body_pages_max?: number; ref_pages_max?: number }>
  >;
}

/** An optional profile field as the typed profile holds it: absent is null. */
const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

function formatOf(j: ProfileJson): VenueFormat {
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
    kinds: new Map(
      Object.entries(j.kinds ?? {}).map(([k, v]) => [
        k,
        {
          bodyPagesMax: orNull(v.body_pages_max),
          refPagesMax: orNull(v.ref_pages_max),
        },
      ]),
    ),
  };
}

/**
 * The text of one profile → the whole typed profile, or an Error naming every problem. The ONE
 * parser of a profile: the toolchain reads its `tex`, the venue rules its `format`.
 *
 * @param text  the file's contents
 * @param file  the name to put in messages
 * @param dir   the directory holding the schema (the shipped venues directory by default)
 */
export function parseVenueProfile(
  text: string,
  file: string,
  dir: string = packageVenuesDir(),
): VenueProfile {
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
  const j = config as ProfileJson;
  return {
    tex: { packages: j.tex.packages ?? {}, tools: j.tex.tools ?? {} },
    format: formatOf(j),
  };
}

/** The text of one profile → its typed TeX requirements, or an Error naming every problem. */
export function parseProfile(
  text: string,
  file: string,
  dir: string = packageVenuesDir(),
): TexRequirements {
  return parseVenueProfile(text, file, dir).tex;
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
 * What ONE paper needs: the base set plus its venue's block. A paper with no venue, or a venue this
 * package has no profile for, gets the base set — and the source says which, so an ACM paper built
 * without `venue.json` is visibly running on the base set rather than silently.
 */
export function requirementsFor(
  venue: string | null,
  dir: string = packageVenuesDir(),
): PaperRequirements {
  const base = readProfile(dir, BASE_PROFILE);
  if (venue === null)
    return { source: "the base set (no venue.json)", tex: base };
  const file = profileFileOf(venue);
  if (file === null || !existsSync(join(dir, file)))
    return {
      source: `the base set (venue ${venue} has no profile in paperlint)`,
      tex: base,
    };
  return {
    source: `venue ${venue}`,
    tex: mergeRequirements(base, readProfile(dir, file)),
  };
}

/** Everything any profile declares — the set `paperlint toolchain` installs, so one tree builds any paper. */
export function declaredUnion(dir: string = packageVenuesDir()): {
  readonly tex: TexRequirements;
  readonly profiles: number;
} {
  const venues = venueNames(dir);
  const tex = venues.reduce(
    (acc, v) => mergeRequirements(acc, readProfile(dir, `${v}${PROFILE_EXT}`)),
    readProfile(dir, BASE_PROFILE),
  );
  return { tex, profiles: venues.length + 1 };
}
