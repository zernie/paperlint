/**
 * Sealing a blind study's results: encrypt to public recipients — shaped by what
 * `paperlint studies seal` needs, not by the program that does it. The one
 * implementation is `src/adapters/age/`; `src/cli.ts` wires it.
 */
import type { Result } from "../domain/result.ts";

/** Why a seal did not happen: the program is not installed, or it refused. */
export type SealerFailure =
  | { readonly kind: "missing" }
  | { readonly kind: "failed"; readonly message: string };

export interface Sealer {
  /** `plaintext` encrypted to every one of `recipients`. */
  readonly seal: (
    recipients: readonly string[],
    plaintext: Uint8Array,
  ) => Result<Uint8Array, SealerFailure>;
}
