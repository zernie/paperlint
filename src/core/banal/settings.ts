/**
 * The environment, as a VALUE. The composition root reads `process.env`, the home and the temp
 * directory once and parses them here; nothing below it reads the environment again, so no
 * signature carries `env` or `home`.
 */
import { join, resolve } from "node:path";
import type { AbsolutePath, Io } from "../ports.ts";

/** An explicit banal to use instead of rpp's (a path to the script). */
export const BANAL_ENV = "BANAL";
/** Where `rpp toolchain` stores banal. Default: `$XDG_CACHE_HOME/rpp/banal`, else `~/.cache/rpp/banal`. */
export const BANAL_DIR_ENV = "RPP_BANAL_DIR";

export interface BanalSettings {
  /** `$BANAL`: the user's explicit choice; null when unset. */
  readonly explicit: AbsolutePath | null;
  /** `$RPP_BANAL_DIR` › `$XDG_CACHE_HOME/rpp/banal` › `<home>/.cache/rpp/banal`. */
  readonly cacheDir: AbsolutePath;
  /** Where scratch directories go. */
  readonly tmpDir: AbsolutePath;
  /** The environment a child process (perl, curl) gets: every value a string, none undefined. */
  readonly processEnv: Readonly<Record<string, string>>;
}

/** The three directories the host knows and the environment does not say. All absolute. */
export interface HostDirs {
  readonly home: string;
  readonly tmp: string;
  /** What a relative `$BANAL` or `$RPP_BANAL_DIR` is relative to. */
  readonly cwd: string;
}

export type Environment = Readonly<Record<string, string | undefined>>;

/** An environment as a child process gets it: every value a string, none undefined. */
export const childEnv = (env: Environment): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );

/** `resolve` with an absolute base never consults the process's cwd. */
const absolute = (cwd: string, p: string): AbsolutePath =>
  resolve(cwd, p) as AbsolutePath;

/** An unset variable and an empty one mean the same: not set. */
const set = (v: string | undefined): string | null => (v ? v : null);

function cacheDirOf(env: Environment, d: HostDirs): string {
  return (
    set(env[BANAL_DIR_ENV]) ??
    join(set(env["XDG_CACHE_HOME"]) ?? join(d.home, ".cache"), "rpp", "banal")
  );
}

export function parseBanalSettings(
  env: Environment,
  dirs: HostDirs,
): BanalSettings {
  const explicit = set(env[BANAL_ENV]);
  return {
    explicit: explicit === null ? null : absolute(dirs.cwd, explicit),
    cacheDir: absolute(dirs.cwd, cacheDirOf(env, dirs)),
    tmpDir: absolute(dirs.cwd, dirs.tmp),
    processEnv: childEnv(env),
  };
}

/** Everything the banal app functions take besides their own arguments: the ports and the settings. */
export interface BanalRuntime {
  readonly io: Io;
  readonly settings: BanalSettings;
}
