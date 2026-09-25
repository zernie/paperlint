/**
 * What the host knows and the environment does not say — the home, the temp directory, the cwd —
 * read once, and the banal runtime built from them: the parsed settings and the real `Io`.
 * A composition root calls this; nothing below it reads the host again.
 */
import { homedir, tmpdir } from "node:os";
import type { Io } from "../../core/ports.ts";
import {
  parseBanalSettings,
  type BanalSettings,
  type Environment,
  type HostDirs,
} from "../../core/banal/settings.ts";
import { nodeAdapters } from "./index.ts";
import type { SpawnSync } from "./process.ts";

export const hostDirs = (over: Partial<HostDirs> = {}): HostDirs => ({
  home: homedir(),
  tmp: tmpdir(),
  cwd: process.cwd(),
  ...over,
});

/** Everything the banal app functions take besides their own arguments. */
export interface BanalRuntime {
  readonly io: Io;
  readonly settings: BanalSettings;
}

export interface RuntimeOptions {
  /** Replaces a host directory: a test's temp home. */
  readonly dirs?: Partial<HostDirs>;
  /** `spawnSync` or a stand-in with its shape: a test records the calls through one. */
  readonly spawn?: SpawnSync;
}

/** The real runtime for `env`. */
export function nodeBanalRuntime(
  env: Environment,
  o: RuntimeOptions = {},
): BanalRuntime {
  const settings = parseBanalSettings(env, hostDirs(o.dirs));
  return {
    settings,
    io: nodeAdapters({
      tmpDir: settings.tmpDir,
      env: settings.processEnv,
      ...(o.spawn ? { spawn: o.spawn } : {}),
    }),
  };
}
