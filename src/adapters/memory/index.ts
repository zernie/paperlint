/**
 * In-memory adapters for the app layer's tests: every port, no disk, no processes, no network.
 * Each one RECORDS what it was asked, so a test asserts on the calls instead of on side effects.
 */
import type { AbsolutePath } from "../../domain/paths.ts";
import type { Download } from "../../ports/download.ts";
import type { Files } from "../../ports/files.ts";
import type { Command, ProcessExit, RunProcess } from "../../ports/process.ts";
import type { NotAPromise, Scratch, Workspace } from "../../ports/workspace.ts";
import { err, ok } from "../../domain/result.ts";

export interface ScriptedProcess extends RunProcess {
  readonly calls: Command[];
}

/** A `RunProcess` that answers every `Command` with `script(c)` and records it. */
export function scriptedProcess(
  script: (c: Command) => ProcessExit,
): ScriptedProcess {
  const calls: Command[] = [];
  return {
    calls,
    run(c) {
      calls.push(c);
      return script(c);
    },
  };
}

/** A process that exits 0 and prints `stdout`. */
export const exitedWith = (stdout: string, status = 0): ProcessExit => ({
  kind: "exited",
  status,
  stdout,
  stderr: "",
});

export interface MemoryFiles extends Files {
  readonly map: Map<string, Uint8Array>;
}

export function memoryFiles(
  initial: Readonly<Record<string, string | Uint8Array>> = {},
): MemoryFiles {
  const bytes = (v: string | Uint8Array) =>
    typeof v === "string" ? new TextEncoder().encode(v) : v;
  const map = new Map(
    Object.entries(initial).map(([k, v]) => [k, bytes(v)] as const),
  );
  return {
    map,
    isFile: (p) => map.has(p),
    readBytes: (p) => map.get(p) ?? null,
    writeAtomic: (p, b) => void map.set(p, b),
  };
}

export interface MemoryWorkspace extends Workspace {
  /** Every file written into a scratch directory, in order. */
  readonly written: {
    readonly name: string;
    readonly content: string;
    readonly mode: "read" | "exec";
  }[];
  /** How each `within` ended. */
  readonly ended: ("returned" | "threw")[];
}

export function memoryWorkspace(dir = "/scratch"): MemoryWorkspace {
  const written: MemoryWorkspace["written"] = [];
  const ended: ("returned" | "threw")[] = [];
  const scratch: Scratch = {
    dir: dir as AbsolutePath,
    write(name, content, mode) {
      written.push({ name, content, mode });
      return `${dir}/${name}` as AbsolutePath;
    },
  };
  return {
    written,
    ended,
    within<T>(_prefix: string, use: (s: Scratch) => NotAPromise<T>): T {
      try {
        const r = use(scratch);
        ended.push("returned");
        return r;
      } catch (e) {
        ended.push("threw");
        throw e;
      }
    },
  };
}

export interface FixedDownload extends Download {
  readonly urls: string[];
}

/** A `Download` that returns `body` for every URL, or fails with `detail` when `body` is a failure. */
export function fixedDownload(
  body: string | Uint8Array | { readonly detail: string },
): FixedDownload {
  const urls: string[] = [];
  return {
    urls,
    fetch(url) {
      urls.push(url);
      if (typeof body === "string") return ok(new TextEncoder().encode(body));
      return body instanceof Uint8Array ? ok(body) : err(body);
    },
  };
}

/** Every generic port at once — what a test hands an adapter built over several of them. */
export interface MemoryPorts {
  readonly run: RunProcess;
  readonly files: Files;
  readonly workspace: Workspace;
  readonly download: Download;
}

/** All four ports from in-memory parts; any part can be replaced. */
export function memoryPorts(over: Partial<MemoryPorts> = {}): MemoryPorts {
  return {
    run: scriptedProcess(() => exitedWith("")),
    files: memoryFiles(),
    workspace: memoryWorkspace(),
    download: fixedDownload({ detail: "no network in memory" }),
    ...over,
  };
}
