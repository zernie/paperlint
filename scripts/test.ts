/**
 * `npm test`: the unit tests (vitest), then the harnesses (`vigiles test`). BOTH always run.
 *
 * Until #52 this was `vitest run && vigiles test --min=1`. Under `npm run coverage` a single
 * failing vitest test then skipped every harness, and what the run printed last was c8's summary:
 * lines, branches and functions each some six points below the floor. The one failing test sat
 * above that, looking like a consequence rather than the cause. Running both suites keeps the
 * coverage report whole, so a failing test is reported as itself and the coverage figures still
 * mean what they say.
 *
 * Arguments are the harness runner's (`npm test -- --no-skip`), as they were before, except
 * `--shard=<i>/<n>`: that one goes to vitest, and the harnesses then run on shard 1 only (CI's macOS job).
 *
 * Both suites run the SOURCES: every child gets `--conditions=paperlint-source`, so `#lib/*` and
 * `#eslint-rules/*` resolve to `.ts`, not to `dist/`. This runner is the one owner of that
 * setting. When only `npm run coverage` passed it, a plain `npm test` loaded the rules twice —
 * `dist/` through `eslint.config.mjs`, `.ts` through the harness — and a harness comparing the two
 * failed on macOS CI, the one job that runs `npm test` bare.
 */
import { spawnSync } from "node:child_process";
import { isMain } from "../skills/paper-pipeline/scripts/consumer.mjs";

/** The two suites, in order: what a failure is named as, and the command. */
export interface Suite {
  readonly name: string;
  /** The program, then its arguments. */
  readonly command: readonly [string, ...string[]];
}

/** What `runSuites` needs from a finished process: its exit status, `null` when a signal ended it. */
export type Spawn = (
  file: string,
  args: readonly string[],
  options: { stdio: "inherit"; env: NodeJS.ProcessEnv },
) => { readonly status: number | null };

/** The condition that points package `imports` at the TypeScript sources instead of `dist/`. */
const SOURCE_CONDITION = "--conditions=paperlint-source";

/** `env` with the source condition first in NODE_OPTIONS, whatever the caller already had kept. */
export function withSources(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const own = env.NODE_OPTIONS?.trim();
  return {
    ...env,
    NODE_OPTIONS: own ? `${SOURCE_CONDITION} ${own}` : SOURCE_CONDITION,
  };
}

export const SUITES: readonly Suite[] = [
  { name: "vitest", command: ["vitest", "run", "--project", "unit"] },
  { name: "harnesses", command: ["vigiles", "test", "--min=1"] },
];

/** `--shard=<i>/<n>`, vitest's own form: which part of the unit tests a CI job runs. */
interface Shard {
  readonly arg: string;
  readonly index: number;
  readonly count: number;
}

const SHARD_PREFIX = "--shard=";

/** A whole number written in digits only (`"2"`), or null: `""`, `" 2"` and `"02"` are not. */
const digits = (s: string): number | null =>
  String(Number(s)) === s ? Number(s) : null;

/** One `--shard=<i>/<n>` argument, or null when it is not one with 1 ≤ i ≤ n. */
function shardOf(arg: string): Shard | null {
  const [i, n, ...extra] = arg.slice(SHARD_PREFIX.length).split("/");
  const index = digits(i ?? "");
  const count = digits(n ?? "");
  if (extra.length > 0 || index === null || count === null) return null;
  return index >= 1 && index <= count ? { arg, index, count } : null;
}

/** What the arguments say: the shard and the harness runner's own, or the argument that is no shard. */
type Split =
  | {
      readonly kind: "ok";
      readonly shard: Shard | null;
      readonly rest: readonly string[];
    }
  | { readonly kind: "bad"; readonly arg: string };

/**
 * The arguments split into the shard and the harness runner's own, or the argument that is no shard.
 * A malformed or repeated `--shard` is refused, never ignored: ignored, every shard would run every test.
 */
export function splitShard(args: readonly string[]): Split {
  const rest = args.filter((a) => !a.startsWith(SHARD_PREFIX));
  const [arg, second] = args.filter((a) => a.startsWith(SHARD_PREFIX));
  if (arg === undefined) return { kind: "ok", shard: null, rest };
  if (second !== undefined) return { kind: "bad", arg: second };
  const shard = shardOf(arg);
  return shard === null ? { kind: "bad", arg } : { kind: "ok", shard, rest };
}

/** The arguments a suite gets, or null when it does not run: the shard to vitest; the rest to the harnesses, which run on shard 1 only. */
const argsFor = (
  name: string,
  shard: Shard | null,
  rest: readonly string[],
): readonly string[] | null => {
  if (name === "vitest") return shard === null ? [] : [shard.arg];
  return shard === null || shard.index === 1 ? rest : null;
};

/** Each suite that runs under `split`, spawned in order whatever the one before returned: the failures. */
function runEach(
  suites: readonly Suite[],
  split: Extract<Split, { readonly kind: "ok" }>,
  spawn: Spawn,
  env: NodeJS.ProcessEnv,
): readonly { readonly name: string; readonly code: number }[] {
  return suites.flatMap(({ name, command }) => {
    const own = argsFor(name, split.shard, split.rest);
    if (own === null) return [];
    const [file, ...fixed] = command;
    const r = spawn(file, [...fixed, ...own], { stdio: "inherit", env });
    return r.status === 0 ? [] : [{ name, code: r.status ?? 1 }];
  });
}

/**
 * Run every suite, whatever the one before it returned, and name the ones that failed.
 * With `--shard=<i>/<n>`, vitest runs that part of the unit tests, and the harnesses run only on
 * shard 1, so a sharded CI run executes each of them once.
 * @returns 0 when every suite passed; otherwise the first failing suite's exit code (1 for a signal).
 */
export function runSuites(
  args: readonly string[],
  {
    spawn = spawnSync,
    err = console.error,
    suites = SUITES,
    env = process.env,
  }: {
    spawn?: Spawn;
    err?: (line: string) => void;
    suites?: readonly Suite[];
    env?: NodeJS.ProcessEnv;
  } = {},
): number {
  const split = splitShard(args);
  if (split.kind === "bad") {
    err(
      `✗ ${split.arg}: a shard is --shard=<i>/<n> with 1 ≤ i ≤ n (vitest's own form); nothing ran`,
    );
    return 2;
  }
  const failed = runEach(suites, split, spawn, withSources(env));
  for (const f of failed)
    err(
      `✗ ${f.name} failed (exit ${String(f.code)}) — its own report is above`,
    );
  const [first] = failed;
  return first === undefined ? 0 : first.code;
}

if (isMain(import.meta.url)) process.exit(runSuites(process.argv.slice(2)));
