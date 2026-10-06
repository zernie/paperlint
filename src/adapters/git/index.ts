/**
 * `CommittedFiles` over git's index, through the process port: `git ls-files --error-unmatch` in the
 * file's directory. Exit 0 — tracked; exit 1 — not (untracked, or ignored, as a build's `refs.bib`
 * usually is).
 *
 * Every other outcome — no work tree (128), no git, a failed spawn — is "committed": outside git the
 * disk is the only state of the paper, and there is no fresh checkout for it to differ from.
 *
 * Not the case the repository's ban on git in a rule is about (`GIT_IN_A_RULE`, eslint.config.mjs):
 * that ban is on naming a commit, which maintenance deletes and a shallow checkout lacks. The index
 * names files, and a shallow checkout has all of them.
 */
import { basename, dirname } from "node:path";
import type { AbsolutePath } from "../../domain/paths.ts";
import type { CommittedFiles } from "../../ports/committed.ts";
import type { RunProcess } from "../../ports/process.ts";

/** Ten seconds: an index lookup takes milliseconds; a hung git must not hang a lint. */
const TIMEOUT_MS = 10_000;

/** The variables of an environment that are set: a child's whole environment is strings. */
const setOnly = (
  env: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(env).filter(
      (e): e is [string, string] => typeof e[1] === "string",
    ),
  );

/** `CommittedFiles` asking git, run by `run` with the environment `env` (git needs PATH and HOME). */
export const gitCommitted = (
  run: RunProcess,
  env: Readonly<Record<string, string | undefined>>,
): CommittedFiles => ({
  isCommitted: (p: AbsolutePath) => {
    const exit = run.run({
      file: "git",
      args: [
        "-C",
        dirname(p),
        "ls-files",
        "--error-unmatch",
        "--",
        basename(p),
      ],
      env: setOnly(env),
      timeoutMs: TIMEOUT_MS,
    });
    return !(exit.kind === "exited" && exit.status === 1);
  },
});
