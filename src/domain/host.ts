/**
 * The environment, as a VALUE. The composition root reads `process.env` and the host's directories
 * once and passes them in; nothing inside reads the environment again, so no signature below the
 * root carries `process`.
 */

export type Environment = Readonly<Record<string, string | undefined>>;

/** The three directories the host knows and the environment does not say. All absolute. */
export interface HostDirs {
  readonly home: string;
  readonly tmp: string;
  /** What a relative path from the environment is relative to. */
  readonly cwd: string;
}

/** An environment as a child process gets it: every value a string, none undefined. */
export const childEnv = (env: Environment): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter(
      (e): e is [string, string] => e[1] !== undefined,
    ),
  );
