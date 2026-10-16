/** `RunBytes` over Node's `spawnSync`: stdin and stdout as bytes, a nonzero exit or a signal as data. */
import { spawnSync } from "node:child_process";
import { codeOf } from "../../domain/text.ts";
import type { BytesCommand, BytesExit } from "./index.ts";

/** Room for a study's result file: age streams, the buffer does not. */
const MAX_OUTPUT = 2 ** 31 - 1;

export const spawnBytes = (c: BytesCommand): BytesExit => {
  const r = spawnSync(c.file, [...c.args], {
    input: c.stdin,
    env: { ...c.env },
    timeout: c.timeoutMs,
    maxBuffer: MAX_OUTPUT,
  });
  if (codeOf(r.error) === "ENOENT") return { kind: "not-found" };
  if (r.error !== undefined)
    return { kind: "failed", message: r.error.message };
  return r.status === null
    ? { kind: "failed", message: `ended by ${String(r.signal)}` }
    : {
        kind: "exited",
        status: r.status,
        stdout: new Uint8Array(r.stdout),
        stderr: r.stderr.toString("utf8"),
      };
};
