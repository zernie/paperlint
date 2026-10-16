/**
 * Sealing a blind study's results: encrypt to public recipients, decrypt with an identity file —
 * shaped by what `paperlint studies seal|unseal` need, not by the program that does it. The one
 * implementation is `src/adapters/age/`; `src/cli.ts` wires it.
 */
import type { AbsolutePath } from "../domain/paths.ts";
import type { Result } from "../domain/result.ts";

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
  /**
   * The file at `ciphertext`, decrypted with the identity file at `identity`. Where that file comes
   * from — a person's machine, a hardware key, a secret store — is the user's choice; the package
   * holds no policy on it.
   */
  readonly unseal: (
    identity: AbsolutePath,
    ciphertext: AbsolutePath,
  ) => Result<Uint8Array, SealerFailure>;
}
