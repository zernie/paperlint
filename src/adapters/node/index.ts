/**
 * Node's implementations of the generic ports: processes, files, scratch directories. What a
 * composition root builds and hands to the adapters that need them (banal's, for one).
 */
import type { Files } from "../../ports/files.ts";
import type { RunProcess } from "../../ports/process.ts";
import type { Workspace } from "../../ports/workspace.ts";
import { nodeFiles } from "./files.io.ts";
import { spawnProcess, type SpawnSync } from "./process.io.ts";
import { tmpWorkspace } from "./workspace.io.ts";

export interface NodeAdapterOptions {
  /** Scratch directories go here. */
  readonly tmpDir: string;
  /** `spawnSync` or a stand-in with its shape. */
  readonly spawn?: SpawnSync;
}

/** The node ports, built once at the root. */
export interface NodePorts {
  readonly run: RunProcess;
  readonly files: Files;
  readonly workspace: Workspace;
}

export function nodeAdapters(o: NodeAdapterOptions): NodePorts {
  return {
    run: spawnProcess(o.spawn),
    files: nodeFiles,
    workspace: tmpWorkspace(o.tmpDir),
  };
}

export { nodeFiles } from "./files.io.ts";
export { spawnProcess, type SpawnSync } from "./process.io.ts";
export { hostDirs } from "./host.io.ts";
