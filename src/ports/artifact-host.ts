/**
 * A host that keeps a paper's reproduction artifact — the port `paperlint artifact upload|show` talk
 * through. Shaped by what the two commands need (put one file there, read one file's hashes back),
 * not by any host's API; one adapter per host (`src/adapters/osf/`), listed in one place, the root's
 * `ARTIFACT_HOSTS`. The rule `artifact/upload-current` never uses it: it reads the upload record.
 */
import type { Result } from "../domain/result.ts";

/** A hash a host can give back for a file it holds. */
export type HashKind = "sha256" | "md5";

/** A file as the host holds it: its id there, its page, and the hashes the host gave. */
export interface HostedFile {
  readonly id: string;
  readonly url: string;
  readonly sha256: string | null;
  readonly md5: string | null;
}

/** Why the host gave no answer to use. The token never appears in `detail`. */
export interface HostFailure {
  readonly kind: "unreachable" | "refused" | "not-found" | "malformed";
  readonly detail: string;
}

/** Where a file was put, or is to be found: the record's url, the file's name, the host's id of it. */
export interface Where {
  readonly url: string;
  readonly file: string;
  readonly id: string | null;
}

/** An upload: the file, and the host's container for it (an OSF project's guid). */
export interface Upload {
  readonly target: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface ArtifactHost {
  /** What this host's adapter can do: upload, and which hashes it reads back (none: cannot check). */
  readonly can: {
    readonly upload: boolean;
    readonly hashes: readonly HashKind[];
  };
  /** The environment variable the token is read from; the site-less one refused by name. */
  readonly token: {
    readonly variable: string;
    readonly siteLess: string;
    /** Where the author makes one, and with which permission, in the words the command prints. */
    readonly help: string;
  };
  /** The container `upload` puts a file in, read off a record's url (an OSF project's guid); null when none. */
  readonly targetOf: (url: string) => string | null;
  /** The file's hashes as the host holds them now; a token only where the file is not public. */
  readonly read: (
    where: Where,
    token: string | null,
  ) => Promise<Result<HostedFile, HostFailure>>;
  /** Put the file there: a new version of a file of the same name, else a new file. */
  readonly upload: (
    u: Upload,
    token: string,
  ) => Promise<Result<HostedFile, HostFailure>>;
}
