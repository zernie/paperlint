/**
 * Sealing a blind study's results: encrypt to public recipients, decrypt with a private identity —
 * shaped by what `paperlint studies seal|unseal` need, not by the program that does it. The one
 * implementation is `src/adapters/age/`; `src/cli.ts` wires it.
 */
import type { AbsolutePath } from "../domain/paths.ts";
import type { Result } from "../domain/result.ts";

/**
 * The private key: a file, or the text of an environment variable (a CI secret), which never touches
 * the disk. `name` is the variable's name, the one thing about it a message may show.
 */
export type Identity =
  | { readonly kind: "file"; readonly path: AbsolutePath }
  | { readonly kind: "secret"; readonly name: string; readonly text: string };

/** Why a seal or an unseal did not happen: the program is not installed, or it refused. */
export type SealerFailure =
  | { readonly kind: "missing" }
  | { readonly kind: "failed"; readonly message: string };

export interface Sealer {
  /** `plaintext` encrypted to every one of `recipients`. */
  readonly seal: (
    recipients: readonly string[],
    plaintext: Uint8Array,
  ) => Result<Uint8Array, SealerFailure>;
  /** The file at `ciphertext`, decrypted with `identity`. */
  readonly unseal: (
    identity: Identity,
    ciphertext: AbsolutePath,
  ) => Result<Uint8Array, SealerFailure>;
}
