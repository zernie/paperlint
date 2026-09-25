/**
 * In-memory adapters for the app layer's tests: every port, no disk, no processes, no network.
 * Each one RECORDS what it was asked, so a test asserts on the calls instead of on side effects.
 */
import type { BanalStaging, StagedInput } from "../banal/invocation.ts";
import type {
  AbsolutePath,
  Command,
  Download,
  Files,
  Io,
  NotAPromise,
  ProcessExit,
  RunProcess,
  Scratch,
  Workspace,
} from "../../domain/ports.ts";
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
  /** Every staging `stage()` was given, in order. */
  readonly staged: BanalStaging[];
  /** How each `within` ended. */
  readonly ended: ("returned" | "threw")[];
}

export function memoryWorkspace(dir = "/scratch"): MemoryWorkspace {
  const staged: BanalStaging[] = [];
  const ended: ("returned" | "threw")[] = [];
  const scratch: Scratch = {
    dir: dir as AbsolutePath,
    stage(s): StagedInput {
      staged.push(s);
      const [xml, stub] = s.files;
      return {
        xml: `${dir}/${xml.name}`,
        stub: `${dir}/${stub.name}`,
      } as StagedInput;
    },
  };
  return {
    staged,
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

/** A whole `Io` from in-memory parts; any part can be replaced. */
export function memoryIo(over: Partial<Io> = {}): Io {
  return {
    run: scriptedProcess(() => exitedWith("")),
    files: memoryFiles(),
    workspace: memoryWorkspace(),
    download: fixedDownload({ detail: "no network in memory" }),
    ...over,
  };
}
