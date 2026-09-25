/**
 * `RunProcess` over Node's `spawnSync`. The one place that reads a child's result as Node reports
 * it — `error`, `status`, `signal`, all nullable — and turns it into a `ProcessExit`, so no caller
 * re-derives "what happened" from three fields.
 */
import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from "node:child_process";
import type { Command, ProcessExit, RunProcess } from "../../ports/process.ts";

/** Node's `spawnSync`, or a stand-in with its shape (a harness records the calls through one). */
export type SpawnSync = typeof spawnSync;

const errno = (r: SpawnSyncReturns<string>): string | undefined =>
  (r.error as NodeJS.ErrnoException | undefined)?.code;

/** What a finished `spawnSync` came to. ENOENT is the executable itself: `c.file` was not found. */
export function exitOf(r: SpawnSyncReturns<string>, c: Command): ProcessExit {
  const out = {
    stdout: String(r.stdout ?? ""),
    stderr: String(r.stderr ?? ""),
  };
  const code = errno(r);
  if (code === "ENOENT") return { kind: "not-found", file: c.file };
  if (code === "ETIMEDOUT")
    return { kind: "timed-out", afterMs: c.timeoutMs, ...out };
  if (r.error) return { kind: "spawn-failed", message: r.error.message };
  if (r.signal) return { kind: "signalled", signal: r.signal, ...out };
  return { kind: "exited", status: r.status ?? 1, ...out };
}

/** A `RunProcess` that runs every `Command` with `spawn` (Node's `spawnSync` by default). */
export function spawnProcess(spawn: SpawnSync = spawnSync): RunProcess {
  return {
    run(c: Command): ProcessExit {
      const opts: SpawnSyncOptionsWithStringEncoding = {
        encoding: "utf8",
        env: { ...c.env },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: c.timeoutMs,
        ...(c.maxOutputBytes ? { maxBuffer: c.maxOutputBytes } : {}),
        ...(c.cwd ? { cwd: c.cwd } : {}),
      };
      return exitOf(spawn(c.file, [...c.args], opts), c);
    },
  };
}
