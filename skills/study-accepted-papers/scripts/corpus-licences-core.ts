/**
 * corpus-licences-core — for each paper of a venue corpus's `papers.json` and each kind a corpus
 * stores (its extracted text, its PDF), the copy whose licence permits keeping it, or each copy's
 * reason it may not be kept. study-accepted-papers reads it before it downloads a PDF or extracts a
 * text (docs/venues.md, "Licences"; docs/design/venue-corpus.md, decisions 2 and 3).
 *
 * The record is parsed by `VenueCorpusCodec`; what a licence permits is `src/domain/licence.ts`'s
 * table, never restated here. The project's non-commercial setting arrives with `corpus/licence`;
 * until then the runner judges as for a project that has not declared itself non-commercial.
 * No model, no network.
 *
 * Usage: node corpus-licences.js <venue>
 * The record is `<papers-root>/venues/<venue>/papers.json`: the project root is the git top level of
 * the folder the command runs in, the papers roots are the project's `papersDir` (src/papers-roots.ts).
 * Exit: 0 — one line per paper and kind · 1 — not in a git repository, no papers.json in any papers
 * root or one in several, or it does not parse · 2 — no venue named, or not a folder name.
 */
import { dirname, join } from "node:path";
import { CONFIG_FILE, PAPERS_DIR_FIELD } from "#lib/paper-config";
import { callerPath } from "#src/caller-path";
import {
  permits,
  STORED_KINDS,
  type LicenceSettings,
  type Permission,
  type StoredKind,
} from "#src/domain/licence";
import {
  CORPUS_RECORD,
  type Copy,
  type KnownVersion,
  type Paper,
  type VenueCorpus,
} from "#src/domain/venue-corpus";
import { papersRoots } from "#src/papers-roots";
import type { Files } from "#src/ports/files";
import type { RunProcess } from "#src/ports/process";
import type { VenueCorpusCodec } from "#src/ports/venue-corpus-codec";

/** Why one copy may not be kept as one kind. */
export type Refused = Exclude<Permission, { readonly kind: "permitted" }>;

/** One copy's refusal: its version, its licence id, and why. */
export interface Refusal {
  readonly version: Copy["version"];
  readonly licence: string;
  readonly permission: Refused;
}

/** For one paper and one kind: the copy to keep, or every copy's refusal (none when it has no copy). */
export type Verdict =
  | {
      readonly key: string;
      readonly stored: StoredKind;
      readonly outcome: "keep";
      readonly version: KnownVersion;
      readonly licence: string;
      readonly url: string;
    }
  | {
      readonly key: string;
      readonly stored: StoredKind;
      readonly outcome: "none";
      readonly refusals: readonly Refusal[];
    };

/** One copy judged for one kind. */
interface Judged {
  readonly copy: Copy;
  readonly permission: Permission;
}

const isRefused = (j: Judged): j is Judged & { readonly permission: Refused } =>
  j.permission.kind !== "permitted";

/** A copy whose version is known: only such a copy can be kept (an `unknown` one is `NOASSERTION`). */
type KnownCopy = Extract<Copy, { readonly version: KnownVersion }>;

/** The first copy, in the record's order, whose licence permits the kind. */
const keptOf = (judged: readonly Judged[]): KnownCopy | undefined =>
  judged
    .map((j) => j.copy)
    .find(
      (c, i): c is KnownCopy =>
        judged[i]?.permission.kind === "permitted" && c.version !== "unknown",
    );

/** Every copy that may not be kept as the kind, with why. */
const refusalsOf = (judged: readonly Judged[]): readonly Refusal[] =>
  judged.filter(isRefused).map((j) => ({
    version: j.copy.version,
    licence: j.copy.licence.id,
    permission: j.permission,
  }));

/** The verdict for one paper and one kind: the copy to keep, or every copy's refusal. */
function verdictOf(
  paper: Paper,
  stored: StoredKind,
  settings: Readonly<LicenceSettings>,
): Verdict {
  const judged: readonly Judged[] = paper.copies.map((copy) => ({
    copy,
    permission: permits(copy.licence.id, stored, settings),
  }));
  const kept = keptOf(judged);
  const { key } = paper;
  return kept === undefined
    ? {
        key,
        stored,
        outcome: "none",
        refusals: refusalsOf(judged),
      }
    : {
        key,
        stored,
        outcome: "keep",
        version: kept.version,
        licence: kept.licence.id,
        url: kept.url,
      };
}

/** Every paper's verdict for each kind, in the record's order. */
export const verdicts = (
  corpus: VenueCorpus,
  settings: Readonly<LicenceSettings>,
): readonly Verdict[] =>
  corpus.papers.flatMap((p) =>
    STORED_KINDS.map((kind) => verdictOf(p, kind, settings)),
  );

/** Why a copy may not be kept, in words. */
function reason(r: Refusal): string {
  switch (r.permission.kind) {
    case "forbidden":
      return `${r.licence}: ${r.permission.why}`;
    case "non-commercial-only":
      return `${r.licence} permits it only in a project declared non-commercial`;
    case "not-read":
      return "its licence was not read (NOASSERTION)";
    case "unlisted":
      return `${r.permission.id} is not in the licence table, so it permits nothing`;
  }
}

/** One verdict as the line the command prints. */
function line(v: Verdict): string {
  const what =
    v.outcome === "keep"
      ? `keep the ${v.version} copy (${v.licence}), ${v.url}`
      : v.refusals.length === 0
        ? "none: no copy recorded"
        : `none: ${v.refusals.map((r) => `${r.version}: ${reason(r)}`).join("; ")}`;
  return `${v.key} ${v.stored}: ${what}`;
}

/** What the command prints for `all`. */
export const listing = (all: readonly Verdict[]): string =>
  all.length === 0
    ? `${CORPUS_RECORD} holds no paper\n`
    : `${all.map(line).join("\n")}\n`;

/** What the command reads with: the disk, the record's codec, and where the project is. */
export interface Deps {
  readonly files: Files;
  readonly codec: VenueCorpusCodec;
  /** The top of the git working tree holding `cwd`, or null when `cwd` is in none. */
  readonly projectRoot: (cwd: string) => string | null;
  /** The folder the command was started in. */
  readonly cwd: string;
}

/**
 * `git rev-parse --show-toplevel` in `cwd`: the project's root, or null outside a repository (or
 * when git did not run). `path` is the caller's PATH, the only variable git is given.
 */
export function gitTopLevel(
  git: RunProcess,
  path: string | undefined,
  cwd: string,
): string | null {
  const r = git.run({
    file: "git",
    args: ["rev-parse", "--show-toplevel"],
    env: { PATH: path ?? "" },
    timeoutMs: 10_000,
    cwd: callerPath(cwd),
  });
  const top = r.kind === "exited" && r.status === 0 ? r.stdout.trim() : "";
  return top === "" ? null : top;
}

/** Where the command writes: the listing, and what stops it. */
export interface Output {
  readonly out: (s: string) => void;
  readonly err: (s: string) => void;
}

/** The project's setting the table reads, until `corpus/licence` ships it: not declared. */
const UNDECLARED: LicenceSettings = { nonCommercial: false };

/** A venue is one folder name: no separator, and not a way up. */
const VENUE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

const USAGE = "usage: node corpus-licences.js <venue>\n";

/** The project's `papersDir` setting, read through the disk port; absent file, default setting. */
function settingsOf(
  files: Files,
  root: string,
):
  | { readonly ok: true; readonly opts: { readonly papersDir?: unknown } }
  | {
      readonly ok: false;
      readonly why: string;
    } {
  const file = join(root, CONFIG_FILE);
  const bytes = files.readBytes(callerPath(file));
  if (bytes === null) return { ok: true, opts: {} };
  const parsed = jsonOf(new TextDecoder().decode(bytes));
  if (parsed === undefined) return { ok: false, why: `${file} is not JSON` };
  return {
    ok: true,
    opts: isObject(parsed)
      ? { [PAPERS_DIR_FIELD]: parsed[PAPERS_DIR_FIELD] }
      : {},
  };
}

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** The JSON `text` holds, or undefined when it is not JSON. */
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The one `papers.json` of `venue` among the project's papers roots, or why there is not exactly one. */
function recordOf(
  deps: Deps,
  venue: string,
):
  | { readonly ok: true; readonly file: string }
  | { readonly ok: false; readonly why: string } {
  const root = deps.projectRoot(deps.cwd);
  if (root === null)
    return {
      ok: false,
      why: `${deps.cwd} is not inside a git repository: run it in the project`,
    };
  const settings = settingsOf(deps.files, root);
  if (!settings.ok) return settings;
  const looked = papersRoots({ opts: settings.opts, root }).map((papers) =>
    join(papers, "venues", venue, CORPUS_RECORD),
  );
  const found = looked.filter((f) => deps.files.isFile(callerPath(f)));
  const [only] = found;
  if (only !== undefined && found.length === 1) return { ok: true, file: only };
  return {
    ok: false,
    why:
      found.length === 0
        ? `no ${CORPUS_RECORD} for venue "${venue}": looked in ${looked.map((f) => dirname(f)).join(", ")}; write the record first`
        : `venue "${venue}" is in more than one papers folder: ${found.map((f) => dirname(f)).join(", ")}`,
  };
}

/** Run the command on `argv`; the exit code. */
export function main(
  argv: readonly string[],
  deps: Deps,
  { out, err }: Output,
): number {
  const [venue, ...rest] = argv;
  if (venue === undefined || rest.length > 0 || !VENUE.test(venue)) {
    err(USAGE);
    return 2;
  }
  const at = recordOf(deps, venue);
  if (!at.ok) {
    err(`corpus-licences: ${at.why}\n`);
    return 1;
  }
  const bytes = deps.files.readBytes(callerPath(at.file));
  if (bytes === null) {
    err(`corpus-licences: ${at.file} could not be read\n`);
    return 1;
  }
  const parsed = deps.codec.parse(new TextDecoder().decode(bytes));
  if (!parsed.ok) {
    err(`corpus-licences: ${parsed.why}\n`);
    return 1;
  }
  out(listing(verdicts(parsed.corpus, UNDECLARED)));
  return 0;
}
