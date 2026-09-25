/** The real `Io`: what a composition root hands the app layer. */
import type { Io } from "../../domain/ports.ts";
import { curlDownload } from "./download.io.ts";
import { nodeFiles } from "./files.io.ts";
import { spawnProcess, type SpawnSync } from "./process.io.ts";
import { tmpWorkspace } from "./workspace.io.ts";

export interface NodeAdapterOptions {
  /** Scratch directories and downloads go here. */
  readonly tmpDir: string;
  /** curl's environment (the proxy variables). */
  readonly env: Readonly<Record<string, string>>;
  /** `spawnSync` or a stand-in with its shape. */
  readonly spawn?: SpawnSync;
}

export function nodeAdapters(o: NodeAdapterOptions): Io {
  const run = spawnProcess(o.spawn);
  return {
    run,
    files: nodeFiles,
    workspace: tmpWorkspace(o.tmpDir),
    download: curlDownload({ run, env: o.env, tmpDir: o.tmpDir }),
  };
}

export { spawnProcess } from "./process.io.ts";
