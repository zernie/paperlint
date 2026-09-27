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
 * Arguments are the harness runner's (`npm test -- --no-skip`), as they were before.
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
  options: { stdio: "inherit" },
) => { readonly status: number | null };

export const SUITES: readonly Suite[] = [
  { name: "vitest", command: ["vitest", "run"] },
  { name: "harnesses", command: ["vigiles", "test", "--min=1"] },
];

/**
 * Run every suite, whatever the one before it returned, and name the ones that failed.
 * @returns 0 when every suite passed; otherwise the first failing suite's exit code (1 for a signal).
 */
export function runSuites(
  args: readonly string[],
  {
    spawn = spawnSync,
    err = console.error,
    suites = SUITES,
  }: {
    spawn?: Spawn;
    err?: (line: string) => void;
    suites?: readonly Suite[];
  } = {},
): number {
  const failed = suites.flatMap(({ name, command }) => {
    const [file, ...rest] = command;
    const r = spawn(file, [...rest, ...(name === "harnesses" ? args : [])], {
      stdio: "inherit",
    });
    return r.status === 0 ? [] : [{ name, code: r.status ?? 1 }];
  });
  for (const f of failed)
    err(
      `✗ ${f.name} failed (exit ${String(f.code)}) — its own report is above`,
    );
  const [first] = failed;
  return first === undefined ? 0 : first.code;
}

if (isMain(import.meta.url)) process.exit(runSuites(process.argv.slice(2)));
