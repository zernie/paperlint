/**
 * A paper's reproduction artifact, in the paper's vocabulary: what the venue's artifact call asks
 * the artifact to hold (`artifact_bar` in a venue preset), and what the paper says it holds
 * (`artifact` in the paper's `paperlint.json`). `artifact/contents` judges one against the folder.
 *
 *   venue preset  "artifact_bar": { "source": "call", "url", "read", "files": ["README", "LICENSE"] }
 *   paper         "artifact": { "dir": "<folder, relative to the paper>", "promises": { "<label>": "<glob>" } }
 *
 * A bar file is a name without its extension: the call asks for "a README", and README.md,
 * README.txt, readme.pdf and README all answer it.
 */
import { isAbsolute } from "node:path";
import { err, ok, type Result } from "./result.ts";
import { isRecord } from "./record.ts";

/** A venue's artifact bar as its call was read: the top-level files the artifact must hold. */
export interface ArtifactBar {
  /** `call`: copied from the venue's artifact-evaluation call. */
  readonly source: "call";
  readonly url: string;
  /** The day it was read, YYYY-MM-DD. */
  readonly read: string;
  /** The names the artifact's top level must hold, each without an extension (`README`). */
  readonly files: readonly string[];
}

/** A bar as the resolved preset holds it: with the venue whose call it is (a workshop's parent's, when it has none). */
export interface SourcedBar extends ArtifactBar {
  /** The edition that set it, as messages name it (`ICSE 2027`). */
  readonly venue: string;
  /** That edition's preset id (`icse-2027`). */
  readonly preset: string;
}

/** What a paper says its artifact is: where it is, and what the paper promises it holds. */
export interface PaperArtifact {
  /** The artifact's folder, relative to the paper folder. */
  readonly dir: string;
  /** A label the author chose → a glob, relative to `dir`, that must match at least one file. */
  readonly promises: Readonly<Record<string, string>>;
}

const KEYS = ["dir", "promises"];

/** The text of a name before its first dot, case folded: what a bar file is matched by. Pure. */
const stemOf = (name: string): string =>
  name.split(".", 1).join("").toLowerCase();

/** Whether a top-level name answers the bar file `want` (any extension, any case). Pure. */
export const answers = (name: string, want: string): boolean =>
  stemOf(name) === want.toLowerCase();

/** `promises`: absent is none; otherwise each label and glob a non-empty string. Pure. */
function promisesOf(
  v: unknown,
): Result<Readonly<Record<string, string>>, string> {
  if (v === undefined) return ok({});
  if (!isRecord(v))
    return err(`"artifact.promises" must be an object of label → glob`);
  const bad = Object.entries(v).find(
    ([label, glob]) => label === "" || typeof glob !== "string" || glob === "",
  );
  return bad === undefined
    ? ok(
        Object.fromEntries(
          Object.entries(v).map(([label, glob]) => [label, String(glob)]),
        ),
      )
    : err(
        `"artifact.promises" entry ${JSON.stringify(bad[0])} must be a non-empty glob relative to "artifact.dir", got ${JSON.stringify(bad[1])}`,
      );
}

/** A paper's `artifact` → the value, null when absent, or one line saying what is wrong. Pure. */
export function parsePaperArtifact(
  v: unknown,
): Result<PaperArtifact | null, string> {
  if (v === undefined) return ok(null);
  if (!isRecord(v))
    return err(`"artifact" must be an object with a "dir"`);
  const unknown = Object.keys(v).find((k) => !KEYS.includes(k));
  if (unknown !== undefined)
    return err(
      `"artifact" has an unknown key "${unknown}" — known: ${KEYS.join(", ")}`,
    );
  const dir = v["dir"];
  if (typeof dir !== "string" || dir === "" || isAbsolute(dir))
    return err(
      `"artifact.dir" must be a folder relative to the paper, got ${JSON.stringify(dir)}`,
    );
  const promises = promisesOf(v["promises"]);
  return promises.ok ? ok({ dir, promises: promises.value }) : promises;
}
