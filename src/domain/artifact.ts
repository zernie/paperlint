/**
 * A paper's reproduction artifact, as the paper declares it in its `paperlint.json`:
 *
 *   "artifact": {
 *     "dir": "<folder, relative to the paper>"          ┐ exactly one: where the artifact is, or
 *     "files": "<text file, relative to the paper>",    ┘ a committed list of its paths, one per line
 *     "required": ["README", "LICENSE"],                  names its top level must hold
 *     "promises": { "<label>": "<glob>" }                 what the paper says it holds
 *   }
 *
 * `files` is for a bundle that is not committed (a gitignored zip): its paths as `zipinfo -1` or
 * `find` writes them, relative to the artifact's root. A required name is matched without its
 * extension and case (`README` is answered by README.md, readme.txt, README), and a promise's glob
 * by `path.matchesGlob`, the same way whichever form lists the paths. `artifact/required-files` and
 * `artifact/promised` judge them. The keys #205 plans for assembling a bundle (`include`, `exclude`,
 * `scrub`) are left free.
 */
import { isAbsolute, matchesGlob } from "node:path";
import { err, ok, type Result } from "./result.ts";
import { isRecord } from "./record.ts";

/** Where the artifact's paths come from: its folder, or a committed list of them. */
export type ArtifactSource =
  | { readonly kind: "dir"; readonly path: string }
  | { readonly kind: "files"; readonly path: string };

/** What a paper says its artifact is. */
export interface PaperArtifact {
  /** The folder or the list, its path relative to the paper folder. */
  readonly source: ArtifactSource;
  /** Names the artifact's top level must hold, each matched without its extension; empty when none. */
  readonly required: readonly string[];
  /** A label the author chose → a glob, relative to the artifact's root, that must match a path. */
  readonly promises: Readonly<Record<string, string>>;
}

const KEYS = ["dir", "files", "required", "promises"];

/** The text of a name before its first dot, case folded: what a required name is matched by. Pure. */
const stemOf = (name: string): string =>
  name.split(".", 1).join("").toLowerCase();

/** Whether a top-level name answers the required name `want` (any extension, any case). Pure. */
export const answers = (name: string, want: string): boolean =>
  stemOf(name) === want.toLowerCase();

/** The required names `paths` (relative to the artifact's root) do not hold at its top level. Pure. */
export const missingRequired = (
  required: readonly string[],
  paths: readonly string[],
): readonly string[] => {
  const top = paths.filter((p) => !p.includes("/"));
  return required.filter((want) => !top.some((name) => answers(name, want)));
};

/** The promises whose glob matches none of `paths`, as [label, glob]. Pure. */
export const brokenPromises = (
  promises: Readonly<Record<string, string>>,
  paths: readonly string[],
): readonly (readonly [string, string])[] =>
  Object.entries(promises).filter(
    ([, glob]) => !paths.some((p) => matchesGlob(p, glob)),
  );

/**
 * A committed list of paths → the files it names, relative to the artifact's root: one per line,
 * blank lines and folder entries (`dir/`, as `zipinfo -1` writes them) dropped, a leading `./` (as
 * `find .` writes it) removed. Pure.
 */
export const listedPaths = (text: string): readonly string[] =>
  text
    .split(/\r?\n/u)
    .map((l) => l.trim().replace(/^(?:\.\/)+/u, ""))
    .filter((l) => l !== "" && l !== "." && !l.endsWith("/"));

/** A path relative to the paper: a non-empty string, not absolute. */
const relativePath = (v: unknown): v is string =>
  typeof v === "string" && v !== "" && !isAbsolute(v);

/** `dir` or `files`, exactly one, each relative to the paper. Pure. */
function sourceOf(
  v: Readonly<Record<string, unknown>>,
): Result<ArtifactSource, string> {
  const given = (["dir", "files"] as const).filter((k) => k in v);
  const [kind] = given;
  if (given.length !== 1 || kind === undefined)
    return err(
      `"artifact" needs exactly one of "dir" (the artifact's folder) or "files" (a committed list of its paths), got ${given.length === 0 ? "neither" : "both"}`,
    );
  const path = v[kind];
  return relativePath(path)
    ? ok({ kind, path })
    : err(
        `"artifact.${kind}" must be a path relative to the paper, got ${JSON.stringify(path)}`,
      );
}

/** `required`: absent is none; otherwise names without a folder in them. Pure. */
function requiredOf(v: unknown): Result<readonly string[], string> {
  if (v === undefined) return ok([]);
  return Array.isArray(v) &&
    v.every((x) => typeof x === "string" && /^[^/\\.\s]+$/u.test(x))
    ? ok(v.filter((x): x is string => typeof x === "string"))
    : err(
        `"artifact.required" must be a list of top-level names without an extension ("README", "LICENSE"), got ${JSON.stringify(v)}`,
      );
}

/** `promises`: absent is none; otherwise each label and glob a non-empty string. Pure. */
function promisesOf(
  v: unknown,
): Result<Readonly<Record<string, string>>, string> {
  if (v === undefined) return ok({});
  if (!isRecord(v))
    return err(`"artifact.promises" must be an object of label → glob`);
  const entries = Object.entries(v);
  const bad = entries.find(
    ([label, glob]) => label === "" || typeof glob !== "string" || glob === "",
  );
  return bad === undefined
    ? ok(Object.fromEntries(entries.map(([l, g]) => [l, String(g)])))
    : err(
        `"artifact.promises" entry ${JSON.stringify(bad[0])} must be a non-empty glob relative to the artifact's root, got ${JSON.stringify(bad[1])}`,
      );
}

/** A paper's `artifact` → the value, null when absent, or one line saying what is wrong. Pure. */
export function parsePaperArtifact(
  v: unknown,
): Result<PaperArtifact | null, string> {
  if (v === undefined) return ok(null);
  if (!isRecord(v))
    return err(`"artifact" must be an object with a "dir" or a "files"`);
  const unknown = Object.keys(v).find((k) => !KEYS.includes(k));
  if (unknown !== undefined)
    return err(
      `"artifact" has an unknown key "${unknown}" — known: ${KEYS.join(", ")}`,
    );
  const source = sourceOf(v);
  if (!source.ok) return source;
  const required = requiredOf(v["required"]);
  if (!required.ok) return required;
  const promises = promisesOf(v["promises"]);
  return promises.ok
    ? ok({
        source: source.value,
        required: required.value,
        promises: promises.value,
      })
    : promises;
}
