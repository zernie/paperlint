/** Fetching a URL — the generic port for the network. */
import type { Result } from "../domain/result.ts";

/** Fetch a URL's bytes. */
export interface Download {
  fetch(
    url: string,
    timeoutMs: number,
  ): Result<Uint8Array, { readonly detail: string }>;
}
