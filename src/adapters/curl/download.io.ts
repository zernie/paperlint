/**
 * `Download` through `curl -fsSL`. Not Node's `fetch`: undici's `fetch` ignores `HTTPS_PROXY` unless
 * a proxy agent is installed, and rpp's CI and the containers it runs in reach the network only
 * through a proxy. curl reads the proxy variables itself. (A claim from documentation, not measured
 * here — the port is what makes trying the other adapter cheap.)
 */
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { join } from "node:path";
import { firstLine } from "../../domain/text.ts";
import type { Download } from "../../ports/download.ts";
import type { ProcessExit, RunProcess } from "../../ports/process.ts";
import { err, ok } from "../../domain/result.ts";

/** Why a curl run did not download, in its own words; null when it exited 0. */
export function curlFailure(r: ProcessExit): string | null {
  if (r.kind === "exited" && r.status === 0) return null;
  if (r.kind === "not-found") return "curl is not installed";
  if (r.kind === "spawn-failed") return r.message;
  if (r.kind === "timed-out") return `no answer after ${String(r.afterMs)} ms`;
  const what =
    r.kind === "exited" ? `curl exited ${String(r.status)}` : r.signal;
  return firstLine(r.stderr) || what;
}

const readOrNull = (p: string): Uint8Array | null => {
  try {
    return readFileSync(p);
  } catch {
    return null;
  }
};

/**
 * `run` is the process port (so a test can take curl away); `env` is curl's whole environment, the
 * proxy variables included; `tmpDir` holds the file curl writes, removed before `fetch` returns.
 */
export function curlDownload(o: {
  readonly run: RunProcess;
  readonly env: Readonly<Record<string, string>>;
  readonly tmpDir: string;
}): Download {
  return {
    fetch(url: string, timeoutMs: number) {
      const dir = realpathSync(mkdtempSync(join(o.tmpDir, "rpp-download-")));
      const out = join(dir, "body");
      try {
        const seconds = String(Math.ceil(timeoutMs / 1000));
        const failed = curlFailure(
          o.run.run({
            file: "curl",
            args: [
              "-fsSL",
              "--retry",
              "2",
              "--max-time",
              seconds,
              "-o",
              out,
              url,
            ],
            env: o.env,
            timeoutMs: timeoutMs + 30_000,
          }),
        );
        const bytes = failed ? null : readOrNull(out);
        if (bytes) return ok(bytes);
        return err({ detail: failed ?? "curl wrote no file" });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
