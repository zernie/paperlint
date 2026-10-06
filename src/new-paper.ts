/**
 * `paperlint new <name>` — a paper folder the linter accepts, made from a template FILE.
 *
 * 🔴 WHY THIS EXISTS. `paperlint lint` requires `PIPELINE-STATUS.md` in every paper folder, and until
 * this command nothing made one: the template sat inside a fenced block of a reference page and a
 * human copied it. The README's own "First run" example opened with the error for the missing file.
 *
 * Every rule below is taken from a tool that already solved it (docs/prior-art/paper-folder-scaffolding.md):
 *   - the template is a FILE with a lookup order — the project's `<papers>/.template/<file>` first,
 *     the package's `templates/paper/<file>` second (Hugo's archetypes);
 *   - it NEVER overwrites: on an existing folder it adds only the missing required files (`cargo init`);
 *   - the name is validated, because it becomes a path and, through the hooks, a shell argument.
 *
 * The only substitution is `{{name}}` → the folder name. Nothing else in a template is touched.
 */
/* eslint-disable boundaries/dependencies -- legacy I/O, moves behind a port in #76 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
/* eslint-enable boundaries/dependencies */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE } from "#lib/paper-config";
import { isRecord } from "./domain/record.ts";
import {
  venuesNamedBy,
  withoutVenues,
  type NamedVenue,
} from "./domain/venue-name.ts";

/** The package's default templates. Read from disk, so they ship in the tarball (`files`). */
export const PACKAGE_TEMPLATES = fileURLToPath(
  new URL("../templates/paper/", import.meta.url),
);

/**
 * The project's override directory, inside the papers directory. It starts with a dot, and that
 * is what keeps it from being a paper: discovery (`papersIn`, `checkStructure`, `detectPapers`)
 * skips dot-directories, and `buildConfig` ignores it for ESLint.
 */
export const OVERRIDE_DIR = ".template";

export const STATUS_FILE = "PIPELINE-STATUS.md";
/** A paper's source: LaTeX, one file at the paper's root. */
export const SOURCE_FILE = "paper.tex";

/** The flag that lets `paperlint new` create a folder whose name names a venue. */
export const ALLOW_VENUE_NAME = "--allow-venue-name";

/**
 * Why a name is refused, or null. `[a-z0-9._-]+` is the charset; a LEADING dot is refused on top
 * of it, because discovery skips dot-directories — a paper named `.x` would be created and then
 * never linted, which is worse than a refusal.
 *
 * A name that names a venue — one of `venues`' names as whole words (`aisec-2026`) — is refused
 * too, the paper's own venue included: a paper that is rejected goes to another venue and keeps its
 * folder, so the name goes stale, and nothing at creation time knows the paper will not move. A
 * folder made by hand, and one made with `--allow-venue-name` (a whole word can be the work's own:
 * a paper about realms), is what `paper/folder-venue-leftover` judges once the venue changes. The
 * flag passes no `venues`, so it skips this refusal and no other.
 */
export function nameProblem(
  name: string,
  venues: readonly NamedVenue[],
): string | null {
  if (!/^[a-z0-9._-]+$/.test(name))
    return `\`${name}\` — a paper name may hold only a-z, 0-9, dot, underscore and hyphen (it becomes a path and a shell argument)`;
  if (name.startsWith("."))
    return `\`${name}\` — a name starting with a dot is skipped by paper discovery, so it would never be linted`;
  const named = venuesNamedBy(name, venues);
  if (named.length === 0) return null;
  const which = named.map((n) => `"${n.name}"`).join(", ");
  const instead = withoutVenues(name, venues);
  return [
    `\`${name}\` — the paper folder names a venue (${which}); venues change on resubmission, so name it after the work${instead === null ? "" : ` (e.g. "${instead}")`}`,
    `    if the venue really belongs in the name, rerun \`paperlint new\` with ${ALLOW_VENUE_NAME}`,
  ].join("\n");
}

export interface FileOutcome {
  readonly file: string;
  /** `created` from a template, `kept` because it was already there. */
  readonly status: "created" | "kept";
  /** Which template it came from, for a created file. */
  readonly from?: "project" | "package";
}

export type NewPaperResult =
  | {
      readonly ok: true;
      readonly dir: string;
      /** The folder did not exist before this run. */
      readonly fresh: boolean;
      readonly files: readonly FileOutcome[];
    }
  | { readonly ok: false; readonly reason: string };

/** The files a paper folder must end up with: the scorecard, the source and `paperlint.json`. */
export const WANTED_FILES: readonly string[] = [
  STATUS_FILE,
  SOURCE_FILE,
  CONFIG_FILE,
];

/** The venue `paperlint new --venue` chose: what goes into the new paper's `paperlint.json`. */
export interface VenueSetting {
  /** `paperlint:<name>`, or a path relative to the paper's `paperlint.json`. */
  readonly extends: string;
  readonly kind: string | null;
  /**
   * The new `paper.tex` set in the class the preset's template names, so `tex/template` passes on
   * the paper `new` just wrote. Absent or null: the template's class is kept.
   */
  readonly setClass?: ((paperTex: string) => string) | null;
}

/**
 * The template's `paperlint.json` with the chosen venue written in. The template's `$comment`
 * explains how to choose one, so it goes once one is chosen. A template that is not plain JSON (a
 * project's own, with comments) cannot be edited safely and is refused by name.
 */
function withVenue(
  text: string,
  src: string,
  venue: VenueSetting,
): { ok: true; text: string } | { ok: false; reason: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    obj = null;
  }
  // Not JSON, or JSON that is not an object: there is no field to write "extends" into.
  if (!isRecord(obj))
    return {
      ok: false,
      reason: `--venue cannot be written into ${src}: it is not plain JSON — set "extends" by hand`,
    };
  const out: Record<string, unknown> = { ...obj, extends: venue.extends };
  delete out["$comment"];
  if (venue.kind !== null) out["kind"] = venue.kind;
  return { ok: true, text: `${JSON.stringify(out, null, 2)}\n` };
}

/** A file `newPaper` will write: its text, and which template it came from. */
interface Planned {
  readonly file: string;
  readonly text: string;
  readonly from: "project" | "package";
}

/** One file's text from its template — the project's override first, the package's second. */
function fromTemplate(
  file: string,
  {
    papersRoot,
    packageTemplates,
    name,
    venue,
  }: {
    papersRoot: string;
    packageTemplates: string;
    name: string;
    venue: VenueSetting | null;
  },
): { ok: true; value: Planned } | { ok: false; reason: string } {
  const project = join(papersRoot, OVERRIDE_DIR, file);
  const [src, from] = existsSync(project)
    ? [project, "project" as const]
    : [join(packageTemplates, file), "package" as const];
  // A missing package template is a broken install, not a reason to write an empty file.
  if (!existsSync(src))
    return { ok: false, reason: `no template for ${file}: ${src} is missing` };
  const text = readFileSync(src, "utf8").split("{{name}}").join(name);
  const setClass = venue?.setClass ?? null;
  if (file === SOURCE_FILE && setClass !== null)
    return { ok: true, value: { file, text: setClass(text), from } };
  if (file !== CONFIG_FILE || venue === null)
    return { ok: true, value: { file, text, from } };
  const edited = withVenue(text, src, venue);
  return edited.ok
    ? { ok: true, value: { file, text: edited.text, from } }
    : edited;
}

/** What `newPaper` is told besides the name: the venues a name may not name, and what to write. */
export interface NewPaperOptions {
  readonly packageTemplates?: string;
  readonly venue?: VenueSetting | null;
  /** Every venue paperlint knows (`shippedVenueNames`): a name naming one is refused. */
  readonly venues: readonly NamedVenue[];
}

// Documented in README.md#getting-started — update it when this changes.
export function newPaper(
  papersRoot: string,
  name: string,
  opts: NewPaperOptions,
): NewPaperResult {
  const { packageTemplates = PACKAGE_TEMPLATES, venue = null } = opts;
  const problem = nameProblem(name, opts.venues);
  if (problem) return { ok: false, reason: problem };
  const dir = join(papersRoot, name);
  const fresh = !existsSync(dir);
  if (!fresh && !statSync(dir).isDirectory())
    return { ok: false, reason: `${dir} exists and is not a directory` };

  const files: FileOutcome[] = [];
  const toWrite: Planned[] = [];
  for (const file of WANTED_FILES) {
    if (existsSync(join(dir, file))) {
      files.push({ file, status: "kept" });
      continue;
    }
    const planned = fromTemplate(file, {
      papersRoot,
      packageTemplates,
      name,
      venue,
    });
    if (!planned.ok) return planned;
    toWrite.push(planned.value);
  }
  // Read every template before writing any file, so a missing one leaves no half-made folder.
  mkdirSync(dir, { recursive: true });
  for (const { file, text, from } of toWrite) {
    // `wx`: fail rather than overwrite, even if something appeared since the check above.
    writeFileSync(join(dir, file), text, { encoding: "utf8", flag: "wx" });
    files.push({ file, status: "created", from });
  }
  return { ok: true, dir, fresh, files };
}

/** The report lines, shared by `paperlint new` and the first-paper offer in `paperlint init`. */
export function reportNewPaper(
  result: NewPaperResult,
  here: (p: string) => string,
): string[] {
  if (!result.ok) return [`  ✗ ${result.reason}`];
  const out = [
    `  ${result.fresh ? "✓ created" : "✓ already there, only missing files added:"} ${here(result.dir)}`,
  ];
  for (const f of result.files)
    out.push(
      f.status === "created"
        ? `      + ${f.file}  (from the ${f.from === "project" ? `project's ${OVERRIDE_DIR}/` : "package"} template)`
        : `      = ${f.file}  (kept — never overwritten)`,
    );
  return out;
}
