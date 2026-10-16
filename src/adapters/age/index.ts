/**
 * `Sealer` over the age CLI (https://age-encryption.org): `age -r <recipient>…` encrypts stdin to
 * stdout. Nothing here implements cryptography; it builds the command, and reads age's header to
 * check that the ciphertext is sealed to every recipient asked. Decryption is not here: who holds the
 * private key, and where, is an open decision (docs/design/sealed-studies.md).
 */
import { err, ok, type Result } from "../../domain/result.ts";
import type { Sealer, SealerFailure } from "../../ports/sealer.ts";
import type { BytesExit, RunBytes } from "./bytes.ts";

export type { BytesCommand, BytesExit, RunBytes } from "./bytes.ts";
export { spawnBytes } from "./run-bytes.io.ts";

/** The program. */
export const AGE = "age";

/** The first line of every binary age file (age-encryption.org/v1, "Header"). */
const VERSION_LINE = "age-encryption.org/v1";

/** A seal may take this long. */
const TIMEOUT_MS = 10 * 60_000;

/** What age's run came to, as a result: its stdout, or why not. */
const outcome = (x: BytesExit): Result<Uint8Array, SealerFailure> => {
  switch (x.kind) {
    case "not-found":
      return err({ kind: "missing" });
    case "failed":
      return err({ kind: "failed", message: x.message });
    case "exited":
      return x.status === 0
        ? ok(x.stdout)
        : err({
            kind: "failed",
            message: x.stderr.trim() || `age exited ${String(x.status)}`,
          });
  }
};

/**
 * The number of X25519 stanzas in an age file's header, or null when it does not start like one. The
 * header is text, up to the line that starts with `---`.
 */
export const x25519Stanzas = (ciphertext: Uint8Array): number | null => {
  const head = new TextDecoder().decode(ciphertext.subarray(0, 64 * 1024));
  const end = head.indexOf("\n---");
  const lines = head.slice(0, Math.max(end, 0)).split("\n");
  return end === -1 || lines[0] !== VERSION_LINE
    ? null
    : lines.filter((l) => l.startsWith("-> X25519 ")).length;
};

/** The ciphertext, when its header is age's and names one stanza per recipient; else why not. */
const sealedToAll = (
  recipients: readonly string[],
  ciphertext: Uint8Array,
): Result<Uint8Array, SealerFailure> => {
  const n = x25519Stanzas(ciphertext);
  return n === recipients.length
    ? ok(ciphertext)
    : err({
        kind: "failed",
        message:
          n === null
            ? "age wrote something that is not an age file"
            : `age sealed to ${String(n)} recipients, not the ${String(recipients.length)} asked`,
      });
};

/** age, run through `run` with `env` as its whole environment. */
export function ageSealer(
  run: RunBytes,
  env: Readonly<Record<string, string>>,
): Sealer {
  const age = (args: readonly string[], stdin: Uint8Array) =>
    outcome(run({ file: AGE, args, stdin, env, timeoutMs: TIMEOUT_MS }));
  return {
    seal: (recipients, plaintext) => {
      const out = age(
        recipients.flatMap((r) => ["-r", r]),
        plaintext,
      );
      return out.ok ? sealedToAll(recipients, out.value) : out;
    },
  };
}
