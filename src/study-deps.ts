/**
 * What the readers of a paper's studies are handed: the disk, the entries of a directory with what
 * each is (no symbolic link followed), and the parsers of the registry and its plans. The study folder's
 * reader (`src/study-folder.ts`), the gate and the order rule are built from it.
 */
import type { Files } from "./ports/files.ts";
import type { ListEntries } from "./ports/list-entries.ts";
import type { StudyRegistryCodec } from "./ports/study-registry-codec.ts";

export interface StudyDeps {
  readonly files: Files;
  readonly entries: ListEntries;
  readonly codec: StudyRegistryCodec;
}
