/**
 * What the package ships: the paths `npm pack` would put in the tarball, from `files` in package.json.
 * `package/md-link-shipped` (eslint-rules/shipped-links.ts) judges the links of a shipped Markdown
 * file against this list, so the check moves with the definition of the package and keeps no second
 * list of its own.
 *
 * It runs `npm pack --dry-run --json --ignore-scripts`: no tarball is written, and no lifecycle script
 * (`prepare` is `tsc -b`) runs. The caller runs it once per lint run (eslint.config.mjs).
 */
import { absolutePath } from "./domain/paths.ts";
import type { RunProcess } from "./ports/process.ts";

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === "object" && v !== null;

/** The `path` of every file of every package in the JSON of `npm pack --json`; throws on any other shape. */
const pathsIn = (json: unknown): readonly string[] => {
  const shape = new Error(
    "`npm pack --json` gave a list of packages with files.",
  );
  if (!Array.isArray(json)) throw shape;
  return json.flatMap((pack: unknown) => {
    if (!isRecord(pack) || !Array.isArray(pack["files"])) throw shape;
    return pack["files"].map((f: unknown) => {
      if (!isRecord(f) || typeof f["path"] !== "string") throw shape;
      return f["path"];
    });
  });
};

/** Long enough for a cold npm on a slow disk; the command itself takes about three seconds. */
const TIMEOUT_MS = 120_000;

/**
 * The paths, relative to the package at `root`, that `npm pack` would ship. `env` is npm's whole
 * environment (the port never merges one in). A run that fails throws, saying how.
 */
export const packedPaths = (
  run: RunProcess,
  root: string,
  env: Readonly<Record<string, string>>,
): ReadonlySet<string> => {
  const exit = run.run({
    file: "npm",
    args: ["pack", "--dry-run", "--json", "--ignore-scripts"],
    env,
    timeoutMs: TIMEOUT_MS,
    cwd: absolutePath(root),
  });
  if (exit.kind !== "exited" || exit.status !== 0)
    throw new Error(
      `\`npm pack --dry-run\` in ${root} gave no pack list (${exit.kind === "exited" ? `exit ${String(exit.status)}: ${exit.stderr}` : exit.kind}); the links of the shipped Markdown cannot be judged without it.`,
    );
  return new Set(pathsIn(JSON.parse(exit.stdout)));
};
