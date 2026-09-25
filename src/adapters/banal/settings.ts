/**
 * banal's settings, parsed from the environment VALUE the composition root read once
 * (`domain/host.ts`): which banal the user named, where `rpp toolchain` keeps it, where scratch
 * directories go, and the environment perl and curl get. Nothing here reads the host itself.
 */
import { join, resolve } from "node:path";
import {
  childEnv,
  type Environment,
  type HostDirs,
} from "../../domain/host.ts";
import type { AbsolutePath } from "../../domain/paths.ts";

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
