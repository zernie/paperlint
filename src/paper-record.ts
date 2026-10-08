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
import type { AbsolutePath } from "./domain/paths.ts";
import { sha256Hex, type Sha256 } from "./domain/sha256.ts";
import {
  changesSince,
  type Change,
  type InputRole,
  type SourcesRecord,
} from "./domain/sources-record.ts";
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
