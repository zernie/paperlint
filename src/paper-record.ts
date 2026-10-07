/**
 * `paperRecord(dir)` — what every consumer of the build's record asks first: is there a record of
 * this paper, and is it still about the files on disk? The answer is one of three states, and the
 * rules that depend on the record are silent in two of them (docs/design/paper-sources.md §1):
 *
 *   none    no `_build/sources.json`, or one this paperlint cannot read — the paper was not built
 *   stale   a file the build read has other bytes now (`changed` names them)
 *   fresh   every file is as the build hashed it; the record is TeX's answer for this paper
 *
 * Reads through the `Files` port alone; the one paperlint-specific question — which files make a
 * record stale — is `changesSince` (`src/domain/sources-record.ts`).
 */
import { resolve } from "node:path";
import { callerPath } from "./caller-path.ts";
import type { BibText } from "./domain/paper-sources.ts";
import type { AbsolutePath } from "./domain/paths.ts";
import { sha256Hex, type Sha256 } from "./domain/sha256.ts";
import {
  changesSince,
  type Change,
  type InputRole,
  type SourcesRecord,
} from "./domain/sources-record.ts";
import type { BibReader } from "./ports/bib-reader.ts";
import type { Files } from "./ports/files.ts";
import type { SourcesCodec } from "./ports/sources-codec.ts";
import { sourcesPath } from "./sources-record.ts";

export type PaperRecord =
  /** No record, or one that cannot be read (`unreadable` says why; null for no file). */
  | { readonly kind: "none"; readonly unreadable: string | null }
  | { readonly kind: "stale"; readonly changed: readonly Change[] }
  | { readonly kind: "fresh"; readonly record: SourcesRecord };

/** The digest of the file at `path` in the paper directory now, or null when there is none. */
const digestOf =
  (dir: string, files: Files) =>
  (path: string): Sha256 | null => {
    const b = files.readBytes(callerPath(resolve(dir, path)));
    return b === null ? null : sha256Hex(b);
  };

/** What reading a record needs: the disk, and the schema its text is parsed with. */
export interface RecordReadDeps {
  readonly files: Files;
  readonly codec: SourcesCodec;
}

export function paperRecord(dir: string, deps: RecordReadDeps): PaperRecord {
  const raw = deps.files.readBytes(callerPath(sourcesPath(dir)));
  if (raw === null) return { kind: "none", unreadable: null };
  const parsed = deps.codec.parse(new TextDecoder().decode(raw));
  if (!parsed.ok) return { kind: "none", unreadable: parsed.why };
  const changed = changesSince(parsed.record, digestOf(dir, deps.files));
  return changed.length === 0
    ? { kind: "fresh", record: parsed.record }
    : { kind: "stale", changed };
}

/** The files of `role` the record lists, as absolute paths, in the order TeX first read them. */
export const recordedFiles = (
  dir: string,
  record: SourcesRecord,
  role: InputRole,
): readonly AbsolutePath[] =>
  record.inputs
    .filter((i) => i.role === role)
    .map((i) => callerPath(resolve(dir, i.path)));

/** One database the build's bibtex opened. */
export interface OpenedDatabase {
  /** As bibtex names it: `refs.bib`, `bibs/x.bib`. */
  readonly name: string;
  /** A `.bib` TeX wrote (a `filecontents` block), not one the author keeps. */
  readonly written: boolean;
  /** Its text as the bibtex reader reads it; null when the file is not on disk now. */
  readonly bib: BibText | null;
}

/** The databases the build's bibtex opened, in the order it opened them. None when it ran none. */
export function openedDatabases(
  dir: string,
  record: SourcesRecord,
  deps: { readonly files: Files; readonly bib: BibReader },
): readonly OpenedDatabase[] {
  if (!record.bibtex.ran) return [];
  return record.bibtex.databases.map((name) => {
    const path = callerPath(resolve(dir, name));
    const bytes = deps.files.readBytes(path);
    return {
      name,
      written: record.written.includes(name),
      bib:
        bytes === null
          ? null
          : deps.bib.readFile(path, new TextDecoder().decode(bytes)),
    };
  });
}
